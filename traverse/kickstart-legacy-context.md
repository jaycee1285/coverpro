---
id: kickstart-legacy-context
kind: reference
authority: []
mutates: []
observes:
  - resume-knowledge-base
  - import-contract
  - generation-runner
persists_to: null
depends_on:
  - resume-knowledge-base
  - generation-runner
staleness_risks:
  - strategy-doc-drift
entrypoints:
  - Kickstart-CoverPro.md
  - PRD.md
  - How-To-PM.md
---

# Kickstart Legacy Context

## Purpose
Captures the older whole-repo compression approach that reduced agent startup cost before traverse existed. It is useful as historical context for why CoverPro has unusually dense strategy, positioning, and constraint documentation.

## Scope of Touch
Safe to edit when changing:
- historical context notes
- links to older synthesis docs

Risky to edit when changing:
- claims about canonical project strategy
- historical rationale that later docs still depend on

## Authority Notes
This node is not the operational authority for current component behavior. It is background context about how the repo was previously compressed for agents and why the constraint system is so heavily documented.

## Links
- [Resume Knowledge Base](resume-knowledge-base.md)
- [Generation Runner](generation-runner.md)
- [Import Contract](import-contract.md)
