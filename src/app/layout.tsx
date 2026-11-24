import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inkdom (Beta)',
  description: 'Local two-player stickman building siege. Capture the rooftop flag or hold the building.',
};

export const viewport: Viewport = {
  themeColor: '#0d0f15',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
