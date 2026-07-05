# Nexus

**Agent IA autonome, 100 % local, dédié à la cybersécurité défensive.**

Nexus est une application de bureau (Electron) qui exécute un agent de raisonnement
_ReAct_ au-dessus d'un modèle de langage **local** (GGUF via llama.cpp). L'agent
peut invoquer des outils système et de sécurité, mais **aucune action n'est jamais
exécutée directement** : chaque intention passe par un bac à sable, une politique
d'approbation configurable et un journal d'audit.

> Nom du paquet : `local-ai` · Version : `0.1.0` · Statut : en développement actif.

![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)

---

## ⚠️ Cadre d'utilisation

Nexus est un outil **défensif**, destiné à l'analyse de vulnérabilités et aux tests
d'intrusion **dans un périmètre explicitement autorisé** (votre propre machine, un
laboratoire, un système dont vous avez la responsabilité). Les scans actifs
(`nmap`, `gobuster`, `sqlmap`…) contre des cibles externes exigent une approbation
humaine explicite. L'utilisateur reste seul responsable du respect du cadre légal.

---

## Fonctionnalités

- **Modèles 100 % locaux** — chargement de fichiers GGUF, exécution via un serveur
  llama.cpp (CPU/GPU), sans dépendance cloud. Providers additionnels : Ollama et
  toute API compatible OpenAI.
- **Agent ReAct** — boucle _Reason → Act → Observe_ avec mémoire de session,
  ancrage sur les observations réelles et arrêt propre.
- **Chaîne d'exécution sécurisée** — les outils ne produisent que des _intentions_ ;
  le `SandboxExecutor` est le seul point d'exécution.
- **Approbation humaine** — file d'attente d'approbations en temps réel, décision
  configurable par règles, expiration automatique, historique des décisions.
- **Outils de sécurité structurés** — `nmap`, `gobuster`, `sqlmap`, `burpsuite-cli`,
  avec validation d'arguments, détection de disponibilité du binaire et parsing des
  sorties (netstat, tasklist, nmap…).
- **Audit & persistance** — journal d'audit du bac à sable et historique des runs
  stockés en SQLite local.
- **Interface de bureau** — React 19, suivi des étapes de l'agent, gestion des
  modèles et validation des approbations.

---

## Chaîne canonique

Le cœur de la sécurité de Nexus tient en un seul chemin, sans exception :

```text
Agent décide → Outil formalise une intention → Approbation tranche → Sandbox exécute → Audit enregistre
```

Invariants garantis par l'architecture :

1. `shell`, `network`, `nmap`, `gobuster`, `sqlmap`, `browser`… n'exécutent **jamais**
   directement — ils construisent uniquement un `ToolIntent` typé.
2. Le `SandboxExecutor` est le **seul** module autorisé à lancer un processus.
3. `config/sandbox/approval-rules.json` est l'**unique** source de vérité des règles
   de risque ; `approval-policy.ts` est le seul à l'interpréter.
4. Toute action destructrice, privilégiée, externe ou ambiguë passe par une
   **approbation humaine**.
5. Le renderer n'a **aucun** accès direct à `child_process`, `fs` ou à l'hôte : tout
   transite par un IPC allowlisté et le preload.

---

## Stack technique

| Domaine        | Technologies                                                        |
| -------------- | ------------------------------------------------------------------- |
| Application    | Electron 42, electron-vite 5, Vite 8                                 |
| Langage        | TypeScript 5.9 (mode strict)                                         |
| Interface      | React 19, Zustand 5                                                  |
| Données        | SQLite (better-sqlite3) + migrations versionnées                    |
| Validation     | Zod 4                                                                |
| Modèles        | llama.cpp (GGUF) · Ollama · API compatible OpenAI                   |
| Qualité        | Vitest, ESLint, Prettier                                             |

---

## Prérequis

- **Node.js 20+** (LTS recommandé) et npm.
- Un **modèle GGUF** et le binaire **`llama-server`** de llama.cpp
  (placé dans `resources/bin/llama-cpp/` ou pointé via `LLAMA_CPP_SERVER_PATH`).
  Un GPU compatible est optionnel mais accélère l'inférence.
