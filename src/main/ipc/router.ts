import { ipcMain } from 'electron'
import { InvokeChannels } from '@shared/ipc-channels'
import { handleSettingsGet, handleSettingsSet, handleSettingsGetAll } from './settings.handlers'
import { handleChatList, handleChatCreate, handleChatDelete, handleMessageList, handleMessageCreate } from './chat.handlers'
import { handleAgentGet, handleAgentStart, handleAgentStop } from './agent.handlers'
import {
  handleModelCatalog,
  handleModelDownload,
  handleModelList,
  handleModelLoad,
  handleModelRegisterLocal,
  handleModelSelectGguf,
  handleModelSelectLlamaServer,
  handleModelStatus,
  handleModelUnload,
} from './model.handlers'
import {
  handleApprovalApprove,
  handleApprovalList,
  handleApprovalReject,
  registerApprovalEventForwarding,
} from './approval.handlers'

const handlers: Record<keyof typeof InvokeChannels, (e: Electron.IpcMainInvokeEvent, payload: unknown) => unknown> = {
  'settings:get': handleSettingsGet,
  'settings:set': handleSettingsSet,
  'settings:getAll': handleSettingsGetAll,
  'chat:list': handleChatList,
  'chat:create': handleChatCreate,
  'chat:delete': handleChatDelete,
  'message:list': handleMessageList,
  'message:create': handleMessageCreate,
  'agent:start': handleAgentStart,
  'agent:stop': handleAgentStop,
  'agent:get': handleAgentGet,
  'model:catalog': handleModelCatalog,
  'model:list': handleModelList,
  'model:selectGguf': handleModelSelectGguf,
  'model:selectLlamaServer': handleModelSelectLlamaServer,
  'model:registerLocal': handleModelRegisterLocal,
  'model:download': handleModelDownload,
  'model:load': handleModelLoad,
  'model:unload': handleModelUnload,
  'model:status': handleModelStatus,
  'approval:list': handleApprovalList,
  'approval:approve': handleApprovalApprove,
  'approval:reject': handleApprovalReject,
}

export function registerIpcHandlers(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }
  registerApprovalEventForwarding()
}
