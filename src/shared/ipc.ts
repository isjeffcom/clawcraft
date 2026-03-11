export const IPC_CHANNELS = {
  BOOTSTRAP: 'app:bootstrap',
  SAVE_SETTINGS: 'settings:save',
  LIST_SAVES: 'saves:list',
  CREATE_SAVE: 'saves:create',
  LOAD_SAVE: 'saves:load',
  SAVE_WORLD: 'saves:write',
  TOGGLE_WINDOW_MODE: 'window:toggle-mode',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_CLOSE: 'window:close',
  CHAT_ADMIN: 'agent:chat-admin'
} as const
