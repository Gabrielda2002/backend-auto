import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Footer } from './footer';

interface PageShellProps {
  title: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
  children: ReactNode;
}

export function PageShell({ title, badge, badgeVariant, children }: PageShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-64 flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar title={title} badge={badge} badgeVariant={badgeVariant} />
        <main className="min-w-0 flex-1 space-y-gutter p-gutter">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
