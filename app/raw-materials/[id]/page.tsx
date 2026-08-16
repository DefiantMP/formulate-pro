import RawMaterialDetailPage from '@/components/RawMaterialDetailPage';

export default function RawMaterialDetail({ params }: { params: { id: string } }) {
  return <RawMaterialDetailPage id={params.id} />;
}
