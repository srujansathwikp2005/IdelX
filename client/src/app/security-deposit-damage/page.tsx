import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketplace/legal";
import { DEPOSIT_DOC as doc } from "@/config/legal/security-deposit";

export const metadata: Metadata = { title: doc.title, description: doc.description };

export default function SecurityDepositDamagePage() {
  return <LegalDocument doc={doc} />;
}
