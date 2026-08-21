// Legal documents are stored as structured data rather than as JSX so that
// the wording lives in one place, stays diffable in review, and renders
// identically across every policy page. Only counsel should edit the strings.

export type LegalSection = {
  heading: string;
  /** Body paragraphs, rendered in order. */
  paragraphs?: string[];
  /** Rendered as a list; use for enumerated obligations and examples. */
  bullets?: string[];
  /** Optional table, e.g. the refund schedule in the cancellation policy. */
  table?: { headers: string[]; rows: string[][] };
};

export type LegalDoc = {
  title: string;
  /** Short label above the title. */
  eyebrow: string;
  /** One-line summary used for the page hero and metadata description. */
  description: string;
  effectiveDate: string;
  /** Paragraphs shown before the numbered sections. */
  intro?: string[];
  sections: LegalSection[];
  /** Closing note rendered after the final section. */
  footnote?: string;
};
