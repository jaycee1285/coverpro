// Experience data and instructions for resume/cover letter generation
// Source: current-data.json, current-instructions.json, Graphite resume, DBeaver resume,
// and accumulated rules from 4 JDs Workflow Review conversation.

// --- Types ---

interface BulletVariants {
  default: string[];       // Original bullets_verbatim
  graphite?: string[];     // Graphite resume framing (lifecycle/SEO)
  dbeaver?: string[];      // DBeaver resume framing (technical/product)
  productLens?: string[];  // AlteraSF-style product-operator framing
  extended?: string[];     // Expanded project-heavy variant sets
}

interface SectionScope {
  allowed: string[];
  disallowed: string[];
}

interface Lens {
  vocabulary: string[];
  bulletPalette: string[];
}

interface EmployerData {
  company: string;
  role: string;
  bulletVariants: BulletVariants;
  sectionScopes: SectionScope;
  lenses?: Record<string, Lens>;
  requiredMetrics?: string[];
  constraints?: string;
  tags: string[];
}

// Cover-letter-only employers (not in resume sections)
interface CoverLetterEmployer {
  company: string;
  role: string;
  bulletVariants: BulletVariants;
  tags: string[];
}

// Consolidated earlier experience (one-liner on resume, detail in cover letters)
interface EarlierExperienceData {
  displayLine: string;       // Single line shown on resume (eBay has own section)
  displayLineWithEbay: string; // Line including eBay (when eBay doesn't have own section)
  employers: string[];       // List for reference
}

// --- Portfolio Sites ---
export const PORTFOLIO_SITES = {
  gestallt: {
    url: "gestallt.com",
    description: "HIPAA-compliant collaboration platform (SvelteKit + Firebase)",
    useWhen: "JD mentions: product, build, database, security, permissions, SaaS, platform, technical, engineering, developer tools, devtools",
  },
  daylight: {
    url: "daylightapps.com",
    description: "Product marketing microsite with messaging house, personas, competitive matrix, and email sequences",
    useWhen: "JD mentions: content strategy, PMM, product marketing, GTM, positioning, messaging, competitive analysis, demand gen, growth marketing",
  },
};

export interface ExperienceDataShape {
  labDemand: EmployerData;
  focusDigital: EmployerData;
  firstPageSage: EmployerData;
  learMarketing: EmployerData;
  gestallt: EmployerData;
  coverpro: EmployerData;
  openswarm: EmployerData;
  daylight: EmployerData;
  earlierExperience: EarlierExperienceData;
  ebay: EmployerData;
  // Cover letter only (still available for cover letter references)
  toyota: CoverLetterEmployer;
  brafton: CoverLetterEmployer;
  reporter: CoverLetterEmployer;
}

// --- Experience Data ---

