/** Structured representation of a page's DOM content */
export interface StructuredPageContent {
  url:        string;
  title:      string;
  description?: string;
  selection?: SelectionContext;   // present when user has text selected
  headings:   Heading[];
  mainText:   string;            // primary readable text, max 12k chars
  forms:      DetectedForm[];
  codeBlocks: string[];
  links:      PageLink[];
  readAt:     number;            // epoch ms
}

export interface SelectionContext {
  text:   string;        // the selected text
  before: string;        // up to 200 chars before selection
  after:  string;        // up to 200 chars after selection
}

export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text:  string;
}

export interface DetectedForm {
  /** Human-readable name inferred from legend, heading near form, or aria-label */
  name:   string;
  fields: FormField[];
}

export interface FormField {
  selector:     string;    // unique CSS selector to target the element
  type:         string;    // input type or 'textarea' or 'select'
  name:         string;    // name/id attribute
  label:        string;    // associated label text
  placeholder:  string;
  currentValue: string;
  required:     boolean;
  readOnly:     boolean;
}

export interface PageLink {
  text: string;
  href: string;
}

// ── DOM Write Instructions ──────────────────────────────────────────────────

export interface FormFillInstruction {
  selector: string;
  value:    string;
}

export interface HighlightInstruction {
  text:  string;        // exact text to find and highlight
  color: string;        // CSS color, default '#fef08a'
  all:   boolean;       // highlight all occurrences vs first only
}

export interface InsertTextInstruction {
  text: string;         // text to insert at current cursor / after selection
}

export interface DomWriteResult {
  applied: number;      // number of elements written
  errors:  string[];
}
