import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketplace/legal";
import { COMMUNITY_GUIDELINES_DOC as doc } from "@/config/legal/community-guidelines";

export const metadata: Metadata = { title: doc.title, description: doc.description };

export default function CommunityGuidelinesPage() {
  return <LegalDocument doc={doc} />;
}
