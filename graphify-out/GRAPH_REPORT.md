# Graph Report - Local_AI  (2026-07-05)

## Corpus Check
- 309 files · ~29,570 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1182 nodes · 1522 edges · 297 communities (250 shown, 47 thin omitted)
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 289 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d8deb35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent Memory & Orchestration|Agent Memory & Orchestration]]
- [[_COMMUNITY_Model Download & Runtime|Model Download & Runtime]]
- [[_COMMUNITY_Agent & Approval Types|Agent & Approval Types]]
- [[_COMMUNITY_Approval & Sandbox Policy|Approval & Sandbox Policy]]
- [[_COMMUNITY_Build Config & Renderer Lib|Build Config & Renderer Lib]]
- [[_COMMUNITY_Agent Tools Registry|Agent Tools Registry]]
- [[_COMMUNITY_Project Metadata|Project Metadata]]
- [[_COMMUNITY_Main Process & IPC Entry|Main Process & IPC Entry]]
- [[_COMMUNITY_Local HTTP Provider|Local HTTP Provider]]
- [[_COMMUNITY_React Loop & Prompts|React Loop & Prompts]]
- [[_COMMUNITY_Agent UI Components|Agent UI Components]]
- [[_COMMUNITY_Model & Sandbox UI|Model & Sandbox UI]]
- [[_COMMUNITY_SQLite Schema & Repos|SQLite Schema & Repos]]
- [[_COMMUNITY_Model IPC Handlers|Model IPC Handlers]]
- [[_COMMUNITY_Tool Intents & Permissions|Tool Intents & Permissions]]
- [[_COMMUNITY_Module 15|Module 15]]
- [[_COMMUNITY_Module 16|Module 16]]
- [[_COMMUNITY_Module 17|Module 17]]
- [[_COMMUNITY_Module 18|Module 18]]
- [[_COMMUNITY_Module 19|Module 19]]
- [[_COMMUNITY_Module 20|Module 20]]
- [[_COMMUNITY_Module 21|Module 21]]
- [[_COMMUNITY_Module 22|Module 22]]
- [[_COMMUNITY_Module 23|Module 23]]
- [[_COMMUNITY_Module 24|Module 24]]
- [[_COMMUNITY_Module 25|Module 25]]
- [[_COMMUNITY_Module 26|Module 26]]
- [[_COMMUNITY_Module 27|Module 27]]
- [[_COMMUNITY_Module 28|Module 28]]
- [[_COMMUNITY_Module 29|Module 29]]
- [[_COMMUNITY_Module 30|Module 30]]
- [[_COMMUNITY_Module 31|Module 31]]
- [[_COMMUNITY_Module 32|Module 32]]
- [[_COMMUNITY_Module 33|Module 33]]
- [[_COMMUNITY_Module 34|Module 34]]
- [[_COMMUNITY_Module 35|Module 35]]
- [[_COMMUNITY_Module 36|Module 36]]
- [[_COMMUNITY_Module 37|Module 37]]
- [[_COMMUNITY_Module 38|Module 38]]
- [[_COMMUNITY_Module 39|Module 39]]
- [[_COMMUNITY_Module 40|Module 40]]
- [[_COMMUNITY_Module 41|Module 41]]
- [[_COMMUNITY_Module 42|Module 42]]
- [[_COMMUNITY_Module 43|Module 43]]
- [[_COMMUNITY_Module 44|Module 44]]
- [[_COMMUNITY_Module 45|Module 45]]
- [[_COMMUNITY_Module 46|Module 46]]
- [[_COMMUNITY_Module 47|Module 47]]
- [[_COMMUNITY_Module 48|Module 48]]
- [[_COMMUNITY_Module 49|Module 49]]
- [[_COMMUNITY_Module 50|Module 50]]
- [[_COMMUNITY_Module 51|Module 51]]
- [[_COMMUNITY_Module 52|Module 52]]
- [[_COMMUNITY_Module 53|Module 53]]
- [[_COMMUNITY_Module 54|Module 54]]
- [[_COMMUNITY_Module 55|Module 55]]
- [[_COMMUNITY_Module 56|Module 56]]
- [[_COMMUNITY_Module 57|Module 57]]
- [[_COMMUNITY_Module 254|Module 254]]
- [[_COMMUNITY_Module 255|Module 255]]
- [[_COMMUNITY_Module 256|Module 256]]
- [[_COMMUNITY_Module 257|Module 257]]
- [[_COMMUNITY_Module 258|Module 258]]
- [[_COMMUNITY_Module 259|Module 259]]
- [[_COMMUNITY_Module 260|Module 260]]
- [[_COMMUNITY_Module 261|Module 261]]
- [[_COMMUNITY_Module 262|Module 262]]
- [[_COMMUNITY_Module 263|Module 263]]
- [[_COMMUNITY_Module 264|Module 264]]
- [[_COMMUNITY_Module 265|Module 265]]
- [[_COMMUNITY_Module 266|Module 266]]
- [[_COMMUNITY_Module 267|Module 267]]
- [[_COMMUNITY_Module 268|Module 268]]
- [[_COMMUNITY_Module 269|Module 269]]
- [[_COMMUNITY_Module 270|Module 270]]
- [[_COMMUNITY_Module 271|Module 271]]
- [[_COMMUNITY_Module 272|Module 272]]
- [[_COMMUNITY_Module 273|Module 273]]
- [[_COMMUNITY_Module 274|Module 274]]
- [[_COMMUNITY_Module 275|Module 275]]
- [[_COMMUNITY_Module 276|Module 276]]
- [[_COMMUNITY_Module 277|Module 277]]
- [[_COMMUNITY_Module 278|Module 278]]
- [[_COMMUNITY_Module 279|Module 279]]
- [[_COMMUNITY_Module 280|Module 280]]
- [[_COMMUNITY_Module 281|Module 281]]
- [[_COMMUNITY_Module 282|Module 282]]
- [[_COMMUNITY_Module 283|Module 283]]
- [[_COMMUNITY_Community 287|Community 287]]
- [[_COMMUNITY_Community 288|Community 288]]
- [[_COMMUNITY_Community 289|Community 289]]
- [[_COMMUNITY_Community 290|Community 290]]
- [[_COMMUNITY_Community 291|Community 291]]
- [[_COMMUNITY_Community 292|Community 292]]
- [[_COMMUNITY_Community 293|Community 293]]
- [[_COMMUNITY_Community 294|Community 294]]
- [[_COMMUNITY_Community 295|Community 295]]