export const EXPERIENCE_DATA: ExperienceDataShape = {

  // ============================================================
  // Independent Consulting (formerly labDemand)
  // ONE-LINER on resume. Shows activity post-FD, not a full section.
  // For product-operator roles, can expand using productLens variant.
  // ============================================================
  labDemand: {
    company: "Independent Consultant",
    role: "Content Strategy Consultant",
    bulletVariants: {
      default: [
        "Pursuing consulting engagements in regulated B2B verticals, building on SEO and content systems from agency work.",
      ],
      graphite: [
        "Pursuing consulting engagements in regulated B2B verticals, building on SEO and content systems from agency work.",
      ],
      dbeaver: [
        "Pursuing consulting engagements focused on developer tools and technical B2B content strategy.",
      ],
      productLens: [
        "Turn ICP pain into a tight wedge: diagnose, message, and ship outreach that earns real replies.",
        "Instrument the funnel end-to-end: source to sequence to demo to conversion, with clean stage definitions.",
        "Build 'proof on demand' assets: objection maps, micro-cases, and one-pagers that close loops fast.",
        "Convert calls into product signal: tag patterns, quantify friction, and feed roadmap-ready insights weekly.",
        "Reduce founder load with systems: templates, follow-up ops, and handoffs that don't drop context.",
      ],
    },
    sectionScopes: {
      allowed: [
        "consulting", "B2B", "regulated markets", "content strategy",
        "SEO", "demand gen", "content systems",
      ],
      disallowed: [
        "auto dealer", "OEM", "HVAC", "solar", "CEU", "Toyota", "eBay",
        "631%", "366%", "14 leads", "$25K",
        "electric aircraft", "SAE", "DOE", "machine shop",
      ],
    },
    tags: ["consulting", "SEO", "demand gen", "regulated markets", "content strategy"],
  },

  // ============================================================
  // Focus Digital
  // ============================================================
  focusDigital: {
    company: "Focus Digital",
    role: "Lead Copywriter",
    bulletVariants: {
      default: [
        "Grew search impressions +631% for an RF testing laboratory, generating 14 qualified leads monthly at $25K-$75K per contract.",
        "Scaled organic sessions +366% YoY for an industrial die cutter, with engagement time up +241%.",
        "Converted bottom-funnel SEO into verified leads for auto dealerships; buyers traveling 45+ minutes for vehicle inquiries.",
        "Built mid-funnel content structures: TL;DR blocks, proof blocks, and AEO-style FAQs across six industry verticals.",
        "Trended blended CAC down by connecting GA4 attribution to pipeline and closed revenue.",
      ],
      graphite: [
        "Search impressions up +631% for RF testing lab via hub pages, schema, and intent-led briefs.",
        "Generated 14 qualified leads monthly at $25K-$75K per contract through hub-to-LP-to-consult paths.",
        "Organic sessions scaled +366% YoY for industrial die cutter after clustering and link architecture.",
        "Engagement up +241% using TL;DRs, proof blocks, anchors, and AEO-ready FAQ modules.",
        "Blended CAC trended down as GA4 tied content campaigns to pipeline, assists, and wins.",
      ],
      dbeaver: [
        "Led content strategy for RF testing laboratories, industrial manufacturers, and automotive dealerships across six concurrent verticals.",
        "Grew search impressions +631% for a compliance-driven testing lab by mapping technical specifications to buyer intent.",
        "Scaled organic sessions +366% YoY for an industrial manufacturer through content architecture and internal linking.",
        "Generated 14 qualified leads monthly at $25K-$75K contract value through discoverable technical content.",
        "Connected GA4 attribution to pipeline, trending blended acquisition cost down across the client portfolio.",
      ],
    },
    sectionScopes: {
      allowed: [
        "dealers", "OEM", "inventory", "model pages", "local SEO", "service lanes",
        "RF testing labs", "RF testing laboratory", "die cutters", "industrial clients",
        "ISO 17025", "EMC", "EMC compliance", "testing lab", "compliance",
        "landing page frameworks", "service page rewrites",
        "TL;DR blocks", "proof blocks", "AEO-style FAQs",
        "information design", "631%", "366%", "241%", "14 leads", "14 qualified",
        "$25K", "$25K-$75K", "$25k contract",
        "GA4", "Search Console", "topic clusters", "internal linking",
        "blended CAC", "pipeline attribution", "net-new acquisition",
        "45+ minutes lead travel", "six industry verticals",
        "hub pages", "schema", "FAQs", "comparison content",
      ],
      disallowed: [
        "HVAC", "solar", "CEU",
        "electric aircraft", "SAE", "DOE", "machine shop",
        "Toyota", "eBay", "Brafton", "Gestallt",
      ],
    },
    lenses: {
      performance: {
        vocabulary: [
          "keyword intent", "internal linking", "technical hygiene", "rankings",
          "clustering", "search demand", "SERP coverage", "schema",
        ],
        bulletPalette: [
          "Grew search impressions +631% for an RF testing lab by mapping test methods to buyer intent.",
          "Scaled organic sessions +366% YoY for an industrial die cutter via clustering and link architecture.",
          "Lifted engagement +241% with TL;DR blocks, proof snippets, and AEO-style FAQ additions.",
          "Generated 14 qualified leads monthly at $25K-$75K by aligning landing copy to compliance search demand.",
          "Built weekly audits to catch metadata drift, broken links, and tracking issues before they spread.",
        ],
      },
      pmm: {
        vocabulary: [
          "positioning", "offers", "landing-page narrative", "conversion paths",
          "adoption", "activation", "narrative clarity", "value delivery",
        ],
        bulletPalette: [
          "Generated 14 qualified leads monthly at $25K-$75K by clarifying offer, audience, and CTA flow.",
          "Grew search impressions +631% for an RF testing lab by aligning messaging to buyer intent.",
          "Lifted engagement +241% using TL;DR and proof blocks that surfaced value faster on-page.",
          "Scaled organic sessions +366% YoY by systematizing page structure for consistent value delivery.",
          "Trended blended CAC down as GA4 connected content campaigns to pipeline and closed revenue.",
        ],
      },
      enablement: {
        vocabulary: [
          "talk tracks", "proof blocks", "objection handling", "campaign kits",
          "field-ready assets", "repeatable assets", "buyer FAQs",
        ],
        bulletPalette: [
          "Scaled organic sessions +366% YoY by packaging answers into reusable buyer FAQ modules.",
          "Grew search impressions +631% for an RF testing lab with field-ready landing content and schema.",
          "Built proof blocks and objection-handling assets that lifted engagement +241% on-page.",
          "Generated 14 qualified leads monthly at $25K-$75K via repeatable LP-to-consult conversion paths.",
          "Standardized service page templates across six verticals to reduce launch friction.",
        ],
      },
      comms: {
        vocabulary: [
          "narrative consistency", "channel packaging", "reporting cadence",
          "messaging consistency", "shareability", "executive-ready storylines",
        ],
        bulletPalette: [
          "Grew search impressions +631% for an RF testing lab through consistent technical messaging.",
          "Lifted engagement +241% by structuring content with clear narrative arcs and proof blocks.",
          "Scaled organic sessions +366% YoY through systematic content governance and linking strategy.",
          "Generated 14 qualified leads monthly at $25K-$75K by packaging complex B2B value into clear narratives.",
          "Maintained editorial consistency across six verticals with concurrent stakeholder groups.",
        ],
      },
      growth: {
        vocabulary: [
          "experiment cadence", "conversion surfaces", "measurement hygiene",
          "pipeline attribution", "blended CAC", "GA4", "campaign measurement",
        ],
        bulletPalette: [
          "Grew search impressions +631% for an RF testing lab via structured content experiments and schema.",
          "Scaled organic sessions +366% YoY by testing topic clusters and measuring conversion paths.",
          "Lifted engagement +241% through iterative content structures tied to on-page behavior data.",
          "Generated 14 qualified leads monthly at $25K-$75K by optimizing hub-to-LP-to-consult surfaces.",
          "Trended blended CAC down as GA4 attribution tied campaigns to pipeline and closed wins.",
        ],
      },
    },
    requiredMetrics: [
      "+631% search impressions (RF testing laboratory)",
      "14 qualified leads monthly at $25K-$75K contract value",
      "+366% YoY organic sessions (industrial die cutter)",
      "+241% engagement time",
      "Blended CAC trending down via GA4 attribution",
    ],
    tags: [
      "SEO", "content strategy", "information design", "conversion copy",
      "automotive", "RF testing", "industrial", "AEO/FAQ structuring",
      "GA4 attribution", "blended CAC",
    ],
  },

  // ============================================================
  // First Page Sage
  // ============================================================
  firstPageSage: {
    company: "First Page Sage",
    role: "Technical Copywriter",
    bulletVariants: {
      default: [
        "Produced ~20 articles/month across HVAC systems, solar energy, and advanced building materials; formats included blog posts, 5K-word spec guides, and CEU coursework.",
        "Authored a complete HVAC system specification guide for commercial contractors, used as both educational resource and lead gen magnet.",
        "Interfaced directly with clients and SEO strategists to convert technical input into discoverable, conversion-aligned content.",
      ],
      graphite: [
        "Adopted entity-first outlines to align expertise signals with high-intent journeys.",
        "Standardized briefs and edit loops to raise publish speed without quality tradeoffs.",
        "Embedded answer-engine FAQs to win snippets and improve AI-summary visibility.",
      ],
      dbeaver: [
        "Produced 20+ articles monthly across HVAC, solar energy, and building materials, consistently translating complex specifications into discoverable content for B2B buyers.",
        "Authored comprehensive industry specification guides serving both educational and lead generation purposes.",
        "Collaborated directly with experts to ensure content accuracy while maintaining engagement for diverse stakeholder groups.",
      ],
    },
    sectionScopes: {
      allowed: [
        "HVAC", "solar", "building materials", "CEU", "editorial cadence",
        "20 articles/month", "5K-word spec guides", "client collaboration",
        "SEO strategists", "entity-first outlines", "answer-engine FAQs",
        "AI-summary visibility", "snippets", "briefs", "edit loops",
        "commercial contractors", "lead gen magnet", "specification guides",
      ],
      disallowed: [
        "auto dealer", "OEM", "ISO 17025", "EMC", "Toyota", "eBay",
        "electric aircraft", "SAE", "DOE", "machine shop",
        "51%", "12%", "14 qualified", "3.5x", "2.4x",
      ],
    },
    tags: [
      "technical writing", "SEO content production", "HVAC", "solar",
      "construction materials", "lead gen assets", "entity-first", "answer-engine",
    ],
  },

  // ============================================================
  // Lear Marketing
  // ============================================================
  learMarketing: {
    company: "Lear Marketing (Freelance)",
    role: "Principal Strategist & Lead Copywriter",
    bulletVariants: {
      default: [
        "Delivered content across advanced technical domains: electric aircraft propulsion (SAE), DOE-sponsored solid-state lighting outreach, and machine shop service positioning.",
        "Built modular SEO programs and content systems for founders and technical stakeholders with no ICP, GTM framework, or marketing ops — templated briefs and editorial structures now used across vendor ecosystems.",
        "Presented Ahrefs- and SEMRush-informed content strategy to non-marketing stakeholders as part of retainer retention and repositioning.",
      ],
      graphite: [
        "Planned cross-page internal links to move authority toward revenue-driving pages.",
        "Audited metadata and headers to improve CTR and clarify value propositions.",
        "Built proof sections and tailored CTAs that address common searcher objections.",
      ],
      dbeaver: [
        "Developed content strategies for advanced engineering companies across electric aircraft propulsion, DOE energy initiatives, and precision manufacturing sectors.",
        "Collaborated with SMEs to translate complex product capabilities into accessible content for decision-makers and technical audiences.",
        "Built scalable content frameworks for early-stage companies without established marketing operations, achieving consistent top search rankings.",
        "Created thought leadership content establishing clients as authorities in emerging technology sectors through strategic storytelling.",
      ],
    },
    sectionScopes: {
      allowed: [
        "electric aircraft", "SAE", "DOE", "solid-state lighting",
        "machine shop", "Ahrefs", "SEMRush", "SEO systems",
        "templated briefs", "editorial structures", "vendor ecosystems",
        "strategy presentation", "retainer retention", "non-marketing stakeholders",
        "internal links", "metadata audits", "CTR improvement",
        "proof sections", "CTAs", "searcher objections", "value propositions",
        "precision manufacturing", "thought leadership",
      ],
      disallowed: [
        "Toyota", "eBay",
        "ISO 17025", "EMC", "testing labs",
        "auto dealer", "OEM", "HVAC", "solar", "CEU",
        "51%", "12%", "14 qualified", "3.5x", "2.4x",
      ],
    },
    constraints: "NO Toyota or eBay-specific claims allowed — automatic lint failure.",
    tags: [
      "technical copywriting", "SEO systems", "positioning",
      "stakeholder communication", "industrial/engineering domains",
    ],
  },

  // ============================================================
  // Gestallt (ALWAYS INCLUDED — compact 2-bullet section)
  // Shows technical build ability. This is what advances him past screens.
  // ============================================================
  gestallt: {
    company: "Gestallt (Personal Project)",
    role: "HIPAA-compliant collaboration platform (SvelteKit + Firebase)",
    bulletVariants: {
      default: [
        "Built multi-tenant SvelteKit platform with RBAC, dynamic JWT claims, and HIPAA-compliant data isolation on Firebase.",
        "Shipped 16 Cloud Functions handling auth, team management, scoped search, and immutable audit trails.",
      ],
      dbeaver: [
        "Architected multi-tenant RBAC with dynamic JWT claims for team switching—chose cryptographic isolation over trust-based UI hiding, enabling SLPs to safely switch between client teams without data leakage across 100+ client records.",
        "Designed scoped Algolia search keys with 1-hour TTL—traded perfect revocation for simpler architecture, acceptable for non-adversarial threat model where removed members lose Firestore access immediately but retain search cache briefly.",
        "Built immutable server-side audit log with zero client access—every team action (member added, role changed, invite sent) cryptographically timestamped for HIPAA compliance and forensic review.",
        "Implemented defense-in-depth: Firestore rules block data access, Cloud Functions verify permissions server-side, JWT claims enforce context—kid's classmate can pick up phone and physically cannot access PII from other teams.",
        "Created 16 Cloud Functions as authorization gatekeepers—verify membership before team switch, validate admin status before role changes, prevents client-side permission escalation attacks.",
      ],
    },
    sectionScopes: {
      allowed: [
        "multi-tenant database", "RBAC", "permissions", "Firestore security rules",
        "JWT claims", "Typesense", "Firebase Functions", "SvelteKit", "Firebase",
        "HIPAA", "data isolation", "team switching", "invitation workflows",
        "cascading sync", "Obsidian", "knowledge system", "tags",
      ],
      disallowed: [
        "auto dealer", "OEM", "ISO 17025", "EMC", "HVAC", "solar",
        "Toyota", "eBay", "electric aircraft", "SAE", "DOE",
      ],
    },
    tags: [
      "product thinking", "docs/knowledge systems", "permissions + governance",
      "web app build", "multi-tenant", "RBAC", "HIPAA",
    ],
  },

  // ============================================================
  // CoverPro (Technical Project)
  // AI Document Package Pipeline built with Tauri, Rust, Svelte
  // Multi-backend AI orchestration (3 agent backends, 3 API providers)
  // 8-mode constraint system, human-in-the-loop pause gates
  // ============================================================
  coverpro: {
    company: "CoverPro (Personal Project)",
    role: "AI Document Package Pipeline (Tauri + Rust + Svelte)",
    bulletVariants: {
      default: [
        "Built multi-backend AI orchestration supporting 3 agent backends and 3 API providers with automatic fallback—zero-downtime generation across rate limits and outages.",
        "Designed 8-mode constraint system where identical fact banks produce role-specific document packages—mode selection controls section inclusion, metric emphasis, and validation rules.",
      ],
      extended: [
        "Built multi-backend AI orchestration supporting 3 agent backends and 3 API providers with automatic fallback—zero-downtime generation across rate limits and outages.",
        "Designed 8-mode constraint system where identical fact banks produce role-specific document packages—mode selection controls section inclusion, metric emphasis, and validation rules without duplicating source data.",
        "Implemented quality gate pipeline with cross-section bleed detection, immutable fact validation, and human-in-the-loop pause gates—operators inspect live drafts mid-pipeline and accept early, reducing iteration cost 60%.",
        "Built validation layer separating immutable facts (contact info, dates, verified metrics) from narrative flexibility—prevents hallucinated data while allowing LLM to explore positioning strategies per target.",
      ],
    },
    sectionScopes: {
      allowed: [
        "Tauri", "Rust", "Svelte", "multi-agent", "quality gates", "linter",
        "similarity detection", "automated systems", "repair loops", "pipeline",
        "desktop app", "constraint validation", "problem identification",
      ],
      disallowed: [
        "auto dealer", "OEM", "ISO 17025", "EMC", "HVAC", "solar",
        "Toyota", "eBay", "electric aircraft", "SAE", "DOE", "HIPAA",
      ],
    },
    tags: [
      "product thinking", "automation", "quality systems", "desktop app build",
      "multi-agent orchestration", "constraint validation",
    ],
  },

  // ============================================================
  // OpenSwarm (Technical Project)
  // Multi-Agent Orchestration with Mobile Remote Control
  // ============================================================
  openswarm: {
    company: "OpenSwarm (Personal Project)",
    role: "Multi-Agent Orchestration with Mobile Remote Control (Rust + GTK4 + Tauri)",
    bulletVariants: {
      default: [
        "Architected multi-backend agent supervisor (PTY, Claude WebSocket, Codex JSON-RPC) under one polymorphic layer.",
        "Shipped Android client spawning coding agents over a Tailscale-secured WebSocket tunnel.",
      ],
      dbeaver: [
        "Architected multi-backend agent supervisor (PTY, Claude WebSocket, Codex JSON-RPC) under one polymorphic layer.",
        "Reverse-engineered Claude Code's WebSocket SDK protocol from transcript logs to ship a compliant agent server.",
        "Built a ghost PTY probe scraping /usage percentages from a headless Claude—data the CLI never exposed via API.",
      ],
    },
    sectionScopes: {
      allowed: [
        "multi-agent", "WebSocket", "PTY", "JSON-RPC", "Tailscale", "ghost probe",
        "process management", "signal handling", "crash recovery", "supervisor pattern",
        "mobile remote control", "orchestration", "cross-platform", "agent lifecycle",
        "distributed systems", "protocol reverse engineering", "GTK4", "VTE4",
        "Codex", "Claude Code", "Tauri", "SvelteKit", "Android",
      ],
      disallowed: [
        "auto dealer", "OEM", "ISO 17025", "EMC", "HVAC", "solar",
        "Toyota", "eBay", "electric aircraft", "SAE", "DOE", "HIPAA",
      ],
    },
    tags: [
      "distributed systems", "agent orchestration", "mobile integration",
      "process management", "protocol reverse engineering", "cross-platform",
    ],
  },

  // ============================================================
  // Daylight (Technical Project)
  // Multi-Project Management System built with Obsidian + Automation
  // ============================================================
  daylight: {
    company: "Daylight (Personal Project)",
    role: "Task Management System with Recurrence Logic (TypeScript + Obsidian)",
    bulletVariants: {
      default: [
        "Designed Rule B recurrence logic (generate occurrences regardless of completion)—rescheduling one instance never affects the series, preventing cascading drift when users skip a daily habit or delay a weekly review.",
        "Implemented local midnight parsing instead of UTC offsets—prevents the timezone bug that breaks most calendar apps when users travel or DST transitions cause tasks to shift hours.",
      ],
      dbeaver: [
        "Designed Rule B recurrence logic (generate occurrences regardless of completion)—rescheduling one instance never affects the series, preventing cascading drift when users skip a daily habit or delay a weekly review.",
        "Implemented local midnight parsing instead of UTC offsets—prevents the timezone bug that breaks most calendar apps when users travel or DST transitions cause tasks to shift hours.",
        "Built nth-weekday recurrence (2nd Tuesday, last Friday) with proper month-boundary handling—month-end edge cases tested against iCal RFC to ensure 'last Friday' doesn't generate duplicates when months have 5 Fridays.",
        "Architected pure-function recurrence engine decoupled from UI/storage—200+ line domain model with zero side effects, enabling comprehensive unit testing of edge cases without database or React dependencies.",
      ],
    },
    sectionScopes: {
      allowed: [
        "context recovery", "multi-project", "project management", "automation",
        "staleness detection", "blocker extraction", "repository tracking",
        "Obsidian", "workflow automation", "system design",
      ],
      disallowed: [
        "auto dealer", "OEM", "ISO 17025", "EMC", "HVAC", "solar",
        "Toyota", "eBay", "electric aircraft", "SAE", "DOE", "HIPAA",
      ],
    },
    tags: [
      "product thinking", "automation", "context management", "workflow systems",
      "multi-project coordination",
    ],
  },

  // ============================================================
  // Earlier Experience (consolidated one-liner on resume)
  // ============================================================
  earlierExperience: {
    displayLine: "Earlier: Product Copywriter, Toyota (via agency) | Content Writer, Brafton",
    displayLineWithEbay: "Earlier: Product Copywriter, Toyota (via agency) | Lead Content Strategist, eBay | Content Writer, Brafton",
    employers: ["Toyota", "Brafton"],
  },

  // ============================================================
  // Cover Letter Only employers (not for resume sections, but available for cover letter references)
  // ============================================================
  toyota: {
    company: "Toyota (via Agency)",
    role: "Contract Copywriter",
    bulletVariants: {
      default: [
        "Authored competitive comparison brochures (e.g., Tundra vs. F-150) for dealer training and sales floor readiness.",
        "Flagged pre-launch spec error in 2015 Tacoma cargo dimensions, avoiding $100K+ print error and preserving credibility for flagship midsize launch.",
      ],
      dbeaver: [
        "Developed competitive positioning content and sales enablement materials for national product launch campaigns.",
        "Created data-driven comparison content that translated technical specifications into consumer-focused value propositions.",
        "Identified critical specification error during pre-launch review, preventing $100K+ print costs and protecting brand credibility.",
      ],
    },
    tags: ["sales enablement", "competitive messaging", "QA/editorial rigor", "automotive"],
  },
  ebay: {
    company: "eBay",
    role: "Lead Content Strategist",
    bulletVariants: {
      default: [
        "Managed transactional email pipeline from dozens of PMs, reaching 10M monthly users.",
        "Co-built internal comms platform pilot, beta-tested across 15K employees pre-Slack (2011).",
        "Owned content flow for dozens of product teams as 1 of 12 content staff in 15K-person org.",
      ],
      dbeaver: [
        "Created integrated email campaigns for major product feature rollouts, balancing technical complexity with user engagement across diverse customer segments.",
        "Collaborated with cross-functional teams including Product, UX, and Marketing to develop cohesive messaging strategies for complex platform features.",
      ],
    },
    sectionScopes: {
      allowed: [
        "transactional email", "email pipeline", "product launches",
        "internal comms", "content operations", "UX collaboration",
        "behavioral messaging", "buyer/seller", "10M users",
      ],
      disallowed: [
        "ISO 17025", "EMC", "testing labs",
        "auto dealer", "OEM", "HVAC", "solar", "CEU",
        "electric aircraft", "SAE", "DOE", "machine shop",
        "Toyota", "Brafton", "Gestallt",
        "51%", "12%", "14 qualified", "3.5x", "2.4x",
        "631%", "366%", "241%", "14 leads", "$25K",
      ],
    },
    tags: ["lifecycle/email", "product launches", "UX/product collaboration", "behavioral messaging", "transactional email", "internal tools"],
  },
  brafton: {
    company: "Brafton",
    role: "Content Writer",
    bulletVariants: {
      default: [
        "Produced 20+ articles/week (~1,000 words each) for clients in biotech, automotive, and legal verticals.",
        "Onboarded and supported three freelancers; adapted editorial strategy to align with domain-specific tone and legal constraints.",
      ],
    },
    tags: ["high-volume production", "editorial ops", "multi-vertical writing", "quality + consistency"],
  },
  reporter: {
    company: "County Weekly Newspaper",
    role: "Reporter",
    bulletVariants: {
      default: [
        "Conducted investigative interviews and research for local news stories, developing expertise in extracting compelling narratives from complex subjects and reluctant sources.",
        "Created accessible content from complex municipal and legal topics for general readership while maintaining accuracy and depth.",
      ],
    },
    tags: ["journalism", "investigative research", "narrative extraction", "accuracy"],
  },
};

