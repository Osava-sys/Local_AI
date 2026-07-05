import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import type { ExposedApi } from '@shared/types/ipc.types'

declare global {
  interface Window {
    api: ExposedApi
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
