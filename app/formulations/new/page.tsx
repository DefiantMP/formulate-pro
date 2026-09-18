import FormulationBuilderPage from '@/components/FormulationBuilderPage';

export default function NewFormulation({
  searchParams,
}: {
  searchParams: { iterateFrom?: string; importDraft?: string };
}) {
  return <FormulationBuilderPage iterateFromId={searchParams.iterateFrom} importDraftKey={searchParams.importDraft} />;
}
