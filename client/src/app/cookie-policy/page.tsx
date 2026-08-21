import { PublicShell, PageHero } from "@/components/marketplace/app-shell";

export default function CookiePolicyPage() {
  return (
    <PublicShell>
      <PageHero title="Cookie Policy" eyebrow="Legal" description="How IdleX uses cookies and similar technologies." />
      <section className="mx-auto max-w-4xl px-4 py-10 text-sm leading-7 text-muted-foreground sm:px-6">
        This starter policy is a placeholder for legal review. It should describe the
        cookies IdleX sets, their purpose and lifetime, which are strictly necessary
        versus optional, any third-party cookies, and how a visitor can withdraw
        consent.
      </section>
    </PublicShell>
  );
}
