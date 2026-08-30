import { AdminGate } from "@/components/marketplace/admin-pages";
import { AdminShell } from "@/components/marketplace/admin-shell";
import { PaymentSettingsCard } from "@/components/marketplace/payment-settings";

export default function AdminSystemSettingsPage() {
  return (
    <AdminGate>
      <AdminShell>
        <div className="mb-5">
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Settings that take effect without a release.
          </p>
        </div>
        <div className="flex flex-col gap-5">
          <PaymentSettingsCard />
        </div>
      </AdminShell>
    </AdminGate>
  );
}
