import { app, ipcMain } from 'electron'
import { join } from 'path'
import { createMainWindow } from './app/window-manager.js'
import { loadConfig } from './config/config-loader.js'
import { initSettingsService } from './config/settings.js'
import { initDb } from './storage/db.js'
import { setDb } from './storage/db-client.js'
import { getDbPath, getMigrationsDir } from './config/paths.js'
import { registerIpcHandlers } from './ipc/router.js'

const configDir = join(app.getAppPath(), 'config')
const config = loadConfig(configDir)
console.log(`[init] config loaded — logLevel=${config.app.logLevel}`)

const db = initDb(getDbPath(), getMigrationsDir())
setDb(db)

initSettingsService(db)

ipcMain.handle('ping', () => 'pong')
registerIpcHandlers()

app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', createMainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
