import { arch, hostname, release } from 'os'
import { detectTools } from '../../sandbox/tool-availability'

/**
 * Live description of the host the sandbox runs on. Injected into every agent
 * prompt so the model picks OS-appropriate commands instead of guessing
 * (e.g. it will not try Unix-only `ss`/`lsof`/`uname` on Windows) and does not
 * choose a security tool that is not installed.
 */
export function buildEnvironmentPrompt(): string {
  const platform = process.platform
  const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'

  const lines = [
    "# Environnement d'exécution",
    `- Runtime OS : ${osName} (${platform}, ${arch()})`,
    `- Version noyau/runtime : ${release()} (information technique, pas un nom produit ni une édition).`,
    `- Hôte : ${hostname()}`,
    '- Les commandes sont lancées directement (shell:false) : PAS de pipes, redirections ni opérateurs (&&, |, >, ;). Une seule commande + arguments par appel.',
  ]

  if (platform === 'win32') {
    lines.push(
      '- IMPORTANT : tu es sur Windows. Les outils Unix (ss, lsof, uname, ip, cat, grep, netstat -tlnp) ne sont PAS disponibles ou ont une autre syntaxe.',
      '- La version noyau Windows 10.0.x ne prouve PAS que le produit est Windows 10. Ne déduis jamais Windows 10/11 ni Pro/Home/Enterprise sans une observation explicite.',
      '- `cmd /c ver` donne seulement la version noyau/build. Si tu as besoin du nom produit/édition, demande une commande dédiée et cite sa sortie exacte.',
      '- Équivalents Windows à privilégier : ports/connexions → `netstat -ano` ; processus → `tasklist` ; config réseau → `ipconfig /all` ; nom machine → `hostname` ; version noyau → `cmd /c ver` ; recherche texte → `findstr` ; scan de ports → `nmap` (si installé).',
      '- `tasklist /fi "PID eq X" /fi "PID eq Y"` ne cherche PAS plusieurs PID : Windows combine ces filtres en AND. Pour plusieurs PID, utilise un appel par PID, ou `tasklist` complet et laisse le sandbox/parser résumer.',
      '- Évite `powershell -Command` pour les diagnostics courants : utilise `network.tool.ts` pour tester des ports TCP, `netstat -ano` pour les sockets et `tasklist` pour les processus.'
    )
  } else {
    lines.push(
      `- Outils Unix usuels disponibles : ss, lsof, netstat, ps, uname, ip, cat, grep, nmap (selon installation).`
    )
  }

  lines.push(
    '',
    '# Binaires CLI de sécurité détectés',
    '- Cette section concerne les exécutables système (nmap/gobuster/sqlmap), pas les wrappers Nexus `*.tool.ts` enregistrés.',
    '- Un wrapper comme `gobuster.tool.ts` peut exister dans Nexus même si le binaire CLI `gobuster` est absent du PATH.',
    "- Si le binaire requis est INDISPONIBLE, n'écris pas que le wrapper `*.tool.ts` est indisponible; écris plutôt que son backend CLI est indisponible."
  )
  for (const tool of detectTools()) {
    lines.push(`- ${tool.name} : ${tool.available ? 'disponible' : 'INDISPONIBLE'}`)
  }
  lines.push(
    "- Si un binaire CLI est INDISPONIBLE, n'émets pas d'appel vers le wrapper qui dépend exclusivement de ce binaire. Utilise une alternative (ex: network.tool.ts pour tester des ports TCP quand le binaire nmap est absent, curl ciblé quand gobuster est absent)."
  )

  return lines.join('\n')
}
