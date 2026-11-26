import type { Metadata } from 'next';
import ProfileScreen from '@/components/hub/ProfileScreen';

export const metadata: Metadata = { title: 'Profile · Inkdom' };

export default function Page() {
  return <ProfileScreen />;
}
