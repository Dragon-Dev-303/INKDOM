import type { Metadata } from 'next';
import OnlineScreen from '@/components/online/OnlineScreen';

export const metadata: Metadata = { title: 'Play online · Inkdom' };

export default function Page() {
  return <OnlineScreen />;
}
