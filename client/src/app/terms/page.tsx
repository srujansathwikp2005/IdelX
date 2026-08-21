import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketplace/legal";
import { TERMS_DOC as doc } from "@/config/legal/terms";

export const metadata: Metadata = { title: doc.title, description: doc.description };

export default function TermsPage() {
  return <LegalDocument doc={doc} />;
}
