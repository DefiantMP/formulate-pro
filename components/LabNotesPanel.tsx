'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Popover from './Popover';
import { fmtDateTime } from '@/lib/format';
import { LAB_NOTE_MAX_LENGTH } from '@/lib/labNotes';

export interface LabNoteRecord {
  id: string;
  body: string;
  product: string | null;
  runId: string | null;
  createdAt: string;
  retractedAt: string | null;
  retractedReason: string | null;
  author: { name: string } | null;
  retractedBy: { name: string } | null;
  run: { id: string; label: string; product: string | null; createdAt: string } | null;
}

interface RunOption {
  id: string;
  label: string;
  createdAt: string;
}

/**
 * A slice of the lab notebook plus a box to add to it.
 *
 * Scoped by `product` and/or `runId` — the product page shows every note
 * filed under that product (batch notes included), a batch shows only its
 * own. With neither, it is the whole notebook, and the author picks the
 * product and batch per note.
 *
 * Notes cannot be edited (lib/labNotes.ts): each can only be retracted,
 * with a reason, and stays visible struck through.
 */
export default function LabNotesPanel({
  product,
  runId,
  products = [],
  runsForProduct,
  emptyText = 'No notes yet.',
}: {
  product?: string;
  runId?: string;
  /** Suggestions for the product field, when the panel is unscoped. */
  products?: string[];
  /** Batches offered for attaching a note, when the panel is scoped to a product. */
  runsForProduct?: RunOption[];
  emptyText?: string;
}) {
  const [notes, setNotes] = useState<LabNoteRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [noteProduct, setNoteProduct] = useState('');
  const [noteRunId, setNoteRunId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRetracted, setShowRetracted] = useState(true);

  const scoped = !!(product || runId);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (product) qs.set('product', product);
    if (runId) qs.set('runId', runId);
    fetch(`/api/lab-notes?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(setNotes)
      .catch(() => setError('Could not load notes.'));
  }, [product, runId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lab-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          product: product ?? (noteProduct.trim() || null),
          runId: runId ?? (noteRunId || null),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error || 'Could not save the note.');
        return;
      }
      setBody('');
      setNoteRunId('');
      setNotes((prev) => [d, ...(prev ?? [])]);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const visible = (notes ?? []).filter((n) => showRetracted || !n.retractedAt);
  const retractedCount = (notes ?? []).filter((n) => n.retractedAt).length;

  return (
    <div className="labnotes">
      <div className="labnotes-compose">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            runId
              ? 'What happened on this batch?'
              : product
                ? `A note about ${product}…`
                : 'What did you learn, try or see?'
          }
          rows={3}
          maxLength={LAB_NOTE_MAX_LENGTH}
        />
        <div className="labnotes-compose-row">
          {!scoped && (
            <>
              <input
                type="text"
                list="labnote-products"
                placeholder="Product (optional)"
                value={noteProduct}
                onChange={(e) => setNoteProduct(e.target.value)}
              />
              <datalist id="labnote-products">
                {products.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
          {product && !runId && runsForProduct && runsForProduct.length > 0 && (
            <select value={noteRunId} onChange={(e) => setNoteRunId(e.target.value)}>
              <option value="">Whole product (no specific batch)</option>
              {runsForProduct.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {new Date(r.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-p" onClick={add} disabled={saving || !body.trim()}>
            <i className="ti ti-plus" /> {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
        <div className="field-hint">
          Internal only — never shown to clients. Notes can&apos;t be edited; retract a wrong one and
          write it again.
        </div>
        {error && <div className="rm-inline-err">{error}</div>}
      </div>

      {notes === null ? (
        <div className="empty">
          <i className="ti ti-notes" />
          Loading…
        </div>
      ) : notes.length === 0 ? (
        <div className="empty">
          <i className="ti ti-notes" />
          {emptyText}
        </div>
      ) : (
        <>
          {retractedCount > 0 && (
            <label className="labnotes-toggle">
              <input type="checkbox" checked={showRetracted} onChange={(e) => setShowRetracted(e.target.checked)} />
              Show retracted ({retractedCount})
            </label>
          )}
          {visible.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              showRunLink={!runId}
              showProduct={!product}
              onRetracted={(updated) => setNotes((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))}
            />
          ))}
        </>
      )}
    </div>
  );
}

function NoteItem({
  note,
  showRunLink,
  showProduct,
  onRetracted,
}: {
  note: LabNoteRecord;
  showRunLink: boolean;
  showProduct: boolean;
  onRetracted: (n: LabNoteRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);

  async function retract() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retractReason: reason }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error || 'Could not retract.');
        return;
      }
      setOpen(false);
      onRetracted(d);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const retracted = !!note.retractedAt;
  return (
    <div className={`labnote${retracted ? ' retracted' : ''}`}>
      <div className="labnote-meta">
        <span>{fmtDateTime(note.createdAt)}</span>
        <span>· {note.author?.name ?? 'Not signed in'}</span>
        {showProduct && note.product && <span className="labnote-tag">{note.product}</span>}
        {showRunLink && note.run && <span className="labnote-tag batch">{note.run.label}</span>}
        {!retracted && (
          <>
            <button ref={anchor} type="button" className="labnote-retract" onClick={() => setOpen(true)}>
              Retract
            </button>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={260} label="Retract this note?">
              <div className="popover-title">Retract this note?</div>
              <div className="popover-desc">It stays visible, struck through, with your reason.</div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? e.g. wrong batch"
                style={{ marginBottom: 10 }}
                autoFocus
              />
              {error && <div className="rm-inline-err" style={{ marginBottom: 8 }}>{error}</div>}
              <div className="popover-actions">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-sm btn-p" onClick={retract} disabled={busy || !reason.trim()}>
                  Retract
                </button>
              </div>
            </Popover>
          </>
        )}
      </div>
      <div className="labnote-body">{note.body}</div>
      {retracted && (
        <div className="labnote-retraction">
          Retracted {fmtDateTime(note.retractedAt!)} by {note.retractedBy?.name ?? 'someone not signed in'}:{' '}
          {note.retractedReason}
        </div>
      )}
    </div>
  );
}
