export interface MemoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
}

export class MemoryManager {
  private readonly messages: MemoryMessage[] = []

  add(role: MemoryMessage['role'], content: string): void {
    this.messages.push({
      role,
      content,
      createdAt: new Date().toISOString(),
    })
  }

  snapshot(maxMessages = 20): MemoryMessage[] {
    return this.messages.slice(-maxMessages)
  }

  transcript(maxMessages = 20): string {
    return this.snapshot(maxMessages)
      .map(message => `[${message.role.toUpperCase()}] ${message.content}`)
      .join('\n\n')
  }

  clear(): void {
    this.messages.length = 0
  }
}
