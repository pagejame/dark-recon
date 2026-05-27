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
        <div className="flex min-w-0 flex-1 flex-col md:min-h-screen md:overflow-hidden">
          <TopBar />
          <TickerTape />
          <PullToRefresh>
            <main className="main-content w-full p-3.5 md:p-6">
              {children}
            </main>
          </PullToRefresh>
        </div>
      </div>
      <MobileBottomNav />
    </>
  );
}
