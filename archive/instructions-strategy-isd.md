# Internal Systems Developer — Resume Instructions Strategy

**Purpose**: Strategy doc for a future agent to wire into `current-instructions-isd.json`, runner.ts, and linter.ts.
**Role target**: Internal Systems / Internal Tools Developer at companies where knowledge systems, tooling, and developer productivity matter (Linear, Notion, Anthropic, Vercel, Stripe).
**Created**: 2026-02-16
**Status**: Strategy only. Not yet wired into code.

---

## The Positioning

This is the strongest positioning. The editorial brief says Three Layers + ContextMax + /gh-cleanup "IS the portfolio." The resume must prove:

1. **You build systems people actually use** — Not Confluence graveyards. Tools that work after the builder leaves.
2. **You think in sources of truth** — One canonical location, derived views, no drift.
3. **You solve the context-switching problem at scale** — 17 repos, interrupted workflows, automated audits.

The differentiator from PM: PM manages a product for external users. ISD builds the infrastructure that makes internal teams effective. The users are engineers, not customers.

The differentiator from DX Engineer: DX focuses on external developer experience. ISD focuses on internal team productivity. Overlapping skills, different audience.

---

## Section Allocation (One Page)

| Section | Bullet Count | Why |
|---------|-------------|-----|
| Summary | 1 | Internal systems architect. Context recovery, multi-project management, automated workflows. |
| ContextMax | 3 | **Centerpiece. Full treatment.** Three-layer architecture, 80% onboarding reduction, audit automation. This project IS the job. |
| Gestallt | 2 | Multi-tenant RBAC shows you can build real access control systems — the kind internal tools need. |
| CoverPro | 2 | Pipeline automation, repair loops, validation systems. Internal tools ARE automation. |
| DayLight | 1 | Plaintext data model with cross-tool composability. Shows you understand internal data architecture. |
| Focus Digital | 1 | Managing six verticals concurrently — shows you can build systems that scale across teams. |
| Lear Marketing | 1 | Building modular systems for orgs with no existing infrastructure. That's internal tools. |
| **Total** | **11 bullets + summary** | Slightly heavier than other modes — ContextMax gets 3 because it's the direct proof. Still fits one page with tight formatting. |

**Key difference from all other modes**: ContextMax gets 3 bullets, not 1-2. This is the only role where the full ContextMax story is the primary selling point.

