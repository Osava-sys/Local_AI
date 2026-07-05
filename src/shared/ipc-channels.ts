export const InvokeChannels = {
  // settings
  'settings:get': { direction: 'renderer→main' },
  'settings:set': { direction: 'renderer→main' },
  'settings:getAll': { direction: 'renderer→main' },
  // chat
  'chat:list': { direction: 'renderer→main' },
  'chat:create': { direction: 'renderer→main' },
  'chat:delete': { direction: 'renderer→main' },
  'message:list': { direction: 'renderer→main' },
  'message:create': { direction: 'renderer→main' },
  // agent
  'agent:start': { direction: 'renderer→main' },
  'agent:stop': { direction: 'renderer→main' },
  'agent:get': { direction: 'renderer→main' },
  // models
  'model:catalog': { direction: 'renderer→main' },
  'model:list': { direction: 'renderer→main' },
  'model:selectGguf': { direction: 'renderer→main' },
  'model:selectLlamaServer': { direction: 'renderer→main' },
  'model:registerLocal': { direction: 'renderer→main' },
  'model:download': { direction: 'renderer→main' },
  'model:load': { direction: 'renderer→main' },
  'model:unload': { direction: 'renderer→main' },
  'model:status': { direction: 'renderer→main' },
  // approvals
  'approval:list': { direction: 'renderer→main' },
  'approval:approve': { direction: 'renderer→main' },
  'approval:reject': { direction: 'renderer→main' },
} as const

export const EventChannels = {
  'agent:stateChanged': { direction: 'main→renderer' },
  'agent:stepAdded': { direction: 'main→renderer' },
  'agent:error': { direction: 'main→renderer' },
  'model:downloadProgress': { direction: 'main→renderer' },
  'model:runtimeState': { direction: 'main→renderer' },
  'approval:requested': { direction: 'main→renderer' },
  'approval:resolved': { direction: 'main→renderer' },
} as const

export type InvokeChannel = keyof typeof InvokeChannels
export type EventChannel = keyof typeof EventChannels
export type AnyChannel = InvokeChannel | EventChannel
