---
type: "query"
date: "2026-07-16T15:21:17.292287+00:00"
question: "Comment simplifier la sidebar NEXUS et eviter le chevauchement du bouton de restauration ?"
contributor: "graphify"
source_nodes: ["AppShell()", "Sidebar()", "Header()"]
---

# Q: Comment simplifier la sidebar NEXUS et eviter le chevauchement du bouton de restauration ?

## Answer

NavigationSearch, le bloc de recherche, le profil Operateur local et les sous-textes des routes ont ete retires. AppShell conserve uniquement Ctrl+B pour la sidebar. En mode hidden, le header desktop reserve 66 px a gauche; le bouton se termine a 48 px, ce qui garantit une marge de 18 px avant le contexte de page.

## Source Nodes

- AppShell()
- Sidebar()
- Header()