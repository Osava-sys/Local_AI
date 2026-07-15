import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** Resolves the packaged app icon, tolerating dev (source tree) and prod (asar) layouts. */
function resolveAppIcon(): string | undefined {
  const candidates = [
    join(import.meta.dirname, '../../resources/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png'),
  ]
  return candidates.find(candidate => candidate && existsSync(candidate))
}

export function createMainWindow(): BrowserWindow {
  const icon = resolveAppIcon()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'NEXUS',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // En dev, electron-vite expose l'URL du dev server via ELECTRON_RENDERER_URL.
  // En production, on charge le fichier buildé.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}
