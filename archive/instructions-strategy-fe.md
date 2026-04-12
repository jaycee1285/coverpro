# Founding Engineer — Resume Instructions Strategy

**Purpose**: Strategy doc for a future agent to wire into `current-instructions-fe.json`, runner.ts, and linter.ts.
**Role target**: Founding Engineer / First Engineer at early-stage startups. Solo execution, pragmatic choices, ship fast.
**Created**: 2026-02-16
**Status**: Strategy only. Not yet wired into code.

---

## The Positioning

Founding Engineer is the "shut up and build" role. No PM to write specs. No designer to hand you mockups. No DevOps to set up CI. You do all of it. The resume must prove:

1. **You ship end-to-end alone** — 22 active projects. Not prototypes. Products.
2. **You make pragmatic architectural decisions** — Trade-offs accepted, moved on, shipped.
3. **You handle real complexity** — Multi-tenant RBAC, recurrence logic, distributed systems. Not CRUD apps.

The differentiator from PM: PM says "I decided what to build." Founding Engineer says "I decided what to build AND built it."

The differentiator from DX/DevRel: Those roles optimize for other developers. Founding Engineer optimizes for shipping the product.

The honest framing: "I architect complex systems using AI to implement — my value is understanding trade-offs, designing for edge cases, and shipping products that solve real problems." The vibe-code acknowledgment is a STRENGTH for this role, not a weakness. Startups want someone who ships, not someone who writes perfect syntax.

---

## Section Allocation (One Page)

| Section | Bullet Count | Why |
|---------|-------------|-----|
| Summary | 1 | Solo builder shipping 22 active projects. Architect + implement + measure. |
| DayLight | 3 | **Centerpiece.** Most impressive engineering: recurrence logic, timezone handling, activity ledger data model, Android + Linux cross-platform. Shows depth. |
| Gestallt | 2 | Multi-tenant RBAC, HIPAA compliance, 16 Cloud Functions. Shows you handle real systems architecture. |
| OpenSwarm | 2 | Distributed systems, PTY management, mobile remote control. Shows you go beyond web apps. |
| CoverPro | 2 | Multi-agent pipeline, repair loops. Shows AI integration and automation. |
| labDemand | 1 | 0→1 execution. Built the product AND the marketing. Founding engineer DNA. |
| **Total** | **11 bullets + summary** | Projects only. Zero marketing roles. One page. |

**Key difference from ALL other modes**: No marketing roles AT ALL. No Focus Digital, no Lear, no First Page Sage. This resume is 100% projects. The marketing background appears only in the cover letter as "I also understand the market side."

**DayLight leads, not Gestallt**: For PM roles, Gestallt leads (HIPAA, compliance, enterprise patterns). For Founding Engineer, DayLight leads because the engineering is deeper — recurrence logic, timezone handling, cross-platform builds. It's a harder problem that shows more range.

**OpenSwarm appears**: Distributed systems, PTY management, Rust + GTK4. This is the "I'm not just a web developer" signal that Founding Engineer roles need.

---

## Canonical Bullet Strategy

### DayLight (3 bullets — NEW, need to be created)

