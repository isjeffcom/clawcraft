import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import {
  appSettingsSchema,
  bootstrapStateSchema,
  createDefaultBaseUrl,
  createDefaultModel,
  defaultAppSettings,
  saveDraftSchema,
  type AppSettings,
  type BootstrapState,
  type SaveDraft,
  type SaveMeta,
  type WorldSave,
  worldSaveSchema
} from '../shared/contracts'
import { createNewWorldSave, deriveSaveMeta, migrateWorldSave } from '../shared/game'

type PersistedState = {
  settings: AppSettings
}

function encodeSecret(value: string): string {
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return Buffer.from(safeStorage.encryptString(value)).toString('base64')
    }
  } catch {
    return `plain:${value}`
  }
  return `plain:${value}`
}

function decodeSecret(value: string): string {
  if (!value) return ''
  try {
    if (value.startsWith('plain:')) {
      return value.slice('plain:'.length)
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function getSavesDirectory(): string {
  const directory = join(app.getPath('userData'), 'saves')
  mkdirSync(directory, { recursive: true })
  return directory
}

function getSettingsPath(): string {
  const directory = app.getPath('userData')
  mkdirSync(directory, { recursive: true })
  return join(directory, 'settings.json')
}

function getSavePath(id: string): string {
  return join(getSavesDirectory(), `${id}.json`)
}

function readPersistedState(): PersistedState {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return {
      settings: defaultAppSettings
    }
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PersistedState
  } catch {
    return {
      settings: defaultAppSettings
    }
  }
}

function writePersistedState(state: PersistedState): void {
  writeFileSync(getSettingsPath(), JSON.stringify(state, null, 2), 'utf8')
}

export function getSettings(): AppSettings {
  const raw = readPersistedState().settings ?? defaultAppSettings
  const provider = raw.provider ?? defaultAppSettings.provider
  const parsed = appSettingsSchema.parse({
    ...defaultAppSettings,
    ...raw,
    apiKey: decodeSecret(raw.apiKey),
    baseUrl: raw.baseUrl || createDefaultBaseUrl(provider),
    model:
      raw.model && !(provider === 'minimax' && raw.model.startsWith('gpt-'))
        ? raw.model
        : createDefaultModel(provider)
  })
  return parsed
}

export function saveSettings(input: AppSettings): AppSettings {
  const parsed = appSettingsSchema.parse({
    ...input,
    baseUrl: input.baseUrl || createDefaultBaseUrl(input.provider),
    model: input.model || createDefaultModel(input.provider)
  })
  writePersistedState({
    settings: {
      ...parsed,
      apiKey: encodeSecret(parsed.apiKey)
    }
  })
  return parsed
}

export function listSaves(): SaveMeta[] {
  const directory = getSavesDirectory()
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.json'))
    .flatMap((filename) => {
      try {
        const text = readFileSync(join(directory, filename), 'utf8')
        const raw = JSON.parse(text)
        const save = worldSaveSchema.safeParse(raw)
        const migrated = save.success ? save.data : migrateWorldSave(raw)
        return [deriveSaveMeta(migrated, migrated.meta.updatedAt)]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
}

export function loadSave(id: string): WorldSave {
  const text = readFileSync(getSavePath(id), 'utf8')
  const raw = JSON.parse(text)
  const parsed = worldSaveSchema.safeParse(raw)
  return parsed.success ? parsed.data : migrateWorldSave(raw)
}

export function writeSave(save: WorldSave): SaveMeta {
  const now = Date.now()
  const parsed = worldSaveSchema.parse({
    ...save,
    meta: deriveSaveMeta(save, now)
  })
  writeFileSync(getSavePath(parsed.meta.id), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed.meta
}

export function createSave(draft: SaveDraft): WorldSave {
  const parsedDraft = saveDraftSchema.parse(draft)
  const save = createNewWorldSave(parsedDraft)
  writeSave(save)
  return save
}

export function getBootstrapState(): BootstrapState {
  return bootstrapStateSchema.parse({
    settings: getSettings(),
    saves: listSaves(),
    windowMode: getSettings().compactMode ? 'compact' : 'standard'
  })
}
