export type ChatRole = 'user' | 'assistant' | 'system'

export interface Chat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  chatId: string
  role: ChatRole
  content: string
  model: string | null
  createdAt: string
}

export interface CreateChatPayload {
  title?: string
}

export interface CreateMessagePayload {
  chatId: string
  role: ChatRole
  content: string
  model?: string
}
