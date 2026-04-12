# Founding Marketing Engineer — Resume Instructions Strategy

**Purpose**: Strategy doc for a future agent to wire into `current-instructions-fme.json`, runner.ts, and linter.ts.
**Role target**: Founding Marketing Engineer at PLG/developer-focused startups (Vercel, Linear, Supabase-tier).
**Created**: 2026-02-16
**Status**: Strategy only. Not yet wired into code.

---

## The Positioning

This role is the hybrid: you build the signup flow, write the SEO content, instrument the funnel, and measure the results. No delegation. The resume must prove three things:

1. **You can build** — Projects show product capability
2. **You can measure** — Focus Digital metrics prove attribution rigor
3. **You can do it alone** — labDemand is literally founding marketing work, 0→1

The PM instructions lead with projects and hide metrics. The content instructions lead with metrics and hide projects. FME needs **both** — projects AND metrics, because the role demands someone who does the full loop.

---

## Section Allocation (One Page)

| Section | Bullet Count | Why |
|---------|-------------|-----|
| Summary | 1 | Full-stack execution: code + content + analytics. Ends with period. |
| labDemand | 2 | **Centerpiece.** This IS the founding marketing story — 0→1 demand gen for regulated vertical. |
| Focus Digital | 3 | Metrics included (unlike PM mode) but reframed for pipeline/funnel, not SEO execution. |
| Gestallt | 2 | Shows you can build product, not just market it. RBAC + HIPAA = real complexity. |
| CoverPro | 1 | Automation/pipeline thinking signal. |
| Lear Marketing | 1 | GTM for technical products, early-stage companies. |
| **Total** | **10 bullets + summary** | Fits one page. Balanced across build/measure/execute. |

**Dropped vs PM mode**: ContextMax. For FME, the multi-project management system is less relevant than showing you can build a product AND market it. ContextMax is a PM/Internal Systems story.

**Dropped vs Content mode**: First Page Sage. High-volume production isn't the FME signal — pipeline thinking is.

---

## Canonical Bullet Strategy

### labDemand (2 bullets — SELECT from these)

These need to be created. Raw material from `experience.md`:
- Built ISO-17025 lab hubs mapping test methods to buyer intent
- Lifted client from page-2 to page-1, sourcing $25K contract from organic
- Shipped schema, FAQs, comparisons for SERP real estate expansion

**Compressed to 80-110 char canonical bullets:**

1. "Built demand gen program for ISO 17025 labs from zero—mapped test methods to buyer intent across verticals."
2. "Lifted client from page 2 to page 1, sourcing $25K contract from organic within first quarter."
3. "Shipped schema markup, calculators, and comparison pages—expanded SERP real estate for regulated compliance market."

**Selection notes**: Bullet 1 shows 0→1 founding work. Bullet 2 has the money metric. Bullet 3 shows tactical execution. Default pairing: 1 + 2 (founding story + revenue proof).

### Focus Digital (3 bullets — different framing than content mode)

**Critical difference from content mode**: Reframe for pipeline and funnel thinking, not SEO execution. A founding marketing engineer thinks in CAC and qualified leads, not impressions and clicks.

**Allowed metrics**: 14 qualified leads/month, $25K-$75K contracts, 3.5x YoY sessions (shows growth), 2.4x engagement (shows content quality).

**Forbidden framing**: "+631% impressions" and "+366% traffic" as lead metrics. Those are SEO metrics. For FME, lead with pipeline outcomes.

**Reframing angles:**
- "Drove 14 qualified leads/month for RF testing lab—$25K-$75K contracts from organic, zero paid spend."
- "Built content structures (TL;DR blocks, proof blocks, AEO FAQs) lifting engagement 2.4x—funnel content, not blog posts."
- "Managed six industry verticals concurrently—adapted messaging and measurement per vertical without dedicated team."

**Selection notes**: Bullet 1 is the money bullet. Bullet 2 shows content-as-funnel thinking. Bullet 3 shows operating alone at scale.

### Gestallt (2 bullets — select from PM canonical set)

Reuse PM-mode canonical bullets. Best pairing for FME:
- "Architected RBAC with cryptographic JWT isolation for team switching, preventing cross-client data access." (shows you build real products)
- "Built immutable audit log with cryptographic timestamps for team actions, meeting HIPAA forensic requirements." (shows compliance awareness — relevant for regulated-market startups)

