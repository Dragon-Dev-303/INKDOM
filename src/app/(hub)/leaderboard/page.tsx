import type { Metadata } from 'next';
import LeaderboardScreen from '@/components/hub/LeaderboardScreen';

export const metadata: Metadata = { title: 'Leaderboard · Inkdom' };

export default function Page() {
  return <LeaderboardScreen />;
}
