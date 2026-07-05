import * as z from 'zod'

export const ModelRegisterLocalPayloadSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).max(256).optional(),
})

export const ModelDownloadPayloadSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(256).optional(),
  filename: z.string().min(1).max(256).optional(),
})

export const ModelLoadPayloadSchema = z.object({
  modelId: z.string().uuid(),
  device: z.enum(['cpu', 'gpu']),
  executablePath: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  contextLength: z.number().int().min(512).max(262144).optional(),
  gpuLayers: z.number().int().min(0).max(200).optional(),
  threads: z.number().int().min(1).max(128).optional(),
  batchSize: z.number().int().min(1).max(8192).optional(),
  flashAttention: z.boolean().optional(),
  mmprojPath: z.string().min(1).optional(),
})
