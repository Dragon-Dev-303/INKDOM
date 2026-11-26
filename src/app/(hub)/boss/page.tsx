import type { Metadata } from 'next';
import BossScreen from '@/components/hub/BossScreen';

export const metadata: Metadata = { title: 'Boss editor · Inkdom' };

export default function Page() {
  return <BossScreen />;
}
