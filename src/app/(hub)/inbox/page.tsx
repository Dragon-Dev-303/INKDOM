import type { Metadata } from 'next';
import InboxScreen from '@/components/hub/InboxScreen';

export const metadata: Metadata = { title: 'Inbox · Inkdom' };

export default function Page() {
  return <InboxScreen />;
}
