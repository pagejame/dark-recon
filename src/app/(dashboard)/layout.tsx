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
    <>
      <div className="flex min-h-screen flex-row overflow-x-hidden bg-bg-primary">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden pb-20 md:pb-0">
          <TopBar />
          <TickerTape />
          <PullToRefresh>
            <main className="min-w-0 flex-1 overflow-auto p-3.5 md:p-6">{children}</main>
          </PullToRefresh>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
