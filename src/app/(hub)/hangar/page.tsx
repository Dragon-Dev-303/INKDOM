import type { Metadata } from 'next';
import HangarScreen from '@/components/hub/HangarScreen';

export const metadata: Metadata = { title: 'Bot hangar · Inkdom' };

export default function Page() {
  return <HangarScreen />;
}
