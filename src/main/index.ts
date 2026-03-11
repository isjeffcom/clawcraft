import { app, ipcMain } from 'electron'
import { chatRequestSchema, windowModeSchema, worldSaveSchema, type AppSettings } from '../shared/contracts'
import { IPC_CHANNELS } from '../shared/ipc'
import { chatWithAdmin } from './llm'
import { createSave, getBootstrapState, getSettings, listSaves, loadSave, saveSettings, writeSave } from './storage'
import { createMainWindow, getMainWindow, toggleWindowMode } from './windowManager'

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BOOTSTRAP, () => getBootstrapState())
  ipcMain.handle(IPC_CHANNELS.LIST_SAVES, () => listSaves())
  ipcMain.handle(IPC_CHANNELS.CREATE_SAVE, (_event, draft) => createSave(draft))
  ipcMain.handle(IPC_CHANNELS.LOAD_SAVE, (_event, id: string) => loadSave(id))
  ipcMain.handle(IPC_CHANNELS.SAVE_WORLD, (_event, save) => writeSave(worldSaveSchema.parse(save)))
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_event, settings: AppSettings) => saveSettings(settings))
  ipcMain.handle(IPC_CHANNELS.CHAT_ADMIN, (_event, request) => chatWithAdmin(chatRequestSchema.parse(request)))
  ipcMain.handle(IPC_CHANNELS.TOGGLE_WINDOW_MODE, (_event, nextMode) => {
    const parsedMode = windowModeSchema.parse(nextMode)
    const settings = getSettings()
    saveSettings({
      ...settings,
      compactMode: parsedMode === 'compact'
    })
    return toggleWindowMode(parsedMode)
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize()
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    getMainWindow()?.close()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  const bootstrap = getBootstrapState()
  createMainWindow(bootstrap.windowMode)

  app.on('activate', () => {
    if (!getMainWindow()) {
      createMainWindow(getBootstrapState().windowMode)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
