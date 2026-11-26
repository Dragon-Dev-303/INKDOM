import type { Metadata } from 'next';
import TeamScreen from '@/components/hub/TeamScreen';

export const metadata: Metadata = { title: 'Team · Inkdom' };

export default function Page() {
  return <TeamScreen />;
}
