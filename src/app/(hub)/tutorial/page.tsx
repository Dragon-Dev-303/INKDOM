import type { Metadata } from 'next';
import TutorialScreen from '@/components/hub/TutorialScreen';

export const metadata: Metadata = { title: 'Training · Inkdom' };

export default function Page() {
  return <TutorialScreen />;
}
