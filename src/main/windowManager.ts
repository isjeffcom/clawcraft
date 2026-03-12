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

function setTrafficLights(visible: boolean) {
  if (process.platform === 'darwin' && mainWindow) {
    mainWindow.setWindowButtonVisibility(visible)
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
    // 保留原生 frame，让 Mac 三个按钮在正常模式可见
    titleBarStyle: 'hidden',
    // 透明背景支持桌宠模式
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    alwaysOnTop: compact,
    resizable: !compact,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 创建后立刻根据初始模式控制 traffic lights
  mainWindow.once('ready-to-show', () => {
    setTrafficLights(!compact)
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
    mainWindow.setResizable(false)
    setTrafficLights(false)
    mainWindow.setBounds(bounds, true)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setResizable(true)
    mainWindow.setSize(1440, 920, true)
    mainWindow.center()
    // center() 是异步的，稍微延迟再显示 traffic lights 避免闪烁
    setTimeout(() => setTrafficLights(true), 150)
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
