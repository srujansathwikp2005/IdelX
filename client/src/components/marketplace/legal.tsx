import { PublicShell, PageHero } from "@/components/marketplace/app-shell";
import type { LegalDoc } from "@/config/legal/types";

// Single renderer for every policy page. Sections are numbered automatically
// from their position, so inserting or reordering a clause in the content
// file cannot leave the numbering inconsistent with the document.
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <PublicShell>
      <PageHero title={doc.title} eyebrow={doc.eyebrow} description={doc.description} />

      <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-7 text-muted-foreground sm:px-6">
        <p className="mb-8 text-xs uppercase tracking-wide text-muted-foreground/80">
          Effective date: {doc.effectiveDate}
        </p>

        {doc.intro?.map((para, i) => (
          <p key={`intro-${i}`} className="mb-4">
            {para}
          </p>
        ))}

        {doc.sections.map((section, i) => (
          <section key={section.heading} className="mt-10 scroll-mt-24" id={`section-${i + 1}`}>
            <h2 className="mb-3 text-base font-semibold text-foreground">
              {i + 1}. {section.heading}
            </h2>

            {section.paragraphs?.map((para, j) => (
              <p key={`p-${j}`} className="mb-4">
                {para}
              </p>
            ))}

            {section.bullets && (
              <ul className="mb-4 list-disc space-y-2 pl-5">
                {section.bullets.map((item, j) => (
                  <li key={`b-${j}`}>{item}</li>
                ))}
              </ul>
            )}

            {section.table && (
              // Policy tables can exceed the viewport on a phone; scroll the
              // table itself rather than letting the page scroll sideways.
              <div className="mb-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {section.table.headers.map((h) => (
                        <th key={h} className="py-2 pr-4 font-semibold text-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row, j) => (
                      <tr key={`r-${j}`} className="border-b border-border/50">
                        {row.map((cell, k) => (
                          <td key={`c-${k}`} className="py-2 pr-4">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        {doc.footnote && (
          <p className="mt-10 border-t border-border pt-6 text-xs">{doc.footnote}</p>
        )}
      </article>
    </PublicShell>
  );
}
