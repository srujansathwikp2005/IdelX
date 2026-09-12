import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketplace/legal";
import { CANCELLATION_DOC as doc } from "@/config/legal/cancellation-refund";

export const metadata: Metadata = { title: doc.title, description: doc.description };

export default function CancellationRefundPage() {
  return <LegalDocument doc={doc} />;
}
