import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { runChatTurn, type ChatMessage } from '@/lib/chat';
import {
  buildTroubleshootSystemPrompt,
  effectiveLineageId,
  findRelevantCrossFormulationNotes,
  type CrossFormulationCandidate,
  type SavedFormulationActive,
  type SavedFormulationRecord,
} from '@/lib/savedFormulations';

function isValidHistoryMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false;
  const msg = m as Record<string, unknown>;
  return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
}

/**
 * On-demand troubleshooting chat for one formulation lineage. Never trusts
 * client-supplied composition/outcome context — always reloads the full
 * version chain from the DB (same query as the [id]/versions route) so the
 * system prompt is grounded in real saved data, not whatever the client
 * claims. The client only supplies the free-text message plus prior
 * user/assistant turns for conversational continuity.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history.filter(isValidHistoryMessage) : [];

  const target = await prisma.savedFormulation.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
  }

  const lineageId = effectiveLineageId(target);
  const versionRows = await prisma.savedFormulation.findMany({
    where: { OR: [{ lineageId }, { id: lineageId }] },
    orderBy: { version: 'asc' },
  });
  const versions: SavedFormulationRecord[] = versionRows.map((v) => ({
    id: v.id,
    name: v.name,
    tabletWeightG: v.tabletWeightG,
    referenceBatchTablets: v.referenceBatchTablets,
    actives: v.actives as unknown as SavedFormulationActive[],
    fillerName: v.fillerName,
    disintegrantName: v.disintegrantName,
    disintegrantPercent: v.disintegrantPercent,
    lubricantName: v.lubricantName,
    lubricantPercent: v.lubricantPercent,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    lineageId: v.lineageId,
    version: v.version,
    parentId: v.parentId,
    status: v.status as SavedFormulationRecord['status'],
    outcomeNotes: v.outcomeNotes,
    equipmentNotes: v.equipmentNotes,
  }));

  // Cross-formulation knowledge: pulls relevant history from OTHER
  // formulations' saved iterations into the prompt, additive to the
  // per-lineage version history above (which is unchanged). A single lean
  // select over every saved iteration — cheap even at hundreds of rows,
  // since findRelevantCrossFormulationNotes' hard caps (not this query) are
  // what bound actual prompt/request cost as the library grows.
  const allCandidateRows = await prisma.savedFormulation.findMany({
    select: {
      id: true,
      name: true,
      version: true,
      lineageId: true,
      createdAt: true,
      status: true,
      outcomeNotes: true,
      equipmentNotes: true,
      actives: true,
      fillerName: true,
      disintegrantName: true,
      lubricantName: true,
    },
  });
  const candidates: CrossFormulationCandidate[] = allCandidateRows.map((c) => ({
    id: c.id,
    name: c.name,
    version: c.version,
    lineageId: c.lineageId,
    createdAt: c.createdAt.toISOString(),
    status: c.status as SavedFormulationRecord['status'],
    outcomeNotes: c.outcomeNotes,
    equipmentNotes: c.equipmentNotes,
    actives: c.actives as unknown as SavedFormulationActive[],
    fillerName: c.fillerName,
    disintegrantName: c.disintegrantName,
    lubricantName: c.lubricantName,
  }));
  const latestVersion = versions[versions.length - 1];
  const crossFormulationContext = findRelevantCrossFormulationNotes(candidates, lineageId, latestVersion, message);

  const systemPrompt = buildTroubleshootSystemPrompt(versions, crossFormulationContext);

  // Cost observability: this is the "actual context size being sent" per
  // the requirement — logged server-side (always) and echoed in the
  // response as an extra field the existing ChatPanel UI simply ignores
  // (it only reads .reply), so nothing about the chat UI/flow changes.
  const estimatedSystemPromptTokens = Math.ceil(systemPrompt.length / 4);
  console.log(
    `[troubleshoot-chat] formulation=${params.id} lineage=${lineageId} ` +
      `crossFormulationMatched=${crossFormulationContext.matched.length}/${candidates.length} ` +
      `crossFormulationEstTokens=${crossFormulationContext.estimatedTokens} ` +
      `systemPromptEstTokens=${estimatedSystemPromptTokens}`
  );

  const client = new Anthropic({ apiKey });
  const outcome = await runChatTurn(
    { systemPrompt, history, userMessage: message },
    (params) => client.messages.create(params)
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json({
    reply: outcome.reply,
    contextStats: {
      crossFormulationCandidates: candidates.length,
      crossFormulationMatched: crossFormulationContext.matched.length,
      estimatedSystemPromptTokens,
    },
  });
}
