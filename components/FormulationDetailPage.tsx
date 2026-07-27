'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import VersionHistoryPanel from './VersionHistoryPanel';
import ChatPanel, { type ChatMessage } from './ChatPanel';
import { deriveSavedFormulation, type SavedFormulationRecord } from '@/lib/savedFormulations';
import { fmt } from '@/lib/format';

interface FormulationDetailPageProps {
  id: string;
}

export default function FormulationDetailPage({ id }: FormulationDetailPageProps) {
  const [formulation, setFormulation] = useState<SavedFormulationRecord | null | undefined>(undefined);

  useEffect(() => {
    setFormulation(undefined);
    fetch(`/api/saved-formulations/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setFormulation);
  }, [id]);

  const derived = formulation ? deriveSavedFormulation(formulation) : null;

  async function handleChatSend(message: string, history: ChatMessage[]): Promise<string> {
    const res = await fetch(`/api/saved-formulations/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.reply !== 'string') {
      throw new Error(data?.error || 'Chat unavailable right now.');
    }
    return data.reply;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/formulations" className="btn">
              <i className="ti ti-arrow-left" /> Formulations
            </Link>
            <div className="topbar-title">{formulation ? formulation.name : 'Formulation'}</div>
          </div>
          {formulation && (
            <div className="topbar-right">
              <Link href={`/formulations/new?iterateFrom=${id}`} className="btn btn-p">
                <i className="ti ti-git-branch" /> Iterate
              </Link>
            </div>
          )}
        </div>
        <div className="rh-page">
          {formulation === undefined ? (
            <div className="card">
              <div className="empty">
                <i className="ti ti-library" />
                Loading…
              </div>
            </div>
          ) : formulation === null ? (
            <div className="card">
              <div className="empty">
                <i className="ti ti-alert-triangle" />
                Formulation not found
              </div>
            </div>
          ) : (
            <>
            <div className="card card-body">
              <div className="stats">
                <div className="stat">
                  <div className="stat-lbl">Tablet weight</div>
                  <div className="stat-val">{fmt(formulation.tabletWeightG, 3)}</div>
                  <div className="stat-unit">grams</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Reference batch</div>
                  <div className="stat-val">{formulation.referenceBatchTablets.toLocaleString()}</div>
                  <div className="stat-unit">tablets</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Target potency</div>
                  <div className="stat-val">{derived!.combinedActivePercent.toFixed(2)}%</div>
                  <div className="stat-unit">of blend</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Total batch weight</div>
                  <div className="stat-val">{fmt(derived!.totalBatchG, 0)}</div>
                  <div className="stat-unit">grams</div>
                </div>
              </div>

              <div className="add-sub" style={{ marginTop: 16 }}>
                Active ingredients
              </div>
              <table className="var-tbl">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>mg / tablet</th>
                    <th>Potency</th>
                    <th>% of blend</th>
                    <th>Source</th>
                    <th>g / batch</th>
                  </tr>
                </thead>
                <tbody>
                  {derived!.actives.map((a) => (
                    <tr key={a.label}>
                      <td>{a.label}</td>
                      <td>{fmt(a.targetMgPerTablet, 1)}</td>
                      <td>{a.potencyPercent.toFixed(2)}%</td>
                      <td>{a.percentOfBlend.toFixed(3)}%</td>
                      <td>{a.source || '—'}</td>
                      <td>{fmt(a.gramsPerBatch, 1)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="add-sub" style={{ marginTop: 16 }}>
                Excipients
              </div>
              <div>
                <div className="add-row key">
                  <div className="add-lbl">
                    <i className="ti ti-cube" />
                    {formulation.fillerName} (filler, auto)
                  </div>
                  <div className="add-val green">
                    {derived!.fillerPercent.toFixed(2)}% · {fmt(derived!.fillerGramsPerBatch, 1)} g
                  </div>
                </div>
                {formulation.disintegrantName && (
                  <div className="add-row">
                    <div className="add-lbl">
                      <i className="ti ti-circle-plus" />
                      {formulation.disintegrantName}
                    </div>
                    <div className="add-val">
                      {(formulation.disintegrantPercent ?? 0).toFixed(2)}% ·{' '}
                      {fmt(derived!.disintegrantGramsPerBatch ?? 0, 1)} g
                    </div>
                  </div>
                )}
                {formulation.lubricantName && (
                  <div className="add-row">
                    <div className="add-lbl">
                      <i className="ti ti-droplet" />
                      {formulation.lubricantName}
                    </div>
                    <div className="add-val">
                      {(formulation.lubricantPercent ?? 0).toFixed(2)}% ·{' '}
                      {fmt(derived!.lubricantGramsPerBatch ?? 0, 1)} g
                    </div>
                  </div>
                )}
              </div>

              {formulation.notes && (
                <>
                  <div className="add-sub" style={{ marginTop: 16 }}>
                    Notes
                  </div>
                  <div className="rh-cell">{formulation.notes}</div>
                </>
              )}
            </div>

            <VersionHistoryPanel currentId={id} />

            <div className="card">
              <div className="card-hdr">
                <div className="card-hdr-title">
                  <i className="ti ti-message-circle" /> Troubleshoot
                </div>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <ChatPanel
                  title="this formulation's history"
                  icon="message-circle"
                  placeholder="Describe an issue, e.g. &quot;tablets are capping&quot;…"
                  emptyHint="Describe an issue (e.g. capping, sticking) to get advisory suggestions grounded in this formulation's version history."
                  onSend={handleChatSend}
                />
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