Raw material from `Project-Bullets-Examples.md`:
- Rule B recurrence (generate regardless of completion, rescheduling doesn't cascade)
- Local midnight parsing (prevents timezone bug that breaks most calendar apps)
- Nth weekday patterns with month-boundary handling
- Pure-function domain model, 200+ lines, zero side effects
- Cross-platform: Android + Linux from one codebase (Tauri v2)

**Compressed to 80-110 char canonical bullets:**

1. "Designed pure-function recurrence engine—200+ line domain model with zero side effects, fully unit testable."
2. "Implemented local midnight parsing instead of UTC offsets—prevents the timezone bug that breaks most calendars."
3. "Built nth-weekday recurrence (2nd Tuesday, last Friday) with month-boundary edge case handling per iCal RFC."
4. "Shipped cross-platform task manager for Android and Linux from single Tauri v2 codebase with Syncthing sync."
5. "Designed Rule B recurrence—rescheduling one instance never cascades, preventing drift across recurring tasks."

**Selection notes**: Bullets 1+2+3 show engineering depth (domain model + timezone + edge cases). Bullet 4 shows cross-platform shipping. Bullet 5 shows product thinking (Rule B is a UX decision). **Default trio: 1 + 2 + 4** (clean code + preemptive debugging + cross-platform shipping). Swap 4 for 3 or 5 if JD emphasizes domain complexity or product thinking.

### Gestallt (2 bullets — select from PM canonical set)

Best pairing for Founding Engineer:
- "Architected RBAC with cryptographic JWT isolation for team switching, preventing cross-client data access."
- "Implemented defense-in-depth: Firestore rules, server verification, JWT claims prevent cross-team PII access."

**Why**: Founding engineers need to show they can handle security architecture, not just features. RBAC + defense-in-depth says "I won't build an auth system that leaks data." These are the two most technically impressive Gestallt bullets.

### OpenSwarm (2 bullets — reuse from DevRel canonical set)

Best pairing for Founding Engineer:
- "Architected desktop agent supervisor with mobile remote control—WebSocket protocol for cross-network orchestration."
- "Built PTY process management with signal handling and crash recovery—mobile disconnect doesn't orphan agents."

**Why**: Shows systems programming beyond web apps. PTY management, signal handling, WebSocket protocols — this is the kind of engineering that separates "I can build a React app" from "I can build whatever the startup needs."

### CoverPro (2 bullets — select from PM canonical set)

Best pairing for Founding Engineer:
- "Architected multi-backend pipeline supporting 3 agent and 3 API backends—cost-optimized switching."
- "Built repair system regenerating only broken sections—cuts API costs 60% and iteration time 80%."

**Why**: Multi-backend shows you design for flexibility (startups pivot). Repair system shows you optimize for cost (startups have runway). The 60%/80% numbers show measurable engineering impact.

### labDemand (1 bullet)

Best single bullet for Founding Engineer:
- "Built demand gen program for ISO 17025 labs from zero—mapped test methods to buyer intent across verticals."

**Why**: This is founding work. You built the product AND the go-to-market from nothing. For a founding engineer role, this says "I don't need a marketing team to get the product in front of users."

---

## Cover Letter Angles (WAR Format)

### Founding Engineer-specific plays:

**Play 1 (strongest)**: Lead with shipping velocity and range. "I have 22 active projects across Tauri+Svelte+Rust, Go+GTK4, Firebase+SvelteKit, and Rust CLIs. Not prototypes — products with real complexity: multi-tenant RBAC with HIPAA compliance, a recurrence engine that handles nth-weekday patterns and timezone edge cases, a distributed agent orchestrator with mobile remote control. I architect the system, use AI to implement, debug the anomalies, and ship. That's the founding engineer loop."

**Play 2**: Pragmatic trade-offs. "I don't over-engineer. When Gestallt needed search, I chose scoped Algolia keys with 1-hour TTL over building a custom search backend — traded perfect key revocation for shipping two weeks earlier. When CoverPro needed multi-model support, I spawned CLI subprocesses instead of building API integrations — simpler, no key management, swappable later. Every decision optimizes for shipping, not architecture astronautics."

**Play 3**: Full-stack execution including go-to-market. "I built labDemand from zero — the product, the content, the measurement. Lifted a client from page 2 to page 1, sourced a $25K contract from organic. I don't need a marketing team to validate product-market fit. I can build the product, put it in front of users, and measure whether it works."

**Close**: "I'd rather show you code than talk about process. Happy to walk through any of my repos or pair on a problem. Available [timeframe]."

### Founding Engineer cover letter rules:
- Name the company and their product/market
- Reference the stage (pre-seed, seed, Series A) and what that implies about the role
- Lead with shipping, not architecture. "I shipped X" not "I designed X"
- Include the vibe-code acknowledgment naturally: "I architect systems and use AI to implement"
- Tone: confident, pragmatic, zero ceremony. "I build things" energy.
- MUST convey: you don't need a team to be productive on day one

---

## Linter Rules (Differences from PM Mode)

### Must enforce:
- DayLight section exists with exactly 3 bullets
- Gestallt section exists with exactly 2 bullets
- OpenSwarm section exists with exactly 2 bullets
- CoverPro section exists with exactly 2 bullets
- labDemand section exists with exactly 1 bullet
- No ContextMax section (organizational, not engineering)
- No Focus Digital section
- No Lear Marketing section
- No First Page Sage section

### Must NOT appear:
- Any marketing role bullets (Focus Digital, Lear, First Page Sage, eBay, Brafton)
- "Content strategist" or "copywriter" anywhere
- SEO metrics of any kind
- "Managed" or "led" (founding engineers DO, they don't manage)
- Toyota/eBay-specific claims

### Character rules:
- Same as all modes: 80-110 characters per bullet, AP style numbers, period at end

---

## Summary Line Guidance

**Founding Engineer summary should emphasize**: Solo builder, 22 projects, ships end-to-end. Architect + implement + measure.

**Template**: "Founding engineer shipping 22 active projects across Tauri, Rust, Go, and Firebase—architect to deployment, solo."

**Anti-pattern**: Don't say "full-stack developer" (too generic) or "passionate builder" (too vague). Lead with the number (22 projects) and the range (multiple stacks).

---

## For the Wiring Agent

1. Create `current-instructions-fe.json` following the structure of `current-instructions-pm.json`
2. Add DayLight canonical bullets (5 options, select 3 — largest canonical set in any mode)
3. Reuse OpenSwarm canonical bullets from DevRel strategy
4. Wire `resumeMode: "fe"` through runner.ts → selects this instruction set
5. Update linter.ts to validate FE section counts (DayLight requires 3, no marketing roles at all)
6. Test: generate one resume with a real founding engineer JD and verify section allocation — should be 100% projects

**Total reading for wiring agent**: This file + `current-instructions-pm.json` (for structure reference) + `instructions-strategy-devrel.md` (for OpenSwarm bullets) + `runner.ts` + `linter.ts`.

---

*Created: 2026-02-16*
*Source context: editorial-brief-personas.md, Project-Bullets-Examples.md, experience.md, current-instructions-pm.json, How-To-PM.md positioning strategy*