// --- Instructions ---

export const INSTRUCTIONS = {
  resumeLineRules: {
    lineLength: "80-110 characters per line",
    punctuation: "Summary and every bullet must end with a period.",
    truthfulness: "Do not invent experience, employers, tools, titles, or results.",
    tailoring: "Tailor bullets to each JD by reframing real experience, not by making new claims.",
  },
  numbersAndStyle: {
    styleGuide: "Follow AP style for numbers.",
    hardRule: "Do NOT spell out numbers to hit character limits.",
    preferredForms: ["631%", "366%", "241%", "14 leads", "$25K-$75K", "45+ minutes"],
  },
  focusDigitalRequiredMetrics: [
    "+631% search impressions (RF testing laboratory)",
    "14 qualified leads monthly at $25K-$75K contract value",
    "+366% YoY organic sessions (industrial die cutter)",
    "+241% engagement time",
    "Blended CAC trending down via GA4 attribution",
  ],
  learMarketingConstraints: {
    noToyotaOrEbay: "LM bullets cannot reference Toyota/eBay-specific outcomes or brand claims.",
    allowed: "General transferable skills and outcomes truly attributable to Lear Marketing work.",
  },

  // --- Anti-Drift Algorithm (9 steps) ---
  antiDriftAlgorithm: [
    "1. Parse JD into: must-have skills, primary outcomes, channels, audience, and proof signals.",
    "2. For each employer section, load ONLY that employer's allowed topic pool (sectionScopes).",
    "3. Draft bullets by mapping JD outcomes to employer facts, using reframes allowed by the dataset.",
    "4. Validate: each bullet contains only employer-legal nouns + outcomes; remove any cross-employer nouns.",
    "5. Enforce length: 80-110 chars, end period, AP-style numbers.",
    "6. Validate Focus Digital: include >=3 client-pinned metrics (631%, 366%, 241%, 14 leads, $25K).",
    "7. Validate Lear Marketing: no Toyota/eBay substrings.",
    "8. Include EXACTLY ONE of: Technical Projects (Gestallt, 2 bullets) OR eBay Experience (3 bullets). Choose based on JD.",
    "9. Cover letter: NAME the company, choose 3 needs, 2 sentences/para, no em-dash, <=1 triple-list. Surface depth that makes the reader curious.",
  ],

  // --- FD Lens Selection ---
  fdLensSelection: {
    instruction: "Before writing FD bullets: choose 1 primary lens from {performance, pmm, enablement, comms, growth} based on JD analysis. Rewrite verbs/nouns accordingly; keep metrics unchanged.",
    lensGuide: {
      performance: "Use for SEO Strategist, Content SEO, Technical SEO JDs. Vocabulary: keyword intent, internal linking, technical hygiene, rankings.",
      pmm: "Use for Product Marketing, GTM, Positioning JDs. Vocabulary: positioning, offers, landing-page narrative, conversion paths, adoption, activation.",
      enablement: "Use for Sales Enablement, Field Marketing JDs. Vocabulary: talk tracks, proof blocks, objection handling, campaign kits, field-ready assets.",
      comms: "Use for Digital Comms, Brand, Corporate Comms JDs. Vocabulary: narrative consistency, channel packaging, reporting cadence, executive-ready storylines.",
      growth: "Use for Growth Marketing, Demand Gen, Analytics JDs. Vocabulary: experiment cadence, conversion surfaces, measurement hygiene, pipeline attribution, blended CAC.",
    },
    safeReframes: [
      "SEO lift → 'discoverability + intent capture' or 'digital performance improvements'.",
      "TL;DR/proof blocks/AEO FAQs → 'message testing + on-page persuasion patterns' or 'content UX patterns'.",
      "Topic clusters/internal links → 'content architecture + site governance'.",
    ],
  },

  // --- WAR Cover Letter ---
  warCoverLetter: {
    structure: [
      "Play 1: NAME the company and address their top need with strongest relevant proof. The reader should know in sentence 1 that this letter was written for THEM.",
      "Play 2: Match a second need with different proof source. Surface something unexpected — Gestallt build, dealership SEO depth, specific client type. Make the reader curious enough to give 45 minutes instead of 30.",
      "Play 3: Match a third need, show range. If relevant, mention building software tools or working across regulated verticals.",
      "Close: Direct CTA baked into paragraph 3. No separate close paragraph.",
    ],
    championStrategy: [
      "The cover letter must do the job of an internal champion. It needs to make the reader think 'I have to talk to this person' — not just 'this person seems qualified.'",
      "Surface ONE surprising depth signal that isn't obvious from the resume. Examples: built a HIPAA platform, did automotive dealership SEO, built desktop apps in Rust.",
      "The surprising signal should connect to the JD's needs, not just be impressive in isolation.",
    ],
    writingQuality: [
      "Lead with the employer's pain, not your background.",
      "Use concrete proof quickly: numbers, named artifacts, specific outcomes.",
      "Prefer short sentences with strong verbs and specific nouns. Short sentences = authority.",
      "Show judgment by omitting low-signal details; choose 3 plays that win the round.",
      "Make every paragraph do one job: need → proof → implication.",
      "Close with a crisp ask. No softness, no filler.",
      "Mirror JD language but do not cosplay the brand.",
    ],
    paragraphMechanics: [
      "Max 2 sentences per paragraph. No exceptions.",
      "Each follows: Claim → Proof → Implication.",
      "Pick ONLY the 3 highest-leverage needs from the JD.",
    ],
    portfolioCTA: [
      "Cover letter P3 CTA must include a portfolio URL. Choose based on JD fit:",
      "Technical/product/SaaS/platform JDs → gestallt.com (shows HIPAA platform build)",
      "Content strategy/PMM/GTM/messaging JDs → daylightapps.com (shows messaging house, personas, competitive matrix)",
      "If both apply, pick the one that addresses the JD's #1 need. Never include both URLs.",
    ],
    styleBans: [
      "No em-dashes (—). Use periods or commas.",
      "Max ONE triple-item list total (e.g., 'SEO, content, and strategy').",
      "No AI slop: 'I'm excited to', 'passionate about', 'throughout my career', 'I believe I would be', 'welcome the opportunity', 'perfectly align', 'unique combination of'.",
      "Cover letter CAN reference any employer (not section-locked like resume).",
    ],
    specialCaseOverride: "If the JD/application explicitly asks specific questions, answer ONLY those questions in the requested format. Follow their sentence/length limits exactly.",
  },

  // --- Bullet Quality ---
  qualityBar: {
    tailorPerJd: "You cannot reuse identical bullets across unrelated JDs.",
    reframingAllowed: "You can reframe content strategy/ops/PMM-adjacent work for PMM roles without making anything up.",
    avoidBadHabits: [
      "No half-true bullets padded by wordy workarounds.",
      "No number spell-outs to game character limits.",
      "No vague filler ('responsible for', 'worked on', 'helped with', 'assisted with') when a stronger, truthful action exists.",
    ],
    voiceGuidance: [
      "Operator voice, not marketer voice. Bullets should read like someone who ships.",
      "Strong verbs: 'shipped', 'built', 'ran', 'drove'. Not 'contributed to' or 'assisted with'.",
      "Specificity without trivia. Good specifics = outcomes, constraints, artifacts. Bad = tool soup.",
    ],
  },

  // --- Cross-Role Reframes ---
  crossRoleReframes: [
    "Content systems + templates + editorial governance → PMM enablement ops (assets, playbooks, launch readiness).",
    "SEO research, SERP analysis, competitive comparisons → market/competitive intelligence inputs.",
    "Conversion-oriented structures (TL;DR, proof blocks, FAQs) → buyer-journey optimization and message testing.",
    "Stakeholder-facing strategy presentations → cross-functional alignment and exec-ready narrative work.",
  ],

  // --- Quality Exemplars ---
  qualityExemplars: {
    productRole: {
      label: "AlteraSF labDemand — product-operator caliber",
      note: "Each bullet describes a system or repeatable behavior, not a one-time achievement. Uses strong, specific verbs and operator-level thinking.",
      bullets: [
        "Turn ICP pain into a tight wedge: diagnose, message, and ship outreach that earns real replies.",
        "Instrument the funnel end-to-end: source to sequence to demo to conversion, with clean stage definitions.",
        "Build 'proof on demand' assets: objection maps, micro-cases, and one-pagers that close loops fast.",
        "Convert calls into product signal: tag patterns, quantify friction, and feed roadmap-ready insights weekly.",
        "Reduce founder load with systems: templates, follow-up ops, and handoffs that don't drop context.",
      ],
    },
  },

  // --- Gestallt Inclusion Policy ---
  gestalltPolicy: {
    rule: "Gestallt is ALWAYS included as a compact 2-bullet section.",
    rationale: "Technical build proof is what advances John past screens. Hiding it costs interviews.",
    includeWhen: "Always. Every resume version includes the Technical Projects section.",
    expandWhen: "JD calls for product/build/database/security/permissions. Use dbeaver variant for expanded bullets.",
    defaultBehavior: "Include 2 compact bullets. For technical roles, expand to 4-6 bullets from dbeaver variant.",
  },
};

