import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import TickerTape from '@/components/layout/TickerTape';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import PullToRefresh from '@/components/layout/PullToRefresh';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-screen min-w-0 flex-row overflow-x-hidden bg-bg-primary">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <TickerTape />
          <PullToRefresh>
            <main className="min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-3.5 pb-[calc(4rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
              {children}
            </main>
          </PullToRefresh>
        </div>
      </div>
      <MobileBottomNav />
    </>
  );
}
