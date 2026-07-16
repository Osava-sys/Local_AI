import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import type { ExposedApi } from '@shared/types/ipc.types'
import { createDevBrowserApi } from './lib/dev-browser-api'
import './styles.css'

declare global {
  interface Window {
    api: ExposedApi
  }
}

if (import.meta.env.DEV && !window.api) {
  window.api = createDevBrowserApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
