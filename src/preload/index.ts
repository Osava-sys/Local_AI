import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEventMap, ExposedApi, ModelEventMap } from '@shared/types/ipc.types'

const api: ExposedApi = {
  ping: () => ipcRenderer.invoke('ping'),

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', { key }),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:getAll', {}),
  },

  chat: {
    list: () => ipcRenderer.invoke('chat:list', {}),
    create: (title) => ipcRenderer.invoke('chat:create', { title }),
    delete: (id) => ipcRenderer.invoke('chat:delete', { id }),
  },

  message: {
    list: (chatId) => ipcRenderer.invoke('message:list', { chatId }),
    create: (chatId, role, content, model) =>
      ipcRenderer.invoke('message:create', { chatId, role, content, model }),
  },

  agent: {
    start: (workspaceId, prompt, options) => ipcRenderer.invoke('agent:start', { workspaceId, prompt, options }),
    stop: (runId) => ipcRenderer.invoke('agent:stop', { runId }),
    get: (runId) => ipcRenderer.invoke('agent:get', { runId }),
    on: (event, callback) => {
      const channel = event === 'step'
        ? 'agent:stepAdded'
        : event === 'state'
          ? 'agent:stateChanged'
          : 'agent:error'
      const listener = (_: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as AgentEventMap[typeof event])
      }
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },

  model: {
    catalog: () => ipcRenderer.invoke('model:catalog', {}),
    list: () => ipcRenderer.invoke('model:list', {}),
    selectGguf: () => ipcRenderer.invoke('model:selectGguf', {}),
    registerLocal: (path, name) => ipcRenderer.invoke('model:registerLocal', { path, name }),
    download: (request) => ipcRenderer.invoke('model:download', request),
    load: (options) => ipcRenderer.invoke('model:load', options),
    unload: () => ipcRenderer.invoke('model:unload', {}),
    status: () => ipcRenderer.invoke('model:status', {}),
    on: (event, callback) => {
      const channel = event === 'downloadProgress' ? 'model:downloadProgress' : 'model:runtimeState'
      const listener = (_: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as ModelEventMap[typeof event])
      }
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