## God Nodes (most connected - your core abstractions)
1. `registerIpcHandlers (IPC dispatch hub)` - 20 edges
2. `LocalModelRecord` - 19 edges
3. `AgentOrchestrator` - 18 edges
4. `What You Must Do When Invoked` - 16 edges
5. `/graphify` - 15 edges
6. `ExposedApi` - 15 edges
7. `ToolIntent` - 14 edges
8. `/graphify` - 14 edges
9. `What You Must Do When Invoked` - 14 edges
10. `AgentTool` - 13 edges

## Surprising Connections (you probably didn't know these)
- `IPC Integration Test Suite` --references--> `AgentStartPayload Schema`  [INFERRED]
  tests/integration/ipc.test.ts → src/shared/validation/agent.schema.ts
- `AgentLoop Unit Test Suite` --references--> `AgentStartPayload Schema`  [INFERRED]
  tests/unit/agent-loop.test.ts → src/shared/validation/agent.schema.ts
- `ToolIntentBoundary Unit Test Suite` --references--> `AgentStartPayload Schema`  [INFERRED]
  tests/unit/tool-intent-boundary.test.ts → src/shared/validation/agent.schema.ts
- `Chat E2E Test Suite` --references--> `ChatCreatePayload Schema`  [INFERRED]
  tests/e2e/chat.e2e.ts → src/shared/validation/settings.schema.ts
- `Electron Vite Config` --references--> `Node Process TypeScript Config`  [INFERRED]
  electron.vite.config.ts → tsconfig.node.json

## Import Cycles
- None detected.

## Communities (297 total, 47 thin omitted)

### Community 0 - "Agent Memory & Orchestration"
Cohesion: 0.05
Nodes (29): MemoryManager, MemoryMessage, ActiveRun, AgentOrchestrator, AgentOrchestratorOptions, DEFAULT_RUN_OPTIONS, toPublicStatus(), collectProviderResponse() (+21 more)

