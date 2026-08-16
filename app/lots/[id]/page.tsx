import LotDetailPage from '@/components/LotDetailPage';

export default function LotDetail({ params }: { params: { id: string } }) {
  return <LotDetailPage id={params.id} />;
}
