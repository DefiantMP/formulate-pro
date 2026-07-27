import FormulationDetailPage from '@/components/FormulationDetailPage';

export default function FormulationDetail({ params }: { params: { id: string } }) {
  return <FormulationDetailPage id={params.id} />;
}