### Community 1 - "Model Download & Runtime"
Cohesion: 0.06
Nodes (33): MODEL_CATALOG, ModelDownloader, safeFilename(), getActiveRuntimeModelConfig(), LlamaCppRuntime, sleep(), LocalModelRegistry, defaultLlamaServerCandidates() (+25 more)

### Community 2 - "Agent & Approval Types"
Cohesion: 0.06
Nodes (48): AgentRun, AgentRunStep, AgentStartPayload, AgentState, ReactLoopOptions, ReasoningStep, ToolCall, App Store (+40 more)

### Community 3 - "Approval & Sandbox Policy"
Cohesion: 0.08
Nodes (34): ApprovalPolicy, commandText(), DEFAULT_POLICY, __dirnameFallback(), isLocalTarget(), isPrivateIpv4(), loadJsonConfig(), matchesAny() (+26 more)

### Community 4 - "Build Config & Renderer Lib"
Cohesion: 0.07
Nodes (31): better-sqlite3 Dependency, YAML Parser Dependency, Zod Schema Validation Dependency, Zustand State Management Dependency, __dirname, useChat Hook, useDocuments Hook, useModels Hook (+23 more)

### Community 5 - "Agent Tools Registry"
Cohesion: 0.12
Nodes (24): analysisTool, browserTool, documentTool, filesystemTool, boolArg(), browserIntent(), filesystemIntent(), genericIntent() (+16 more)

### Community 6 - "Project Metadata"
Cohesion: 0.05
Nodes (38): dependencies, better-sqlite3, yaml, zod, zustand, devDependencies, electron, electron-builder (+30 more)

### Community 7 - "Main Process & IPC Entry"
Cohesion: 0.09
Nodes (31): handleAgentGet, handleAgentStart, handleAgentStop, AgentOrchestrator (lazy singleton per webContents), MODEL_CATALOG (Qwen/Mistral entries), listCatalogModels, handleChatCreate, handleChatDelete (+23 more)

### Community 8 - "Local HTTP Provider"
Cohesion: 0.14
Nodes (17): buildChatEndpoint(), buildEmbeddingEndpoint(), extractEmbedding(), extractTextFromStreamingJson(), HttpMode, inferMode(), LlamaCppHttpProvider, makeStableFallbackEmbedding() (+9 more)

### Community 9 - "React Loop & Prompts"
Cohesion: 0.08
Nodes (27): analysisTool AgentTool, ApprovalClassifier (Stub), browserTool AgentTool (High Risk), documentTool AgentTool (RAG), InputFilter (Stub), MemoryManager Class, ObservationParser (Stub), AgentOrchestrator Class (+19 more)

### Community 10 - "Agent UI Components"
Cohesion: 0.13
Nodes (22): Agent Step Card, Approval Dialog, Approval Queue, App Shell, Chat Thread, Chat View, Composer, Context Panel (+14 more)

### Community 11 - "Model & Sandbox UI"
Cohesion: 0.18
Nodes (22): AuditTrail, Badge, Button, Dialog, Input, LimitsEditor, ModelCatalog, ModelDownloadProgress (+14 more)

### Community 12 - "SQLite Schema & Repos"
Cohesion: 0.12
Nodes (20): chats Table, messages Table, agent_runs Table, agent_run_steps Table, agent_run_state Table, approvals Table, audit_log Table, AgentRunStateRepository (+12 more)

### Community 13 - "Model IPC Handlers"
Cohesion: 0.22
Nodes (14): getRuntime(), handleModelCatalog(), handleModelDownload(), handleModelList(), handleModelLoad(), handleModelRegisterLocal(), handleModelSelectGguf(), handleModelStatus() (+6 more)

### Community 14 - "Tool Intents & Permissions"
Cohesion: 0.18
Nodes (18): ApprovalPolicy Class, DEFAULT_POLICY (Sandbox Rules Config), approvalPolicy Singleton, FilesystemTool (AgentTool), browserIntent Factory, filesystemIntent Factory, genericIntent Factory, networkIntent Factory (+10 more)

### Community 16 - "Module 16"
Cohesion: 0.23
Nodes (13): chatsRepo(), handleChatCreate(), handleChatDelete(), handleChatList(), handleMessageCreate(), handleMessageList(), messagesRepo(), getDb() (+5 more)

