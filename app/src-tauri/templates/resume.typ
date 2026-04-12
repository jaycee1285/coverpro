// CoverPro Resume Template
// Reads structured JSON data and produces a single-page resume PDF.
// Usage: typst compile resume.typ output.pdf --root / --input data=/path/to/data.json

#let data = json(sys.inputs.at("data"))
#let content-width = 7.1in
#let content-height = 10in

#set page(
  paper: "us-letter",
  margin: (top: 0.5in, bottom: 0.5in, left: 0.7in, right: 0.7in),
)

#set text(
  font: ("Nacelle", "Mulish"),
  size: 10pt,
)

#set par(leading: 0.5em)

// Helper: render a job entry with title, dates, and optional bullets
#let job-entry(title, dates, bullets) = {
  grid(
    columns: (1fr, auto),
    text(weight: "bold")[#title],
    text[#dates],
  )
  if bullets.len() > 0 {
    v(1pt)
    for bullet in bullets {
      [#h(10pt)●#h(5pt)#bullet \ ]
    }
  }
  v(5pt)
}

#let header-block = [
  #text(size: 22pt, weight: "bold")[John Curran]
  #linebreak()
  #text(size: 12pt, weight: "bold")[#data.jobTitle]
  #linebreak()
  #text(size: 9pt)[
    Beaufort, SC
    #sym.bullet
    843.505.6625
    #sym.bullet
    #link("mailto:curran.john.m@gmail.com")[curran.john.m\@gmail.com]
    #sym.bullet
    #link("https://www.blankpagesyndrome.com")[www.blankpagesyndrome.com]
  ]
]

#let summary-block = [
  #v(6pt)
  #align(center)[#text(size: 13pt, weight: "bold")[Summary]]
  #v(3pt)
  #data.summary
]

#let technical-projects-block = [
  #if data.experience.gestallt.len() > 0 or data.experience.coverpro.len() > 0 or data.experience.daylight.len() > 0 or data.experience.contextmax.len() > 0 {
    v(6pt)
    align(center)[#text(size: 13pt, weight: "bold")[Technical Projects]]
    v(3pt)

    if data.experience.gestallt.len() > 0 {
      grid(
        columns: (1fr, auto),
        text(weight: "bold")[Gestallt \u{2014} HIPAA-compliant collaboration platform],
        text[SvelteKit + Firebase],
      )
      v(1pt)
      for bullet in data.experience.gestallt {
        [#h(10pt)●#h(5pt)#bullet \ ]
      }
      v(3pt)
    }

    if data.experience.coverpro.len() > 0 {
      grid(
        columns: (1fr, auto),
        text(weight: "bold")[CoverPro \u{2014} AI Resume/Cover Letter Pipeline],
        text[Tauri + Rust + Svelte],
      )
      v(1pt)
      for bullet in data.experience.coverpro {
        [#h(10pt)●#h(5pt)#bullet \ ]
      }
      v(3pt)
    }

    if data.experience.contextmax.len() > 0 {
      grid(
        columns: (1fr, auto),
        text(weight: "bold")[ContextMax \u{2014} AI-Driven Multi-Project Orchestration],
        text[Claude Code + Obsidian],
      )
      v(1pt)
      for bullet in data.experience.contextmax {
        [#h(10pt)●#h(5pt)#bullet \ ]
      }
      v(3pt)
    }

    if data.experience.daylight.len() > 0 {
      grid(
        columns: (1fr, auto),
        text(weight: "bold")[DayLight \u{2014} Task Management with Recurrence Engine],
        text[Tauri + Svelte + Rust],
      )
      v(1pt)
      for bullet in data.experience.daylight {
        [#h(10pt)●#h(5pt)#bullet \ ]
      }
      v(3pt)
    }
  }
]

#let professional-experience-block = [
  #v(8pt)
  #align(center)[#text(size: 13pt, weight: "bold")[Professional Experience]]
  #v(5pt)

  #job-entry("Content Strategy Consultant - Independent Consulting", "2025\u{2013}Present", data.experience.labDemand)
  #job-entry("Lead Copywriter - Focus Digital", "2024\u{2013}2025", data.experience.focusDigital)

  #if data.experience.firstPageSage.len() > 0 {
    job-entry("Technical Copywriter - First Page Sage", "2022\u{2013}2024", data.experience.firstPageSage)
  }

  #job-entry("Principal Strategist & Lead Copywriter - Lear Marketing", "2009\u{2013}2024", data.experience.learMarketing)

  #if data.experience.ebay.len() > 0 {
    job-entry("Lead Content Strategist - eBay", "2011", data.experience.ebay)
  }

  #v(2pt)
  #grid(
    columns: (1fr),
    text(weight: "bold", size: 9.5pt)[Earlier Experience]
  )
  #v(2pt)
  #text(size: 9.5pt)[#data.experience.earlierExperience]
]

#let skills-block = [
  #v(8pt)
  #align(center)[#text(size: 13pt, weight: "bold")[Skills & Tools]]
  #v(4pt)
  #text(size: 9.5pt)[
    #text(weight: "bold")[SEO & Analytics:] GA4, Search Console, Ahrefs, SEMRush, Screaming Frog, schema markup, topic clustering
    #linebreak()
    #text(weight: "bold")[Content & Marketing:] HubSpot, WordPress, editorial systems, content architecture, AEO/FAQ structuring
    #linebreak()
    #text(weight: "bold")[Technical:] SvelteKit, Firebase, Typesense, Tauri, Cloud Functions, RBAC, Firestore security rules
  ]
]

#let education-block = [
  #v(8pt)
  #align(center)[#text(size: 13pt, weight: "bold")[Education & Certifications]]
  #v(3pt)
  Bachelor of Arts, #text(weight: "bold")[Eckerd College]. #emph[History and Spanish]. Minor: #emph[Mathematics]
  #h(12pt)
  #sym.bar.v
  #h(12pt)
  HubSpot Inbound Marketing and Content Marketing
]

#let resume-body = [
  #header-block
  #summary-block
  #technical-projects-block
  #professional-experience-block
  #skills-block
  #education-block
]

#resume-body

#context [
  #let header-size = measure(block(width: content-width)[#header-block])
  #let summary-size = measure(block(width: content-width)[#summary-block])
  #let technical-projects-size = measure(block(width: content-width)[#technical-projects-block])
  #let professional-experience-size = measure(block(width: content-width)[#professional-experience-block])
  #let skills-size = measure(block(width: content-width)[#skills-block])
  #let education-size = measure(block(width: content-width)[#education-block])
  #metadata((
    pageCount: counter(page).final().first(),
    targetPageCount: 1,
    contentWidth: content-width,
    availableHeight: content-height,
    totalSize: measure(block(width: content-width)[#resume-body]),
    sections: (
      (id: "header", name: "Header", width: header-size.width, height: header-size.height),
      (id: "summary", name: "Summary", width: summary-size.width, height: summary-size.height),
      (id: "technical-projects", name: "Technical Projects", width: technical-projects-size.width, height: technical-projects-size.height),
      (id: "professional-experience", name: "Professional Experience", width: professional-experience-size.width, height: professional-experience-size.height),
      (id: "skills", name: "Skills & Tools", width: skills-size.width, height: skills-size.height),
      (id: "education", name: "Education & Certifications", width: education-size.width, height: education-size.height),
    ),
  )) <coverpro-preflight>
]
