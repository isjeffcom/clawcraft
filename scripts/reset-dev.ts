import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const shouldRunDev = process.argv.includes('--run')
const dryRun = process.argv.includes('--dry-run')

function getPathsToDelete(): string[] {
  const home = homedir()
  const candidates = [
    resolve(root, 'out'),
    resolve(root, 'release'),
    resolve(root, '.tmp'),
    resolve(root, 'playwright-report'),
    resolve(root, 'test-results'),
    resolve(root, 'node_modules/.vite'),
    resolve(root, '.vite'),
    join(home, '.config', 'clawcraft'),
    join(home, '.config', 'Clawcraft'),
    join(home, '.cache', 'clawcraft'),
    join(home, '.cache', 'Clawcraft'),
    join(home, 'Library', 'Application Support', 'clawcraft'),
    join(home, 'Library', 'Application Support', 'Clawcraft'),
    join(home, 'Library', 'Caches', 'clawcraft'),
    join(home, 'Library', 'Caches', 'Clawcraft')
  ]

  const appData = process.env.APPDATA
  const localAppData = process.env.LOCALAPPDATA

  if (appData) {
    candidates.push(join(appData, 'clawcraft'))
    candidates.push(join(appData, 'Clawcraft'))
  }

  if (localAppData) {
    candidates.push(join(localAppData, 'clawcraft'))
    candidates.push(join(localAppData, 'Clawcraft'))
  }

  return [...new Set(candidates)]
}

function clearCaches(): void {
  for (const target of getPathsToDelete()) {
    try {
      if (dryRun) {
        console.log(`[dry-run] remove: ${target}`)
      } else {
        rmSync(target, { recursive: true, force: true })
        console.log(`removed: ${target}`)
      }
    } catch (error) {
      console.warn(`skip: ${target} -> ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function runDev(): void {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(command, ['run', 'dev'], {
    cwd: root,
    stdio: 'inherit'
  })

  child.on('exit', (code) => {
    process.exitCode = code ?? 0
  })
}

clearCaches()

if (shouldRunDev) {
  if (dryRun) {
    console.log('dry-run complete, skip starting dev server.')
  } else {
    console.log('cache reset complete, starting dev server...')
    runDev()
  }
} else if (dryRun) {
  console.log('dry-run complete.')
} else {
  console.log('cache reset complete.')
}
