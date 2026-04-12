# Developer Experience Engineer — Resume Instructions Strategy

**Purpose**: Strategy doc for a future agent to wire into `current-instructions-dxe.json`, runner.ts, and linter.ts.
**Role target**: DX Engineer at developer-tools companies. The job is: make developers successful before they need to ask for help.
**Created**: 2026-02-16
**Status**: Strategy only. Not yet wired into code.

---

## The Positioning

DX Engineer is "Finish the Loop" as a job title. You find the stale cache, the broken example, the confusing error message — and you fix it before the developer hits it. The resume must prove:

1. **You build AND document** — Not just one. The rare hybrid.
2. **You think in onboarding flows** — First 10 minutes, first API call, first successful build.
3. **You debug preemptively** — Platform quirks, environment mismatches, error messages that actually help.

The differentiator from DevRel: DevRel builds cool things and earns trust externally. DX Engineer makes the product itself easier to use. It's internal-facing product work, not external-facing advocacy.

The differentiator from PM: PM decides what to build. DX Engineer decides how it feels to use.

---

## Section Allocation (One Page)

| Section | Bullet Count | Why |
|---------|-------------|-----|
| Summary | 1 | Builder + documenter. Ships code AND the developer experience around it. |
| ContextMax | 2 | **Centerpiece.** 80% onboarding reduction IS developer experience. The Kickstart system is literally "design the first 10 minutes for a new contributor." |
| Gestallt | 2 | Multi-tenant complexity with clean developer-facing APIs (Cloud Functions as gatekeepers). Shows you can build systems other developers consume. |
| CoverPro | 2 | Multi-backend abstraction (developers switch providers without changing workflows), fact-locking linter (developer-facing validation). |
| DayLight | 1 | Recurrence engine as clean domain model — pure functions, zero side effects, testable. Shows API design taste. |
| Focus Digital | 1 | Content structures (TL;DR blocks, proof patterns) as information design signal. |
| Lear Marketing | 1 | Translating technical complexity into accessible documentation. |
| **Total** | **10 bullets + summary** | Fits one page. ContextMax leads, projects show API/system design, marketing shows documentation skill. |

**Key difference from PM**: ContextMax leads instead of Gestallt. For DX, the onboarding/knowledge transfer story is stronger than the RBAC/compliance story.

**Key difference from DevRel**: DayLight appears (API design, clean domain model). OpenSwarm doesn't — distributed systems are impressive but less relevant than developer-facing API design for DX roles.