**Alternative**: Swap bullet 2 for the trade-off bullet ("Designed tenant-scoped search with 1-hour key expiry...") if the JD emphasizes pragmatic decision-making over compliance.

### CoverPro (1 bullet — select from PM canonical set)

Best single bullet for FME:
- "Built repair system regenerating only broken sections—cuts API costs 60% and iteration time 80%."

**Why this one**: Shows automation thinking and cost awareness. A founding marketing engineer cares about efficiency because there's no team to absorb waste. The 60%/80% numbers land.

**Alternative**: "Architected multi-backend pipeline supporting 3 agent and 3 API backends—cost-optimized switching." (if JD emphasizes vendor/platform decisions)

### Lear Marketing (1 bullet)

**Reframe for**: GTM for technical products at early-stage companies.

- "Built modular SEO programs for founders with no marketing ops—templated briefs and editorial structures across vendor ecosystems."

**Why**: This IS founding marketing work. Founders with no ICP, no GTM, no marketing ops. You built the system from nothing.

---

## Cover Letter Angles (WAR Format)

### FME-specific plays:

**Play 1 (strongest)**: Lead with labDemand as founding marketing proof + Focus Digital metrics as scale proof. "I've done this exact job — built demand gen from zero for a regulated vertical, then proved the playbook scales across six verticals at an agency."

**Play 2**: Projects as product capability. "I don't just market products — I build them. Gestallt is a HIPAA-compliant multi-tenant platform. CoverPro automates my own job search pipeline. When I say 'I understand the product,' I mean I've architected systems like the ones your engineers build."

**Play 3**: Measurement rigor. "Every campaign I run has attribution. 14 qualified leads/month, $25K-$75K contracts, blended CAC trending down. I don't do brand awareness plays — I build pipelines that source revenue."

**Close**: "I'd like to show you how I'd approach [specific company challenge from JD]. I'm available [timeframe] and happy to walk through my approach before any formal process."

### FME cover letter rules:
- Name the company. Always.
- Reference a specific product/market challenge from the JD
- Include at least one project AND one metric
- Tone: confident, pragmatic, zero fluff. "I've done this" not "I'm passionate about this"

---

## Linter Rules (Differences from PM Mode)

### Must enforce:
- labDemand section exists with exactly 2 bullets
- Focus Digital section exists with exactly 3 bullets
- Focus Digital bullets contain at least 2 of: "14 qualified leads", "$25K", "3.5x", "2.4x" (pipeline metrics)
- Gestallt section exists with exactly 2 bullets
- CoverPro section exists with exactly 1 bullet
- Lear section exists with exactly 1 bullet
- No ContextMax section (not relevant for FME)
- No First Page Sage section (not relevant for FME)

### Must NOT appear:
- "+631% impressions" or "+366% traffic" as standalone metrics (SEO framing, not pipeline framing)
- Any mention of "SEO strategist" or "SEO execution" (reframe as demand gen/pipeline)
- Toyota/eBay-specific claims in Lear bullets

### Character rules:
- Same as PM: 80-110 characters per bullet, AP style numbers, period at end

---

## Summary Line Guidance

**FME summary should emphasize**: Full-stack marketing execution — builds product, writes content, measures pipeline. 0→1 comfort.

**Template**: "Full-stack marketing engineer shipping demand gen programs from concept to pipeline across regulated verticals."

**Anti-pattern**: Don't lead with "content strategist" or "PM" — lead with execution.

---

## For the Wiring Agent

1. Create `current-instructions-fme.json` following the structure of `current-instructions-pm.json`
2. Add labDemand canonical bullets (they don't exist in PM/content modes — create them)
3. Add Focus Digital FME-reframing section (similar to `focus_digital_pm_reframing` but for pipeline framing)
4. Wire `resumeMode: "fme"` through runner.ts → selects this instruction set
5. Update linter.ts to validate FME section counts and metric requirements
6. Test: generate one resume with a real PLG startup JD and verify section allocation

**Total reading for wiring agent**: This file + `current-instructions-pm.json` (for structure reference) + `runner.ts` + `linter.ts`.

---

*Created: 2026-02-16*
*Source context: editorial-brief-personas.md, Project-Bullets-Examples.md, experience.md, current-instructions-pm.json, current-instructions-content.json*
