import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import TickerTape from '@/components/layout/TickerTape';
import MobileNav from '@/components/layout/MobileNav';
import PullToRefresh from '@/components/layout/PullToRefresh';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col pb-20 md:pb-0">
        <TopBar />
        <TickerTape />
        <PullToRefresh>
          <main className="flex-1 overflow-auto p-3.5 md:p-6">{children}</main>
        </PullToRefresh>
      </div>
      <MobileNav />
    </div>
  );
}
