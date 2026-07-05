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
    "scanType": "connect",
    "timeoutMs": 30000
  }
}
Utilise cet outil pour les tests TCP de ports et les vérifications de connectivité locales. Ne lance pas PowerShell/Test-NetConnection via shell.tool.ts pour tester un port : network.tool.ts fournit un fallback TCP interne contrôlé. Utilise scanType="connect" pour confirmer ouvert/fermé et scanType="version" seulement si tu veux explicitement tenter nmap/service detection.`,

  nmap: `Pour un scan Nmap, préfère nmap.tool.ts à shell.tool.ts :
{
  "tool": "nmap.tool.ts",
  "args": {
    "target": "127.0.0.1",
    "ports": [22, 80, 443],
    "scanType": "version",
    "timing": "T3",
    "timeoutMs": 300000
  }
}`,

  gobuster: `Pour une énumération web/DNS, utilise gobuster.tool.ts :
{
  "tool": "gobuster.tool.ts",
  "args": {
    "mode": "dir",
    "url": "http://127.0.0.1:8080",
    "wordlist": "wordlists/common.txt",
    "threads": 10
  }
}`,

  sqlmap: `Pour un test SQLi autorisé, utilise sqlmap.tool.ts. Cet outil est critique et nécessite approbation :
{
  "tool": "sqlmap.tool.ts",
  "args": {
    "url": "http://127.0.0.1/item?id=1",
    "level": 1,
    "risk": 1
  }
}`,

  parser: `Pour réduire des logs bruts avant raisonnement, utilise parser.tool.ts :
{
  "tool": "parser.tool.ts",
  "args": {
    "text": "raw nmap/nikto/sqlmap output",
    "source": "nmap"
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
}

Pour chercher des fichiers par nom dans le workspace autorisé :
{
  "tool": "filesystem.tool.ts",
  "args": {
    "path": ".",
    "mode": "search",
    "pattern": ["docker-compose.yml", ".env", "*.conf"],
    "recursive": true,
    "maxResults": 50,
    "timeoutMs": 15000
  }
}`,
} as const
