import * as z from 'zod'

export const AppConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  }),
  ollama: z.object({
    host: z.string().url(),
    timeout: z.number().int().positive(),
  }),
  models: z.object({
    defaultModel: z.string(),
    catalog: z.array(z.string()),
  }),
  ui: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
  }),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

export const SettingsGetPayloadSchema = z.object({
  key: z.string().min(1).max(128),
})

export const SettingsSetPayloadSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string().max(65536),
})

export const ChatCreatePayloadSchema = z.object({
  title: z.string().max(256).optional(),
})

export const ChatDeletePayloadSchema = z.object({
  id: z.string().uuid(),
})

export const MessageListPayloadSchema = z.object({
  chatId: z.string().uuid(),
})

export const MessageCreatePayloadSchema = z.object({
  chatId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  model: z.string().optional(),
})
