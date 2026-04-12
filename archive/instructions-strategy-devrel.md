# Developer Advocate — Resume Instructions Strategy

**Purpose**: Strategy doc for a future agent to wire into `current-instructions-devrel.json`, runner.ts, and linter.ts.
**Role target**: Developer Advocate / DevRel Engineer at developer-tools companies. Build-first, speak-never. Code over slides.
**Created**: 2026-02-16
**Status**: Strategy only. Not yet wired into code.

---

## The Positioning

DevRel that leads with shipped code, not conference talks. The resume must prove:

1. **You build real things** — Not demos, not tutorials. Production systems with real complexity.
2. **You document with specificity** — Platform quirks, debugging methodology, honest trade-offs.
3. **You understand developers** — Because you are one. Not "empathy for developers" — actual developer experience.

The differentiator from PM mode: PM says "I architect systems." DevRel says "I built this, here's what broke, here's what I learned, and I documented it so you don't have to."

The differentiator from content mode: Content says "I drive metrics." DevRel says "I earn developer trust through specificity and honesty."

---

## Section Allocation (One Page)

| Section | Bullet Count | Why |
|---------|-------------|-----|
| Summary | 1 | Developer advocate who builds first and documents what breaks. Ends with period. |
| OpenSwarm | 2 | **Centerpiece.** Multi-agent orchestration with mobile remote control. Distributed systems, WebSockets, PTY management. This is the "I actually build" proof. |
| Gestallt | 2 | Multi-tenant RBAC, Cloud Functions, HIPAA compliance. Shows depth, not breadth. |
| CoverPro | 2 | Multi-backend pipeline, repair loops. Shows API integration experience and automation thinking. |
| ContextMax | 1 | Knowledge transfer system. DevRel IS knowledge transfer. |
| Focus Digital | 1 | Credibility signal that you understand content strategy, not just code. |
| Lear Marketing | 1 | Technical domain communication (electric aircraft, DOE, machine shops). Shows you can explain complex things. |
| **Total** | **10 bullets + summary** | Fits one page. Project-heavy, marketing-light. |

**Key difference from PM**: OpenSwarm replaces ContextMax as the featured project. PM leads with context management (organizational). DevRel leads with multi-agent orchestration (technical, shareable, impressive to developers).

**Key difference from Content**: Projects dominate. Marketing roles are credibility signals (1 bullet each), not the main event.

