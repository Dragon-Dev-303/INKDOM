import type { Metadata } from 'next';
import ResetPassword from '@/components/account/ResetPassword';

export const metadata: Metadata = { title: 'Reset password · Inkdom' };

export default function Page() {
  return <ResetPassword />;
}
