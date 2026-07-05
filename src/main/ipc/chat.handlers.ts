import type { IpcMainInvokeEvent } from 'electron'
import type { Result } from '@shared/types/ipc.types'
import type { Chat, Message } from '@shared/types/chat.types'
import {
  ChatCreatePayloadSchema,
  ChatDeletePayloadSchema,
  MessageListPayloadSchema,
  MessageCreatePayloadSchema,
} from '@shared/validation/settings.schema'
import { getDb } from '../storage/db-client'
import { ChatsRepository } from '../storage/repositories/chats.repository'
import { MessagesRepository } from '../storage/repositories/messages.repository'

function chatsRepo(): ChatsRepository {
  return new ChatsRepository(getDb())
}
function messagesRepo(): MessagesRepository {
  return new MessagesRepository(getDb())
}

export function handleChatList(_e: IpcMainInvokeEvent, _payload: unknown): Result<Chat[]> {
  return { ok: true, value: chatsRepo().list() }
}

export function handleChatCreate(_e: IpcMainInvokeEvent, payload: unknown): Result<Chat> {
  const parsed = ChatCreatePayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  const id = crypto.randomUUID()
  const title = parsed.data.title ?? 'New Chat'
  return { ok: true, value: chatsRepo().create(id, title) }
}

export function handleChatDelete(_e: IpcMainInvokeEvent, payload: unknown): Result<void> {
  const parsed = ChatDeletePayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  chatsRepo().delete(parsed.data.id)
  return { ok: true, value: undefined }
}

export function handleMessageList(_e: IpcMainInvokeEvent, payload: unknown): Result<Message[]> {
  const parsed = MessageListPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: messagesRepo().listByChatId(parsed.data.chatId) }
}

export function handleMessageCreate(_e: IpcMainInvokeEvent, payload: unknown): Result<Message> {
  const parsed = MessageCreatePayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  const { chatId, role, content, model } = parsed.data
  const id = crypto.randomUUID()
  return { ok: true, value: messagesRepo().create(id, chatId, role, content, model ?? null) }
}