**Dropped**: labDemand (demand gen for testing labs isn't a DevRel signal), First Page Sage (same reason).

---

## Canonical Bullet Strategy

### OpenSwarm (2 bullets — NEW, need to be created)

Raw material from `Project-Bullets-Examples.md`:
- Desktop supervisor with WebSocket remote control for mobile clients
- PTY management with proper signal handling
- Spawned first agent from phone 2026-02-14
- Supervisor pattern (spawn, monitor, restart, graceful shutdown)

**Compressed to 80-110 char canonical bullets:**

1. "Architected desktop agent supervisor with mobile remote control—WebSocket protocol for cross-network orchestration."
2. "Built PTY process management with signal handling and crash recovery—mobile disconnect doesn't orphan agents."
3. "Designed supervisor pattern managing agent lifecycle across platforms—spawn, monitor, restart from phone or desktop."

**Selection notes**: Bullet 1 shows distributed architecture. Bullet 2 shows systems programming depth (signal handling, orphan prevention). Bullet 3 shows cross-platform thinking. Default pairing: 1 + 2 (architecture + systems depth). Swap bullet 2 for 3 if JD emphasizes cross-platform or mobile.

### Gestallt (2 bullets — select from PM canonical set)

Best pairing for DevRel:
- "Architected RBAC with cryptographic JWT isolation for team switching, preventing cross-client data access." (architecture story)
- "Designed tenant-scoped search with 1-hour key expiry—traded brief cache exposure for simpler architecture." (trade-off thinking — this is the DevRel bullet because it's honest about costs)

**Why this pairing**: DevRel audiences value honest trade-offs more than compliance checkboxes. The search key trade-off bullet is more shareable than the HIPAA audit bullet. "Here's what I chose, here's what I gave up, here's why it was worth it" — that's a blog post waiting to happen.

### CoverPro (2 bullets — select from PM canonical set)

Best pairing for DevRel:
- "Architected multi-backend pipeline supporting 3 agent and 3 API backends—cost-optimized switching." (shows API integration depth)
- "Designed fact-locking linter preventing hallucination while enabling narrative and positioning variants." (shows quality systems thinking)

**Why**: Multi-backend shows you understand vendor APIs at a deep level (not just calling one). Fact-locking shows you can build developer-facing validation systems. Both are relevant to developer tools companies.

**Alternative**: "Built repair system regenerating only broken sections—cuts API costs 60% and iteration time 80%." (if JD emphasizes efficiency/automation)

### ContextMax (1 bullet)

Best single bullet for DevRel:
- "Designed knowledge transfer protocol reducing agent onboarding context 80%—interview-driven docs pipeline."

**Why this one**: DevRel IS knowledge transfer. This bullet says "I built a system that gets a new contributor to 95% understanding from a single document." That's the DevRel job description applied to AI agents.

### Focus Digital (1 bullet)

**Reframe for**: Content credibility signal, not marketing execution.

- "Created mid-funnel content structures lifting engagement 2.4x—TL;DR blocks, proof patterns, and FAQ schemas."

**Why**: Shows you understand content architecture (not just writing), and the metric proves it works. One bullet. Doesn't dominate.

### Lear Marketing (1 bullet)

**Reframe for**: Explaining complex technical domains to non-technical audiences.

- "Translated technical product capabilities into market positioning for founders with no marketing background."

**Why**: DevRel is translation work. You take complex technical concepts and make them accessible. This bullet shows you've done that professionally across electric aircraft, DOE, machine shops — domains where faking fluency fails immediately.

---

## Cover Letter Angles (WAR Format)

### DevRel-specific plays:

**Play 1 (strongest)**: Lead with OpenSwarm as "I build real things." "I built a multi-agent orchestration system with mobile remote control — PTY process management, WebSocket cross-network protocol, supervisor pattern with crash recovery. I spawned an AI agent from my phone last week. When I say I understand your developers' experience, I mean I'm one of them."

**Play 2**: Honest trade-offs as content philosophy. "My approach to developer content starts with specificity. When I built scoped search keys for Gestallt, I traded perfect revocation for simpler architecture — 1-hour TTL, acceptable for a non-adversarial threat model. That's the kind of honest trade-off documentation developers trust. Not 'best practices' but 'here's what I chose and why.'"

**Play 3**: Knowledge transfer as system design. "I built ContextMax to solve a specific problem: how do you get an AI agent — or a new developer — from zero to productive in under 20 minutes? The answer was structured knowledge transfer: interview the expert, document the mental model, not just the API. It reduced onboarding context by 80%. That's what I'd bring to [company]'s developer documentation."

**Close**: "I'd rather show you code than a slide deck. I'm happy to walk through any of my repos — they're the portfolio. Available [timeframe]."

### DevRel cover letter rules:
- Name the company and their developer product
- Reference a specific developer pain point from the JD or product docs
- Include at least one project with technical specificity (not just "I built X")
- Include one honest trade-off or debugging story
- Tone: direct, technical, zero marketing speak. "Here's what I built" not "I'm passionate about developer communities"
- NEVER mention conference speaking, Twitter presence, or community management unless the JD specifically asks

---

## Linter Rules (Differences from PM Mode)

### Must enforce:
- OpenSwarm section exists with exactly 2 bullets
- Gestallt section exists with exactly 2 bullets
- CoverPro section exists with exactly 2 bullets
- ContextMax section exists with exactly 1 bullet
- Focus Digital section exists with exactly 1 bullet
- Lear section exists with exactly 1 bullet
- No labDemand section
- No First Page Sage section

### Must NOT appear:
- "+631% impressions" or "+366% traffic" (SEO metrics don't belong in DevRel)
- "Content strategy" as a lead skill (reframe as "developer documentation" or "technical writing")
- "Community management" or "community building" (unless JD explicitly asks)
- Toyota/eBay-specific claims in Lear bullets
- "Passionate about" anything

### Character rules:
- Same as PM: 80-110 characters per bullet, AP style numbers, period at end

---

## Summary Line Guidance

**DevRel summary should emphasize**: Builder who documents. Ships code AND the docs. Platform-specific debugging, honest trade-offs, zero marketing speak.

**Template**: "Developer advocate shipping production systems and documenting what breaks—code over slides, specificity over slogans."

**Anti-pattern**: Don't say "bridge between engineering and community." Say what you build and what you document.

---

## For the Wiring Agent

1. Create `current-instructions-devrel.json` following the structure of `current-instructions-pm.json`
2. Add OpenSwarm canonical bullets (they don't exist in any current mode — create them from the 3 options above)
3. Add Focus Digital DevRel-reframing section (1 bullet, content architecture signal)
4. Add Lear Marketing DevRel-reframing section (1 bullet, technical translation)
5. Wire `resumeMode: "devrel"` through runner.ts → selects this instruction set
6. Update linter.ts to validate DevRel section counts (OpenSwarm required, no labDemand)
7. Test: generate one resume with a real DevRel JD (Vercel, Supabase, or similar) and verify section allocation

**Total reading for wiring agent**: This file + `current-instructions-pm.json` (for structure reference) + `runner.ts` + `linter.ts`.

---

*Created: 2026-02-16*
*Source context: editorial-brief-personas.md, Project-Bullets-Examples.md, experience.md, current-instructions-pm.json, current-instructions-content.json, OpenSwarm project docs*
