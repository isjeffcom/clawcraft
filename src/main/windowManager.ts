import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { WindowMode } from '../shared/contracts'

let mainWindow: BrowserWindow | null = null
let currentMode: WindowMode = 'standard'

function getCompactBounds() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const compactWidth = 420
  const compactHeight = 320
  return {
    width: compactWidth,
    height: compactHeight,
    x: Math.max(0, width - compactWidth - 24),
    y: Math.max(0, height - compactHeight - 24)
  }
}

export function createMainWindow(initialMode: WindowMode): BrowserWindow {
  currentMode = initialMode
  const compact = initialMode === 'compact'
  const compactBounds = getCompactBounds()

  mainWindow = new BrowserWindow({
    width: compact ? compactBounds.width : 1440,
    height: compact ? compactBounds.height : 920,
    minWidth: 360,
    minHeight: 260,
    x: compact ? compactBounds.x : undefined,
    y: compact ? compactBounds.y : undefined,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    alwaysOnTop: compact,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function toggleWindowMode(nextMode: WindowMode): WindowMode {
  currentMode = nextMode
  if (!mainWindow) return currentMode

  if (nextMode === 'compact') {
    const bounds = getCompactBounds()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setBounds(bounds, true)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setSize(1440, 920)
    mainWindow.center()
  }

  return currentMode
}

export function getWindowMode(): WindowMode {
  return currentMode
}

export function toggleWindowMaximize(): boolean {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return false
  }
  mainWindow.maximize()
  return true
}