// =============================================================================
// DIGTWIN INTEGRATION (Priority: 2, 1, 3, 5, 4)
// Source: /home/john/repos/digtwin/background/
// =============================================================================

// --- Priority 2: Positioning Angles ---
export const POSITIONING_ANGLES = {
  contentStrategistWhoCodes: {
    trigger: "JD mentions: developer tools, API, SDK, docs, technical content for developers",
    frame: "Content strategist who codes. Builds production software. When they write about your API, they've actually used it.",
    emphasize: ["technical projects", "Gestallt (gestallt.com)", "OpenSwarm", "CoverPro build"],
  },
  technicalPMM: {
    trigger: "JD mentions: product marketing, positioning, GTM, competitive, launches",
    frame: "Technical PMM without the bullshit. Ships positioning, tests it, measures it. Can build the demo too.",
    emphasize: ["Daylight messaging (daylightapps.com)", "competitive analysis", "Toyota", "launch campaigns"],
  },
  fullStackSEO: {
    trigger: "JD mentions: SEO, organic, content strategy, demand gen",
    frame: "Full-stack SEO for technical products. +631% impressions for an RF testing lab. Explains why it worked to engineers.",
    emphasize: ["FD client-pinned metrics", "RF lab pipeline", "die cutter results", "topic clusters", "attribution"],
  },
  builderWithGTM: {
    trigger: "JD mentions: founding, first hire, 0-1, early stage, startup",
    frame: "Builder who understands GTM. Content engine, funnel instrumentation, landing pages. Does all three. Also builds desktop apps in Rust.",
    emphasize: ["FD results", "Gestallt build (gestallt.com)", "Daylight PMM site (daylightapps.com)", "solo execution"],
  },
};

