import type { Metadata } from 'next';
import EventsScreen from '@/components/hub/EventsScreen';

export const metadata: Metadata = { title: 'Events · Inkdom' };

export default function Page() {
  return <EventsScreen />;
}
