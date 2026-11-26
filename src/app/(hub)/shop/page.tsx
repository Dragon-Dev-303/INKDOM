import type { Metadata } from 'next';
import ShopPage from '@/components/ShopPage';

export const metadata: Metadata = { title: 'Shop · Inkdom' };

export default function Page() {
  return <ShopPage />;
}
