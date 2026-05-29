// In-process Typst engine. Replaces shelling out to the typst CLI so we can
// render PDFs on Android (where there is no PATH-installed typst binary).
//
// Fonts are embedded into the binary so desktop and Android render identically
// regardless of whatever the host system happens to have installed.

use std::collections::HashMap;

use chrono::{Datelike, Local};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Dict, Smart};
use typst::layout::PagedDocument;
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, World};

// Font files bundled at compile time. Resume uses Nacelle (display) + Mulish
// (body); cover letter uses Helvetica Neue LT Std. Italics are included
// because both templates use #emph[]. Bold is included because both templates
// set weight: "bold". Mulish ships as variable fonts that cover all weights.
pub(crate) const EMBEDDED_FONTS: &[&[u8]] = &[
    include_bytes!("../fonts/Mulish-Variable.ttf"),
    include_bytes!("../fonts/Mulish-Italic-Variable.ttf"),
    include_bytes!("../fonts/Nacelle-Regular.otf"),
    include_bytes!("../fonts/Nacelle-Bold.otf"),
    include_bytes!("../fonts/Nacelle-Italic.otf"),
    include_bytes!("../fonts/Nacelle-BoldItalic.otf"),
    include_bytes!("../fonts/HelveticaNeueLTStd-Roman.otf"),
    include_bytes!("../fonts/HelveticaNeueLTStd-It.otf"),
    include_bytes!("../fonts/HelveticaNeueLTStd-Bd.otf"),
    include_bytes!("../fonts/HelveticaNeueLTStd-BdIt.otf"),
];

fn build_font_set() -> (FontBook, Vec<Font>) {
    let mut book = FontBook::new();
    let mut fonts = Vec::new();
    for raw in EMBEDDED_FONTS {
        let bytes = Bytes::new(raw.to_vec());
        // Font::iter walks all faces in a collection (.ttc/.otc); single-face
        // .ttf/.otf files yield exactly one Font.
        for font in Font::iter(bytes) {
            book.push(font.info().clone());
            fonts.push(font);
        }
    }
    (book, fonts)
}

pub struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    sources: HashMap<FileId, Source>,
}

impl TypstWorld {
    pub fn new(template_source: String, data_value: serde_json::Value) -> Self {
        let (book, fonts) = build_font_set();

        let main_id = FileId::new(None, VirtualPath::new("/main.typ"));
        let mut sources = HashMap::new();
        sources.insert(main_id, Source::new(main_id, template_source));

        let mut inputs = Dict::new();
        inputs.insert("data".into(), json_to_typst_value(&data_value));

        let library = Library::builder().with_inputs(inputs).build();

        Self {
            library: LazyHash::new(library),
            book: LazyHash::new(book),
            fonts,
            main_id,
            sources,
        }
    }
}

impl World for TypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.sources
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(id.vpath().as_rooted_path().into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        Err(FileError::NotFound(id.vpath().as_rooted_path().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        let now = Local::now();
        Datetime::from_ymd(now.year(), now.month() as u8, now.day() as u8)
    }
}

pub struct CompiledDocument {
    pub document: PagedDocument,
}

pub fn compile_document(world: &TypstWorld) -> Result<CompiledDocument, String> {
    let result = typst::compile::<PagedDocument>(world);
    let document = result.output.map_err(|errs| {
        errs.iter()
            .map(|e| format!("{}", e.message))
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    Ok(CompiledDocument { document })
}

pub fn document_to_pdf(doc: &CompiledDocument) -> Result<Vec<u8>, String> {
    let options = typst_pdf::PdfOptions {
        ident: Smart::Auto,
        timestamp: None,
        ..Default::default()
    };
    typst_pdf::pdf(&doc.document, &options)
        .map_err(|errs| format!("PDF export failed: {:?}", errs))
}

/// Run a label-selector query against the compiled document and return the
/// `value` payload of each `<label>`-tagged metadata element, serialized as
/// JSON values.
pub fn query_metadata_values(
    doc: &CompiledDocument,
    label: &str,
) -> Result<Vec<serde_json::Value>, String> {
    use typst::foundations::{Label, Selector};
    use typst::utils::PicoStr;

    let selector = Selector::Label(Label::new(PicoStr::intern(label)));
    let elements = doc.document.introspector.query(&selector);

    let mut out = Vec::with_capacity(elements.len());
    for elem in elements {
        let value = elem
            .field_by_name("value")
            .map_err(|e| format!("query: missing 'value' field: {:?}", e))?;
        let json = typst_value_to_json(&value)
            .ok_or_else(|| "query: failed to convert typst value to JSON".to_string())?;
        out.push(json);
    }
    Ok(out)
}

fn json_to_typst_value(v: &serde_json::Value) -> typst::foundations::Value {
    use typst::foundations::{Array, Dict, IntoValue, Value as TV};
    match v {
        serde_json::Value::Null => TV::None,
        serde_json::Value::Bool(b) => TV::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                TV::Int(i)
            } else if let Some(f) = n.as_f64() {
                TV::Float(f)
            } else {
                TV::None
            }
        }
        serde_json::Value::String(s) => s.clone().into_value(),
        serde_json::Value::Array(arr) => {
            let mapped: Array = arr.iter().map(json_to_typst_value).collect();
            TV::Array(mapped)
        }
        serde_json::Value::Object(map) => {
            let mut d = Dict::new();
            for (k, val) in map {
                d.insert(k.as_str().into(), json_to_typst_value(val));
            }
            TV::Dict(d)
        }
    }
}

fn typst_value_to_json(value: &typst::foundations::Value) -> Option<serde_json::Value> {
    use typst::foundations::Value as V;
    Some(match value {
        V::None => serde_json::Value::Null,
        V::Bool(b) => serde_json::Value::Bool(*b),
        V::Int(n) => serde_json::Value::Number((*n).into()),
        V::Float(n) => serde_json::Number::from_f64(*n)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        V::Str(s) => serde_json::Value::String(s.to_string()),
        V::Length(l) => serde_json::Value::String(format!("{}pt", l.abs.to_pt())),
        V::Array(arr) => serde_json::Value::Array(
            arr.iter()
                .filter_map(typst_value_to_json)
                .collect(),
        ),
        V::Dict(dict) => {
            let mut map = serde_json::Map::new();
            for (k, v) in dict.iter() {
                if let Some(j) = typst_value_to_json(v) {
                    map.insert(k.to_string(), j);
                }
            }
            serde_json::Value::Object(map)
        }
        _ => return None,
    })
}