### Community 17 - "Module 17"
Cohesion: 0.29
Nodes (9): getOrchestrator(), handleAgentGet(), handleAgentStart(), handleAgentStop(), Result, AgentGetPayloadSchema, AgentStartPayloadSchema, AgentStopPayloadSchema (+1 more)

### Community 18 - "Module 18"
Cohesion: 0.13
Nodes (16): Approval Gate, Sandbox Audit Logger, AuditLog (stub), Sandbox Browser Runner, ChildProcessRunner, normalizeCommand, splitCommandLine, DockerRunner (stub) (+8 more)

### Community 19 - "Module 19"
Cohesion: 0.19
Nodes (14): Local Telemetry, Telemetry Events, Telemetry Policy, ToolCalls Repository, Error Utilities, Event Utilities, Logger Utility, Result Utility (+6 more)

### Community 20 - "Module 20"
Cohesion: 0.14
Nodes (13): compilerOptions, baseUrl, esModuleInterop, module, moduleResolution, paths, resolveJsonModule, skipLibCheck (+5 more)

### Community 21 - "Module 21"
Cohesion: 0.10
Nodes (15): createMainWindow(), getDbPath(), getMigrationsDir(), initSettingsService(), settingsService, registerIpcHandlers(), config, configDir (+7 more)

### Community 22 - "Module 22"
Cohesion: 0.25
Nodes (11): Architecture Document (stub), Environment-Layered Configuration Strategy, llama.cpp Model Provider, Local-First Architecture Principle, Ollama Model Provider, Default App Configuration, Development Configuration Override, Model Providers Configuration (+3 more)

### Community 23 - "Module 23"
Cohesion: 0.31
Nodes (11): RAG Chunker, Code Document Loader, RAG Embeddings, HTML Document Loader, RAG Ingest Pipeline, Markdown Document Loader, PDF Document Loader, RAG Reranker (+3 more)

### Community 24 - "Module 24"
Cohesion: 0.20
Nodes (9): allowBrowserAutomation, allowChildProcess, allowDocker, defaultTimeoutMs, maxDirectoryDepth, maxFileSizeMB, maxOutputBytes, runner (+1 more)

### Community 25 - "Module 25"
Cohesion: 0.31
Nodes (10): Tool Approval Workflow, Browser Tool (sandboxed), Filesystem Tool (sandboxed), Shell Tool (sandboxed), Tools Configuration, Approvals Documentation (stub), Sandboxing Documentation (stub), Threat Model Documentation (stub) (+2 more)

### Community 26 - "Module 26"
Cohesion: 0.06
Nodes (35): For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration, For --update (incremental re-extraction) (+27 more)

### Community 27 - "Module 27"
Cohesion: 0.33
Nodes (7): Sandbox Approval Rules, entrypoint.sh script, Sandbox Resource Limits, Default Sandbox Policy, Lab Sandbox Policy, Restricted Sandbox Policy, Sandbox Execution Policy

### Community 28 - "Module 28"
Cohesion: 0.22
Nodes (9): AnyChannel Type, EventChannel Type, EventChannels, InvokeChannel Type, InvokeChannels, IpcChannel Type, IpcRequest, IpcResult (+1 more)

### Community 29 - "Module 29"
Cohesion: 0.39
Nodes (9): Electron Vite Config, Electron Main Process (src/main), Electron Preload Scripts (src/preload), React Renderer App (src/renderer), Shared Module (src/shared), Root TypeScript Config, Node Process TypeScript Config, Web Renderer TypeScript Config (+1 more)

### Community 30 - "Module 30"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, module, moduleResolution, outDir, types, extends, include

### Community 31 - "Module 31"
Cohesion: 0.22
Nodes (8): compilerOptions, jsx, lib, module, moduleResolution, types, extends, include

### Community 32 - "Module 32"
Cohesion: 0.06
Nodes (30): For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration, For --update (incremental re-extraction) (+22 more)

### Community 33 - "Module 33"
Cohesion: 0.25
Nodes (8): Chat Schema Module, Chat E2E Test Suite, AppConfig Type, AppConfig Schema, ChatCreatePayload Schema, ChatDeletePayload Schema, MessageCreatePayload Schema, MessageListPayload Schema

### Community 34 - "Module 34"
Cohesion: 0.38
Nodes (5): deepMerge(), loadConfig(), loadYaml(), AppConfig, AppConfigSchema

