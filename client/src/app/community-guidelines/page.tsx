import { PublicShell, PageHero } from "@/components/marketplace/app-shell";

export default function CommunityGuidelinesPage() {
  return (
    <PublicShell>
      <PageHero title="Community Guidelines" eyebrow="Support" description="What we expect from renters and owners on IdleX." />
      <section className="mx-auto max-w-4xl px-4 py-10 text-sm leading-7 text-muted-foreground sm:px-6">
        These starter guidelines are a placeholder for review. They should cover
        acceptable listings, respectful communication, handover and return conduct,
        prohibited items, and how violations are reported and enforced.
      </section>
    </PublicShell>
  );
}
