import { AdminGate, AdminManualPaymentsPage } from "@/components/marketplace/admin-pages";

export default function ManualPaymentsAdminPage() {
  return (
    <AdminGate>
      <AdminManualPaymentsPage />
    </AdminGate>
  );
}
