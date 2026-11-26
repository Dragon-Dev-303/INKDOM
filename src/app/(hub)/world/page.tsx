import type { Metadata } from 'next';
import WorldScreen from '@/components/hub/WorldScreen';

export const metadata: Metadata = { title: 'World map · Inkdom' };

export default function Page() {
  return <WorldScreen />;
}
