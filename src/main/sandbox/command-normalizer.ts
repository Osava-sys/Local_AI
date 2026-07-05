export interface NormalizedCommand {
  command: string
  args: string[]
}

export function splitCommandLine(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if ((char === '"' || char === "'") && !quote) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (/\s/.test(char) && !quote) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

export function normalizeCommand(command: string, args: string[] = []): NormalizedCommand {
  if (args.length > 0) return { command, args }
  const [head, ...tail] = splitCommandLine(command)
  return {
    command: head ?? command,
    args: tail,
  }
}
