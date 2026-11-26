import type { Metadata } from 'next';
import { Suspense } from 'react';
import CityScreen from '@/components/hub/CityScreen';
import { Loading } from '@/components/hub/ui';
import { services } from '@/services';

export const metadata: Metadata = { title: 'City · Inkdom' };

type Params = Promise<{ id: string }>;

/** Prerender every known id (cacheComponents needs at least one); unknown ids render on demand. */
export async function generateStaticParams() {
  const ids = await services.world.listCityIds();
  return ids.map((id) => ({ id }));
}

async function FromParams({ params }: { params: Params }) {
  const { id } = await params;
  return <CityScreen id={decodeURIComponent(id)} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="hub-page"><Loading /></div>}>
      <FromParams params={params} />
    </Suspense>
  );
}
