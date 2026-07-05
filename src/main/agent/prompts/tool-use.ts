export const TOOL_USE_PROMPTS = {
  shell: `Pour exécuter une commande via shell.tool.ts, utilise ce format JSON :
{
  "tool": "shell.tool.ts",
  "args": {
    "command": "nmap",
    "args": ["-sV", "localhost"],
    "cwd": ".",
    "timeoutMs": 30000,
    "environment": {}
  }
}`,

  network: `Pour scanner un réseau via network.tool.ts :
{
  "tool": "network.tool.ts",
  "args": {
    "target": "127.0.0.1",
    "ports": [22, 80, 443],
    "scanType": "version",
    "timeoutMs": 30000
  }
}`,

  filesystem: `Pour lire un fichier via filesystem.tool.ts :
{
  "tool": "filesystem.tool.ts",
  "args": {
    "path": "README.md",
    "mode": "read",
    "maxSizeMB": 5,
    "recursive": false
  }
}`,
} as const
