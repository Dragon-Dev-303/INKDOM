import type { Metadata } from 'next';
import CommanderScreen from '@/components/hub/CommanderScreen';

export const metadata: Metadata = { title: 'Commander · Inkdom' };

export default function Page() {
  return <CommanderScreen />;
}
