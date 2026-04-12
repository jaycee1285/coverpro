// CoverPro Cover Letter Template
// Simple body text with greeting and closing.
// Usage: typst compile cover-letter.typ output.pdf --root / --input data=/path/to/data.json

#let data = json(sys.inputs.at("data"))

#set page(
  paper: "us-letter",
  margin: (top: 1in, bottom: 1in, left: 1in, right: 1in),
)

#set text(
  font: ("Helvetica Neue LT Std", "Liberation Sans", "Arial"),
  size: 11pt,
)

#set par(leading: 0.65em)

Hi,

#v(6pt)

#for (i, para) in data.coverLetter.enumerate() {
  para
  if i < data.coverLetter.len() - 1 {
    v(6pt)
  }
}

#v(6pt)

Best,\

John Curran