- Les outils de sécurité (`nmap`, `gobuster`, `sqlmap`…) sont **optionnels** :
  Nexus détecte leur présence sur le `PATH` et ne les propose que s'ils sont installés.
- Conçu et validé sous **Windows** ; l'exécution du bac à sable est multi-plateforme.

---

## Installation

```bash
git clone <url-du-dépôt> Local_AI
cd Local_AI

# Conflit de peer deps connu (vite@8 vs electron-vite@5) : utiliser --legacy-peer-deps
npm install --legacy-peer-deps
```

`postinstall` recompile automatiquement les modules natifs (better-sqlite3) pour
l'ABI d'Electron.

---

## Démarrage

```bash
npm run dev        # Lance l'application en mode développement (hot reload)
```

Au premier lancement, ouvrez l'onglet **Models** pour sélectionner un fichier GGUF
local (ou en télécharger un), puis chargez-le avant de démarrer un run de l'agent.

---

## Scripts npm

| Script               | Description                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `npm run dev`        | Application en développement (electron-vite)                      |
| `npm run build`      | Build de production (main, preload, renderer)                     |
| `npm run package`    | Build + empaquetage via electron-builder                          |
| `npm start`          | Prévisualisation du build                                          |
| `npm run typecheck`  | Vérification TypeScript (projets node + web)                      |
| `npm run lint`       | Analyse ESLint                                                     |
| `npm test`           | Suite de tests Vitest                                             |
| `npm run format`     | Formatage Prettier                                                 |

---

## Structure du projet

```text
src/
├── main/                     # Processus principal Electron
│   ├── agent/                # Boucle ReAct, orchestrateur, prompts, outils
│   │   └── tools/            # Outils → ToolIntent (shell, nmap, gobuster, sqlmap…)
│   ├── approvals/            # File d'approbation, politique, coordinateur, expiration
│   ├── sandbox/              # Exécuteur, runner, scopes, parsers, disponibilité outils
│   ├── models/               # Providers (llama.cpp, Ollama, OpenAI-compatible), runtime
│   ├── storage/              # SQLite, migrations, repositories
│   └── ipc/                  # Handlers IPC (allowlist)
├── preload/                  # Pont sécurisé renderer ↔ main
├── renderer/                 # Interface React (agent, approbations, modèles…)
└── shared/                   # Types, schémas Zod, canaux IPC partagés

config/sandbox/               # approval-rules.json · limits.json · policy.json
resources/                    # Binaires runtime (non versionnés), policies, Docker
```

---

## Sécurité

- **Bac à sable durci** : `shell: false`, environnement minimal en allowlist, sorties
  bornées (`maxOutputBytes`), timeout avec arrêt de l'arbre de processus, `cwd`
  restreint au workspace autorisé.
- **Scopes** : `filesystem-scope` bloque la traversée de chemins et les emplacements
  système sensibles ; `network-scope` distingue loopback / RFC1918 / externe.
- **Approbation** : les cibles externes et les actions critiques exigent une décision
  humaine ; les demandes expirent après un délai configurable
  (`config/sandbox/limits.json → approvalTimeoutMs`).
- **Audit** : chaque intention atteignant l'exécuteur est journalisée (résumé sans
  secret, décision de politique, statut, durée) dans `sandbox_audit_log`.

---

## Tests & qualité

Nexus est couvert par une suite Vitest (bac à sable, politiques d'approbation,
frontières outil → intention, parsers, coordinateur d'approbation, etc.).

```bash
npm run typecheck && npm run lint && npm test
```

Ces trois commandes doivent rester vertes avant tout commit.

---

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — instructions projet (dont l'usage du graphe de connaissances _graphify_).
- [`AGENTS.md`](./AGENTS.md) — conventions pour les agents contribuant au dépôt.
- `docs/` — guides détaillés par thème (architecture, sandboxing, approvals,
  providers de modèles, stockage, modèle de menace) — **en cours de rédaction**.

---

## Licence

Aucune licence n'est encore définie pour ce projet. Tant qu'une licence n'est pas
ajoutée, considérez le code comme « tous droits réservés » et n'en faites pas de
redistribution sans accord.
