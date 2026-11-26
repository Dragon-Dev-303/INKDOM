import type { Metadata } from 'next';
import MovesScreen from '@/components/hub/MovesScreen';

export const metadata: Metadata = { title: 'Move list · Inkdom' };

export default function Page() {
  return <MovesScreen />;
}