**Dropped**: OpenSwarm (impressive but tangential to internal systems), labDemand (demand gen isn't internal tools), First Page Sage.

---

## Canonical Bullet Strategy

### ContextMax (3 bullets — use ALL from PM canonical set)

For ISD, use all three:
- "Built context recovery automation across 17 repos—staleness detection, blocker extraction, ownership tagging."
- "Architected three-layer system—source of truth, dynamic view, snapshot—eliminating context drift."
- "Designed knowledge transfer protocol reducing agent onboarding context 80%—interview-driven docs pipeline."

**Why all three**: Other modes pick 2. ISD uses all 3 because this project IS the job description. Bullet 1 shows scale and automation. Bullet 2 shows architecture. Bullet 3 shows measurable outcome. Together they tell the complete story: here's the architecture, here's the automation, here's the result.

**Ordering**: Lead with bullet 2 (architecture — shows thinking), then bullet 3 (outcome — shows impact), then bullet 1 (automation — shows execution). Architecture → Impact → Execution.

### Gestallt (2 bullets — select from PM canonical set)

Best pairing for ISD:
- "Architected RBAC with cryptographic JWT isolation for team switching, preventing cross-client data access."
- "Deployed 16 Cloud Functions as auth gatekeepers—verify membership and prevent permission escalation."

**Why**: Internal tools need access control. Multi-team membership with dynamic switching is a real internal systems problem (engineer moves between teams, needs different permissions). These bullets show you've solved it with proper architecture, not UI band-aids.

### CoverPro (2 bullets — select from PM canonical set)

Best pairing for ISD:
- "Built repair system regenerating only broken sections—cuts API costs 60% and iteration time 80%."
- "Designed fact-locking linter preventing hallucination while enabling narrative and positioning variants."

**Why**: Internal tools are automation. The repair system shows you build efficient pipelines (don't redo work that passed). The linter shows you build validation systems (catch errors before they propagate). Both are core internal tools patterns.

### DayLight (1 bullet — select from DXE canonical options)

Best single bullet for ISD:
- "Designed pure-function recurrence engine—200+ line domain model with zero side effects, fully unit testable."

**Why**: Shows you write maintainable code. Internal tools outlive their builders. Pure functions, zero side effects, testable = code that works after you leave. That's the ISD promise.

**Alternative**: "Built Rule B recurrence logic—rescheduling one instance never cascades, preventing drift across recurring tasks." (if JD emphasizes workflow automation)

### Focus Digital (1 bullet)

**Reframe for**: Scaling systems across teams/verticals without dedicated staff.

- "Managed six industry verticals concurrently—adapted systems and measurement per vertical without dedicated team."

**Why**: ISD builds tools that scale across teams. This bullet says "I built a system that worked across 6 different contexts without needing a person per context." That's internal tooling at scale.

### Lear Marketing (1 bullet)

**Reframe for**: Building infrastructure for organizations with nothing.

- "Built modular systems for founders with no existing ops—templated structures used across vendor ecosystems."

**Why**: Internal systems developers often build from zero. This bullet says "I walked into organizations with no infrastructure and created reusable systems." The word "modular" and "templated" signal internal tools thinking.

---

## Cover Letter Angles (WAR Format)

### ISD-specific plays:

**Play 1 (strongest)**: Lead with ContextMax as the portfolio piece. "I manage 17 active repositories across multiple stacks. The context-switching problem was killing productivity — every session started from zero, docs drifted from reality, no one knew what was stale. I built ContextMax: a three-layer architecture (source of truth, dynamic view, snapshot) with automated audits that detect staleness, extract blockers, and tag ownership. New contributors reach 95% understanding from a single document. This is the internal systems problem your team has — I've already built the solution."

**Play 2**: Internal tools that outlive their builder. "The tools I build work after I leave. DayLight's recurrence engine is a 200-line pure-function domain model with zero side effects — fully testable, no hidden state. Gestallt's auth system runs on 16 Cloud Functions that verify permissions server-side — no one needs to understand my code to trust the access control. I design for maintainability because internal tools that die with their creator aren't tools — they're technical debt."

**Play 3**: Knowledge as product. "Most companies treat internal documentation as a chore. I treat it as a product. ContextMax doesn't just store information — it reduces onboarding context by 80% through structured knowledge transfer. The method: interview the expert, capture the mental model (not just the API), and write a document that lets a new person make good decisions on day one. Your wiki doesn't do that. I'd build the system that does."

**Close**: "I'd like to walk through how ContextMax works and discuss how the same architecture could apply to [company]'s internal tooling challenges. Available [timeframe]."

### ISD cover letter rules:
- Name the company
- Reference a specific internal tooling or knowledge management challenge
- ContextMax must appear in the cover letter — it's the direct proof
- Include at least one other project showing code quality or system design
- Tone: pragmatic, outcome-focused, anti-over-engineering
- "Tools that work after the builder leaves" should be the implicit throughline

---

## Linter Rules (Differences from PM Mode)

### Must enforce:
- ContextMax section exists with exactly 3 bullets
- Gestallt section exists with exactly 2 bullets
- CoverPro section exists with exactly 2 bullets
- DayLight section exists with exactly 1 bullet
- Focus Digital section exists with exactly 1 bullet
- Lear section exists with exactly 1 bullet
- No OpenSwarm section
- No labDemand section
- No First Page Sage section

### Must NOT appear:
- SEO metrics (+631%, +366%) as standalone numbers
- "Content strategist" as a self-descriptor
- "Marketing" as a lead skill (reframe as "systems," "infrastructure," "automation")
- Toyota/eBay-specific claims

### Character rules:
- Same as all modes: 80-110 characters per bullet, AP style numbers, period at end

---

## Summary Line Guidance

**ISD summary should emphasize**: Internal systems architecture. Context recovery, knowledge management, automated workflows that scale across teams.

**Template**: "Internal systems developer building context recovery and knowledge infrastructure that scales across 17 active projects."

**Anti-pattern**: Don't say "full-stack developer" — that's too generic. Say what systems you build and what problem they solve.

---

## For the Wiring Agent

1. Create `current-instructions-isd.json` following the structure of `current-instructions-pm.json`
2. ContextMax gets 3 bullets (unique among all modes)
3. Add DayLight canonical bullet (reuse from DXE strategy)
4. Wire `resumeMode: "isd"` through runner.ts → selects this instruction set
5. Update linter.ts to validate ISD section counts (ContextMax requires 3, DayLight required)
6. Test: generate one resume with a real internal tools JD (Linear, Notion, or similar) and verify section allocation

**Total reading for wiring agent**: This file + `current-instructions-pm.json` (for structure reference) + `runner.ts` + `linter.ts`.

---

*Created: 2026-02-16*
*Source context: editorial-brief-personas.md, Project-Bullets-Examples.md, experience.md, current-instructions-pm.json, BlogPost-Portfolio-Strategy.md*