### Community 35 - "Module 35"
Cohesion: 0.29
Nodes (7): AgentStartPayload Schema, ReactLoopOptions Schema, IPC Integration Test Suite, SettingsGetPayload Schema, AgentLoop Unit Test Suite, ToolIntentBoundary Unit Test Suite, Workspace Types Module

### Community 37 - "Module 37"
Cohesion: 0.47
Nodes (6): LlamaCpp Runtime, Ollama Provider, OpenAI-Compatible Provider, Normalize Model Config, Provider Factory, Default Llama Server Candidates

### Community 38 - "Module 38"
Cohesion: 0.33
Nodes (5): criticalPatterns, defaultDecision, deniedPatterns, highRiskTools, localTargets

### Community 39 - "Module 39"
Cohesion: 0.33
Nodes (5): defaultTimeoutMs, maxDirectoryDepth, maxFileSizeMB, maxOutputBytes, maxTimeoutMs

### Community 40 - "Module 40"
Cohesion: 0.40
Nodes (5): Sandbox E2E Test Suite, SandboxRunner Integration Test Suite, Sandbox Schema Module, BrowserSandboxRouting Unit Test Suite, SandboxPolicy Unit Test Suite

### Community 41 - "Module 41"
Cohesion: 0.50
Nodes (5): Agent Run Timeline Component, Exposed API Interface, IPC Client, Preload IPC Bridge, App Root Component

### Community 42 - "Module 42"
Cohesion: 0.40
Nodes (5): local_models Table, ModelsRepository, UpsertLocalModelInput Interface, LocalModelRecord Type, ModelQuantization Type

### Community 43 - "Module 43"
Cohesion: 0.50
Nodes (4): initDb, getDb, setDb, runMigrations

### Community 44 - "Module 44"
Cohesion: 0.50
Nodes (4): Approval Schema Module, Approvals E2E Test Suite, ApprovalGate Unit Test Suite, ApprovalPolicySource Unit Test Suite

### Community 45 - "Module 45"
Cohesion: 0.50
Nodes (4): Local Model Registry, Get Model File Info, Infer Quantization, Is GGUF File

### Community 48 - "Module 48"
Cohesion: 0.67
Nodes (3): Document Store, Document Types, RAG Types

### Community 49 - "Module 49"
Cohesion: 0.67
Nodes (3): Permissions Module (stub), Policy Module (stub), PolicyLoader (stub)

### Community 50 - "Module 50"
Cohesion: 0.67
Nodes (3): Shared Constants, Shared Errors, Shared Schemas

### Community 51 - "Module 51"
Cohesion: 1.00
Nodes (3): ModelLoadPayload Schema, ModelRegisterLocalPayload Schema, ModelRegistry Unit Test Suite

### Community 287 - "Community 287"
Cohesion: 0.27
Nodes (5): MessagesRepository, ChatRole, CreateChatPayload, CreateMessagePayload, Message

### Community 288 - "Community 288"
Cohesion: 0.21
Nodes (10): handlers, handleSettingsGet(), handleSettingsGetAll(), handleSettingsSet(), AnyChannel, EventChannel, EventChannels, InvokeChannel (+2 more)

## Ambiguous Edges - Review These
- `AppConfig Schema` → `Chat Schema Module`  [AMBIGUOUS]
  src/shared/validation/settings.schema.ts · relation: semantically_similar_to

## Knowledge Gaps
- **350 isolated node(s):** `PreToolUse`, `allow`, `PreToolUse`, `defaultDecision`, `criticalPatterns` (+345 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `AppConfig Schema` and `Chat Schema Module`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `LlamaCppHttpProvider` connect `Local HTTP Provider` to `Agent Memory & Orchestration`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `LocalModelRecord` connect `Model Download & Runtime` to `Model IPC Handlers`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `allow`, `PreToolUse` to the rest of the system?**
  _351 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Memory & Orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.05267778753292362 - nodes in this community are weakly interconnected._
- **Should `Model Download & Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.06467661691542288 - nodes in this community are weakly interconnected._
- **Should `Agent & Approval Types` be split into smaller, more focused modules?**
  _Cohesion score 0.05585106382978723 - nodes in this community are weakly interconnected._