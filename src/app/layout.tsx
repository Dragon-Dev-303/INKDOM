import type { Metadata, Viewport } from 'next';
import { AccountProvider } from '@/lib/account/AccountContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inkdom',
  description: 'Stickman building sieges: fight as a boss, command a squad, capture the rooftop flag. Local and online.',
};

export const viewport: Viewport = {
  themeColor: '#0d0f15',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  );
}
