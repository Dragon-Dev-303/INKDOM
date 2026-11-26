import type { Metadata } from 'next';
import HelpScreen from '@/components/hub/HelpScreen';

export const metadata: Metadata = { title: 'Help · Inkdom' };

export default function Page() {
  return <HelpScreen />;
}
