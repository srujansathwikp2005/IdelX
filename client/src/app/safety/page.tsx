import { PublicShell, PageHero } from "@/components/marketplace/app-shell";

const KYC_REQUIREMENTS = [
  {
    title: "Personal Information",
    needs: ["Full Name", "Date of Birth", "Email ID", "Phone Number"],
    why: "To identify you and create your profile.",
  },
  {
    title: "Identity Proof",
    needs: "Need any one of the following",
    examples: ["Aadhaar Card", "PAN Card", "Passport", "Voter ID"],
    why: "To verify your identity and prevent fraud.",
  },
  {
    title: "Address Proof",
    needs: "Need any one of the following",
    examples: ["Aadhaar Card", "Utility Bill", "Rent Agreement", "Bank Statement"],
    why: "To verify your residential address.",
  },
  {
    title: "Verification Required",
    needs: "Live Selfie",
    why: "To match your face with your ID and ensure you are real.",
  },
  {
    title: "Account Details",
    needs: ["Account Holder Name", "Account Number", "IFSC Code", "Cheque / Passbook", "Bank"],
    why: "To securely transfer earnings.",
  },
  {
    title: "Additional Information",
    needs: ["Occupation Type", "Alternate Phone Number", "Emergency Contact (Optional)"],
    why: "To build trust and strengthen your profile.",
  },
];

export default function SafetyPage() {
  return (
<PublicShell>
  <PageHero
    title="Safety & KYC Verification"
    eyebrow="Trust & Safety"
    description="We follow RBI & Government guidelines to keep the community safe. Here&apos;s the verification path — what happens at each stage, and why."
  />

  <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
    <div className="relative">
      {/* Spine — the single continuous flow line every node sits on */}
      <div className="absolute left-5.75 top-3 bottom-3 w-0.5 bg-primary sm:left-6.75" />

      {/* Start node */}
      <div className="relative flex items-center gap-5 pb-10">
        <div className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary bg-panel">
          <svg className="h-5 w-5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8l5 4-5 4V8Z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Verification Started
        </p>
      </div>

      {/* Flow steps */}
      {KYC_REQUIREMENTS.map((item, index) => {
        const isLast = index === KYC_REQUIREMENTS.length - 1;
        return (
          <div key={item.title} className="relative flex gap-5 pb-10">
            {/* Node */}
            <div className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary font-serif text-base font-bold text-on-brand shadow-[3px_3px_0_0_#17264A22]">
              {index + 1}
            </div>

            {/* Direction arrow on the spine, between this node and the next */}
            {!isLast && (
              <svg
                className="absolute left-3.75 top-13 h-3 w-4 text-foreground sm:left-4.75"
                viewBox="0 0 16 10"
                fill="currentColor"
              >
                <path d="M8 10 0 2l1.4-1.4L8 7.2 14.6.6 16 2 8 10Z" />
              </svg>
            )}

            {/* Node content */}
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
              {/* Main card */}
              <div className="min-w-0 flex-1 rounded-md border-2 border-primary bg-card p-4">
                <h2 className="font-serif text-base font-semibold text-foreground">
                  {item.title}
                </h2>

                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {typeof item.needs === "string" ? "Needed" : "Needed — all of these"}
                </p>
                {typeof item.needs === "string" ? (
                  <p className="mt-1 text-sm text-foreground">{item.needs}</p>
                ) : (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.needs.map((need) => (
                      <li
                        key={need}
                        className="rounded border border-primary/40 bg-primary/4 px-2 py-0.5 font-mono text-[11px] text-foreground"
                      >
                        {need}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Connector to annotation */}
              <div className="hidden w-6 shrink-0 items-center justify-center sm:flex">
                <div className="h-px w-full border-t border-dashed border-warning" />
              </div>

              {/* "Why" annotation — a branch off the main flow, not stacked inside the card */}
              <div className="w-full shrink-0 rounded-md border border-warning bg-warning/6 p-3 sm:w-48">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-warning">
                  Why
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground">{item.why}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Terminal node — Verified */}
      <div className="relative flex items-center gap-5">
        <div className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-success bg-success">
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-serif text-sm font-semibold text-success">Verified &amp; Approved</p>
          <p className="text-xs text-muted-foreground">You&apos;re clear to list or book on IdleX.</p>
        </div>
      </div>
    </div>

    {/* Assurance footer — off the flow, not part of it */}
    <div className="mt-10 flex items-center gap-3 rounded-md border border-border bg-panel px-4 py-3">
      <svg className="h-4 w-4 shrink-0 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      </svg>
      <p className="text-xs text-[#6F6B60]">
        We use reasonable security measures to protect your information. Information may be shared with trusted service providers or other parties where necessary to operate IdelX, process payments, perform verification, maintain safety, or comply with law.
      </p>
    </div>
  </section>
</PublicShell>
  );
}
