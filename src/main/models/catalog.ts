import type { ModelCatalogEntry } from '@shared/types/model.types'

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'qwen3-uncensored-9b-q8',
    name: 'Qwen 9B Uncensored Q8_0',
    family: 'Qwen',
    parameterSize: '9B',
    quantization: 'Q8_0',
    format: 'gguf',
    recommendedContext: 32768,
    notes: 'Profil local principal. Colle une URL GGUF directe ou enregistre le fichier déjà téléchargé.',
  },
  {
    id: 'qwen2-5-coder-7b-q8',
    name: 'Qwen Coder 7B Q8_0',
    family: 'Qwen Coder',
    parameterSize: '7B',
    quantization: 'Q8_0',
    format: 'gguf',
    recommendedContext: 32768,
    notes: 'Bon choix pour analyse de code et automatisation défensive.',
  },
  {
    id: 'mistral-7b-instruct-q8',
    name: 'Mistral 7B Instruct Q8_0',
    family: 'Mistral',
    parameterSize: '7B',
    quantization: 'Q8_0',
    format: 'gguf',
    recommendedContext: 32768,
    notes: 'Modèle généraliste léger pour workflows locaux.',
  },
]

export function listCatalogModels(): ModelCatalogEntry[] {
  return MODEL_CATALOG
}
