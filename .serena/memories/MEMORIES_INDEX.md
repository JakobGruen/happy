# Memory System Index

Master index of all project memories for quick navigation and understanding.

## 📋 How to Use This Memory System

1. **MEMORY.md** — Start here for completed work summaries and current project status
2. **Subdirectories** — Navigate to specific areas for technical details
3. **This file** — Quick reference for what's where

---

## 🎯 Quick Navigation

### By Phase/Project

#### Test Infrastructure (3-phase initiative)
- `test-architecture/phase1-docker-postgres-complete.md` — Vitest globalSetup fix, real database tests
- `test-architecture/phase2-bun-ci-testing-complete.md` — Bun runtime validation, GitHub Actions CI

#### Tool Modal Redesign
- `Tool Modal Redesign Complete.md` — Executive summary of completed feature
- `tool-modal/completion-summary.md` — Component overview and architecture
- `tool-modal/content-formatter-architecture.md` — JSON/diff/code/markdown type detection
- `tool-modal/implementation-checklist.md` — Task breakdown and timeline
- `tool-modal/manual-testing-checklist.md` — QA verification steps
- `tool-modal/task8-completion-summary.md` — Integration testing and quality polish

#### Features
- `features/Skill Expansion Messages Handling.md` — Skill content attachment to tool results, chat filtering

#### UI Components
- `UI Components/SessionInitPanel.md` — Session initialization panel

### By Type

#### Completed Work Summaries
- MEMORY.md (main index)
- Tool Modal Redesign Complete.md
- `test-architecture/phase*-complete.md`
- `tool-modal/task8-completion-summary.md`

#### Technical Deep Dives
- `tool-modal/content-formatter-architecture.md` — Type detection patterns
- `tool-modal/implementation-checklist.md` — Implementation decisions
- `features/Skill Expansion Messages Handling.md` — Reducer phase patterns

#### Testing & QA
- `tool-modal/manual-testing-checklist.md` — Device testing procedures
- `test-architecture/phase*.md` — Test infrastructure details

---

## 📂 Directory Structure

```
.serena/memories/
├── MEMORY.md                           ← Start here
├── MEMORIES_INDEX.md                   ← This file
├── Tool Modal Redesign Complete.md     ← High-level summary
├── debugging-and-devex.md              ← DevEx patterns
│
├── test-architecture/
│   ├── phase1-docker-postgres-complete.md
│   └── phase2-bun-ci-testing-complete.md
│
├── tool-modal/
│   ├── completion-summary.md
│   ├── content-formatter-architecture.md
│   ├── implementation-checklist.md
│   ├── manual-testing-checklist.md
│   ├── manual-testing-workflow.md
│   ├── scroll-bug-fix.md
│   └── task8-completion-summary.md
│
├── features/
│   └── Skill Expansion Messages Handling.md
│
└── UI Components/
    └── SessionInitPanel.md
```

---

## 🚀 Using Memories for Future Work

When starting a new task:

1. **Check if similar work exists** → search `MEMORY.md` and relevant subdirectories
2. **Learn from completed work** → read completion summaries and technical decisions
3. **Reference patterns** → use implementation checklists, testing checklists as templates
4. **Add your own** → document lessons learned, patterns, gotchas in appropriately organized files

Example: Starting a new UI component redesign?
- Read `tool-modal/implementation-checklist.md` for workflow template
- Read `tool-modal/manual-testing-checklist.md` for QA procedures
- Review `tool-modal/content-formatter-architecture.md` for design pattern inspiration

---

## 🔄 Maintenance Notes

- **Consolidate regularly** — When completing work, merge task completion notes into single summary
- **Archive old work** — Move outdated memories to subdirectories or mark as historical
- **Keep MEMORY.md current** — Quarterly review of top-level summaries
- **Link between memories** — Cross-reference related work and patterns
- **Version when needed** — If major refactors happen, consider version numbers in file names

---

## 📞 Last Updated

- **Date**: 2026-03-12
- **Latest work**: Test architecture Phase 2 + Bun CI testing + Docker image slimming
- **Status**: All three phases complete and merged to main
