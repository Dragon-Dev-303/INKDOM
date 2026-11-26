import type { ReactNode } from 'react';
import AppShell from '@/components/shell/AppShell';
import './hub.css';

/** Every hub screen shares the shell (route group: URLs have no prefix). */
export default function HubLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
