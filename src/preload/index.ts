import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, ChatRequest, PixelLabGenerateRequest, SaveDraft, WindowMode, WorldSave } from '../shared/contracts'
import { IPC_CHANNELS } from '../shared/ipc'

const api = {
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.BOOTSTRAP),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  listSaves: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_SAVES),
  createSave: (draft: SaveDraft) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SAVE, draft),
  loadSave: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_SAVE, id),
  writeSave: (save: WorldSave) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORLD, save),
  chatWithAdmin: (request: ChatRequest) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_ADMIN, request),
  getPixelLabBalance: () => ipcRenderer.invoke(IPC_CHANNELS.PIXELLAB_BALANCE),
  generatePixelLabImage: (request: PixelLabGenerateRequest) => ipcRenderer.invoke(IPC_CHANNELS.PIXELLAB_GENERATE, request),
  toggleWindowMode: (mode: WindowMode) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_WINDOW_MODE, mode),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleWindowMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
}

contextBridge.exposeInMainWorld('clawcraft', api)

export type ClawcraftApi = typeof api
