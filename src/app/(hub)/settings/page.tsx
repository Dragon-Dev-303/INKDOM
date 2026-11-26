import type { Metadata } from 'next';
import SettingsScreen from '@/components/hub/SettingsScreen';

export const metadata: Metadata = { title: 'Settings · Inkdom' };

export default function Page() {
  return <SettingsScreen />;
}