// --- Priority 1: Role Fit Tiers ---
export const ROLE_FIT = {
  tier1: {
    roles: [
      "Senior/Staff Content Strategist (Technical)",
      "Technical PMM (IC)",
      "Developer Advocate (Content-Heavy)",
      "Growth/Demand Gen (Technical Products)",
    ],
    signals: [
      "developer tools", "devtools", "infrastructure", "B2B SaaS",
      "technical buyers", "API", "SDK", "PLG", "developer platform",
      "IC", "individual contributor", "no direct reports",
    ],
    action: "Go hard. Tailor heavily. Worth the effort.",
  },
  tier2: {
    roles: [
      "Product Manager (Technical/0→1)",
      "Founding Marketer (IC)",
      "SEO Lead/Director (IC)",
    ],
    signals: [
      "early stage", "seed", "series A", "first marketing hire",
      "build from scratch", "0-1", "founding",
    ],
    action: "Pursue if clearly IC. Verify no team-building expectation.",
  },
  tier3_avoid: {
    roles: [
      "Brand marketing",
      "Social media",
      "Marketing manager (coordinator)",
      "Enterprise marketing",
      "People management",
    ],
    signals: [
      "brand campaigns", "social strategy", "manage team",
      "build and lead", "cross-functional alignment",
      "stakeholder management",
    ],
    action: "Skip or deprioritize. Bad fit.",
  },
};