**Dropped**: OpenSwarm (impressive but not DX-relevant), labDemand (demand gen isn't DX), First Page Sage.

---

## Canonical Bullet Strategy

### ContextMax (2 bullets — select from PM canonical set)

Best pairing for DX Engineer:
- "Designed knowledge transfer protocol reducing agent onboarding context 80%—interview-driven docs pipeline."
- "Architected three-layer system—source of truth, dynamic view, snapshot—eliminating context drift."

**Why this pairing**: Bullet 1 is the money shot — 80% reduction in onboarding context IS developer experience. Bullet 2 shows the architecture underneath. Together they say: "I designed a system where a new contributor reaches 95% understanding from a single document, and here's how it works."

### Gestallt (2 bullets — select from PM canonical set)

Best pairing for DX Engineer:
- "Deployed 16 Cloud Functions as auth gatekeepers—verify membership and prevent permission escalation." (shows developer-facing API design)
- "Designed tenant-scoped search with 1-hour key expiry—traded brief cache exposure for simpler architecture." (trade-off thinking, developer-friendly pragmatism)

**Why**: Cloud Functions as gatekeepers = designing APIs other developers consume. The search key trade-off = DX pragmatism (simpler is better when the threat model allows it). These bullets show you think about the developer who has to USE your system, not just the end user.

### CoverPro (2 bullets — select from PM canonical set)

Best pairing for DX Engineer:
- "Architected multi-backend pipeline supporting 3 agent and 3 API backends—cost-optimized switching." (developer-facing abstraction — switch providers without changing workflows)
- "Designed fact-locking linter preventing hallucination while enabling narrative and positioning variants." (developer-facing validation — clear error messages, actionable feedback)

**Why**: Multi-backend abstraction IS DX — you design the interface so developers don't have to care about the implementation. Fact-locking linter IS DX — validation that tells you exactly what's wrong and how to fix it, not just "error."

### DayLight (1 bullet — NEW, needs to be created)

Raw material from `Project-Bullets-Examples.md`:
- Rule B recurrence logic (generate regardless of completion)
- Pure-function domain model, zero side effects
- Local midnight parsing preventing timezone bugs
- Nth weekday with month-boundary handling

**Compressed to 80-110 char canonical bullets:**

1. "Designed pure-function recurrence engine—200+ line domain model with zero side effects, fully unit testable."
2. "Built Rule B recurrence logic—rescheduling one instance never cascades, preventing drift across recurring tasks."
3. "Implemented local midnight parsing instead of UTC offsets—prevents the timezone bug that breaks most calendars."

**Selection notes**: Bullet 1 shows API design taste (pure functions, testable). Bullet 2 shows product thinking (Rule B is a UX decision). Bullet 3 shows preemptive debugging (prevent the bug most devs hit). **Default for DX: Bullet 1** (clean API design).

### Focus Digital (1 bullet)

**Reframe for**: Information architecture and content design, not marketing.

- "Designed content structures (TL;DR blocks, proof patterns, FAQ schemas) lifting user engagement 2.4x."

**Why**: "Content structures" = information architecture. "Lifting engagement 2.4x" = measurable UX improvement. This reframes marketing work as developer documentation design.

### Lear Marketing (1 bullet)

**Reframe for**: Making complex technical domains accessible.

- "Translated technical product capabilities into accessible documentation for non-technical stakeholders."

**Why**: DX is translation work. Complex API → clear docs. This bullet proves you've done that professionally.

---

## Cover Letter Angles (WAR Format)

### DX-specific plays:

**Play 1 (strongest)**: Lead with ContextMax as DX design proof. "I built a system that gets a new contributor from zero to productive in under 20 minutes — 80% reduction in onboarding context. The method: structured knowledge transfer that captures mental models, not just API signatures. That's the DX problem at its core: the documentation tells you WHAT, but not WHY or WHAT YOU'LL GET WRONG."

**Play 2**: Preemptive debugging philosophy. "My approach to DX starts before the developer hits the problem. When I found that WebKitGTK caches native select elements and breaks Svelte reactivity on Linux, I didn't just fix it — I documented the symptom, the cause, and the one-line fix so no one else burns 3 hours on it. That's the job: find the friction, document the fix, make it findable."

**Play 3**: Builder + documenter hybrid. "I'm not a writer who understands technology or an engineer who tolerates writing. I build multi-tenant RBAC systems with cryptographic isolation AND I design the knowledge transfer docs that let the next developer understand them. [Company] needs someone who can do both — the code and the experience around it."

**Close**: "I'd like to show you how I'd approach [specific DX challenge from JD — onboarding, error messages, SDK design]. Available [timeframe]."

### DX cover letter rules:
- Name the company and their developer product
- Reference a specific DX pain point (onboarding friction, error messages, missing docs)
- Include at least one project showing API/system design AND one showing documentation
- Tone: direct, empathetic toward developers (not users), zero marketing speak
- "Developers' time is expensive" should be the implicit throughline

---

## Linter Rules (Differences from PM Mode)

### Must enforce:
- ContextMax section exists with exactly 2 bullets
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
- "Content strategist" as a self-descriptor (use "documentation" or "information design")
- "Community" anything unless JD specifically asks
- Toyota/eBay-specific claims

### Character rules:
- Same as all modes: 80-110 characters per bullet, AP style numbers, period at end

---

## Summary Line Guidance

**DX summary should emphasize**: Builder who designs the experience around the code. Onboarding, documentation, preemptive debugging.

**Template**: "Developer experience engineer who builds production systems and designs the onboarding that makes them usable."

**Anti-pattern**: Don't say "passionate about developer experience." Say what you build and what you document.

---

## For the Wiring Agent

1. Create `current-instructions-dxe.json` following the structure of `current-instructions-pm.json`
2. Add DayLight canonical bullets (they don't exist in PM/content modes — create from options above)
3. Wire `resumeMode: "dxe"` through runner.ts → selects this instruction set
4. Update linter.ts to validate DXE section counts (ContextMax required, DayLight required, no OpenSwarm)
5. Test: generate one resume with a real DX Engineer JD and verify section allocation

**Total reading for wiring agent**: This file + `current-instructions-pm.json` (for structure reference) + `runner.ts` + `linter.ts`.

---

*Created: 2026-02-16*
*Source context: editorial-brief-personas.md, Project-Bullets-Examples.md, experience.md, current-instructions-pm.json, BlogPost-Portfolio-Strategy.md*
