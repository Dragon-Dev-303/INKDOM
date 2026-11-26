import type { Metadata } from 'next';
import HubHome from '@/components/hub/HubHome';

export const metadata: Metadata = { title: 'Inkdom' };

export default function Page() {
  return <HubHome />;
}
