import FormulationBuilderPage from '@/components/FormulationBuilderPage';

export default function NewFormulation({ searchParams }: { searchParams: { iterateFrom?: string } }) {
  return <FormulationBuilderPage iterateFromId={searchParams.iterateFrom} />;
}
