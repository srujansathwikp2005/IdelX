import { AdminGate, AdminSettlementsPage } from "@/components/marketplace/admin-pages";

export default function SettlementsAdminPage() {
  return (
    <AdminGate>
      <AdminSettlementsPage />
    </AdminGate>
  );
}
