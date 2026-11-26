import type { Metadata } from 'next';
import AccountScreen from '@/components/account/AccountScreen';

export const metadata: Metadata = { title: 'Account · Inkdom' };

export default function Page() {
  return <AccountScreen />;
}