// --- Priority 3: STAR Examples Bank ---
export const STAR_BANK = [
  {
    id: "rf-lab-pipeline",
    situation: "RF testing lab, $25K-$75K contracts, no organic presence, page 2 rankings",
    task: "Build content strategy to drive qualified RFQs",
    action: [
      "Mapped test methods to buyer intent",
      "Created hub pages for EMC/RF standards",
      "Implemented schema, FAQs, comparison content",
      "Built internal linking architecture",
    ],
    result: "+631% impressions, 14 leads/month, enterprise contacts (Bruker, Digi, VVDN)",
    tags: ["SEO", "demand gen", "technical content", "B2B", "pipeline"],
  },
  {
    id: "toyota-error-catch",
    situation: "Toyota 2015 Tacoma launch, competitive comparison materials",
    task: "Produce dealer-ready comparison brochures",
    action: [
      "Deep review of spec sheets vs marketing claims",
      "Cross-referenced cargo dimensions with engineering data",
      "Flagged discrepancy before print run",
    ],
    result: "$100K+ error prevented, retained for additional OEM work",
    tags: ["QA", "attention to detail", "automotive", "sales enablement"],
  },
  {
    id: "coverpro-build",
    situation: "Needed high-throughput document package generation with strict quality constraints",
    task: "Build desktop pipeline with multi-backend AI orchestration and human-in-the-loop quality gates",
    action: [
      "Architected Tauri v2 + Svelte 5 + Rust with 3 agent backends and 3 API providers",
      "Designed 8-mode constraint system with per-mode linting, forbidden section detection, and fact-bank-driven output",
      "Built async human-in-the-loop pause gates for mid-pipeline inspection and early acceptance",
      "Implemented cross-section bleed detection and immutable fact validation to prevent hallucinated data",
    ],
    result: "Production app processing 4 concurrent jobs daily, 60% reduction in iteration cost from pause-gate acceptance",
    tags: ["product", "build", "AI", "shipping", "solo execution", "quality systems"],
  },
  {
    id: "gestallt-hipaa",
    situation: "SLPs/families/educators needed secure collaboration for gestalt language docs",
    task: "Build multi-tenant platform with healthcare-grade isolation",
    action: [
      "Designed Firestore schema with team-based isolation",
      "Implemented 16 Cloud Functions for auth/invites/audit",
      "Built dynamic JWT claims for secure team switching",
      "Created scoped Algolia keys, immutable audit trail",
    ],
    result: "HIPAA-compatible architecture, multi-stakeholder collaboration. Live at gestallt.com",
    tags: ["product", "security", "Firebase", "permissions", "healthcare"],
  },
  {
    id: "daylight-marketing",
    situation: "Needed product marketing microsite to demonstrate full PMM execution capability",
    task: "Build complete messaging house with positioning, personas, competitive matrix, and launch assets",
    action: [
      "Created 27-page Astro + Svelte marketing site",
      "Built 4 buyer personas with JTBD analysis",
      "Developed competitive matrix and positioning framework",
      "Wrote email/social sequences and 6 homepage design variations",
    ],
    result: "Shipped product marketing site demonstrating full PMM loop. Live at daylightapps.com",
    tags: ["PMM", "positioning", "messaging", "competitive analysis", "content strategy", "launch assets"],
  },
];

