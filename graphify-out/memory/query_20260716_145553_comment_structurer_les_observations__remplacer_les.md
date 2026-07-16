---
type: "query"
date: "2026-07-16T14:55:53.152211+00:00"
question: "Comment structurer les observations, remplacer les badges par des notifications et refondre la sidebar NEXUS ?"
contributor: "graphify"
source_nodes: ["AppShell()", "Sidebar()", "AgentRuns()", "SandboxExecutor"]
---

# Q: Comment structurer les observations, remplacer les badges par des notifications et refondre la sidebar NEXUS ?

## Answer

NEXUS parse maintenant ipconfig en preuves reseau structurees partagees entre sandbox et renderer; ObservationView rend reseau, sockets, processus, ports et donnees cle-valeur avec sortie brute. Header utilise NotificationCenter pour les etats modele, agent, approbations et sandbox. AppShell pilote une Sidebar expanded/collapsed/hidden persistante, une palette Ctrl+K, Ctrl+B et un overlay mobile.

## Source Nodes

- AppShell()
- Sidebar()
- AgentRuns()
- SandboxExecutor