import { Sidebar } from '@/components/layout/Sidebar';
import { GlobalCriticalBanner } from '@/components/HealthBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <GlobalCriticalBanner />
        {children}
      </main>
    </div>
  );
}