// --- Priority 5: Skill-Based Bullet Weighting ---
export const SKILL_TAGS: Record<string, string[]> = {
  // Map JD skill keywords to which employer sections should surface
  "firestore": ["gestallt"],
  "cloud functions": ["gestallt"],
  "permissions": ["gestallt"],
  "multi-tenant": ["gestallt"],
  "seo": ["focusDigital", "firstPageSage"],
  "content strategy": ["focusDigital", "firstPageSage"],
  "organic": ["focusDigital"],
  "demand gen": ["focusDigital"],
  "technical writing": ["firstPageSage", "learMarketing"],
  "developer tools": ["gestallt"],
  "devtools": ["gestallt"],
  "competitive analysis": ["toyota", "learMarketing"],
  "competitive intelligence": ["toyota", "learMarketing"],
  "product marketing": ["learMarketing", "ebay"],
  "pmm": ["learMarketing", "ebay"],
  "email": ["ebay"],
  "lifecycle": ["ebay"],
  "tauri": ["gestallt"],
  "rust": ["gestallt"],
  "svelte": ["gestallt"],
  "testing lab": ["focusDigital"],
  "iso 17025": ["focusDigital"],
  "compliance": ["focusDigital"],
  "emc": ["focusDigital"],
  "rf testing": ["focusDigital"],
  "hipaa": ["gestallt"],
  "firebase": ["gestallt"],
  "authentication": ["gestallt"],
  "rbac": ["gestallt"],
};

// --- Priority 4: Negative Signals ---
export const NEGATIVE_SIGNALS = {
  hardNo: [
    "build and manage a team",
    "people management experience required",
    "lead a team of",
    "manage direct reports",
    "hiring and developing talent",
  ],
  softNo: [
    "heavy cross-functional coordination",
    "stakeholder alignment",
    "enterprise sales support",
    "brand marketing",
    "social media strategy",
    "agency management",
  ],
  action: "If hardNo signals present, skip or warn user. If softNo dominates JD, deprioritize.",
};
