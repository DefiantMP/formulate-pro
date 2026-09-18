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
  source?: 'typed' | 'text_file' | 'transcribed';
  attachment?: { id: string; filename: string; mediaType: string } | null;
}

/** One uploaded file awaiting review, as returned by POST /api/imports. */
interface PendingImport {
  attachmentId: string;
  filename: string;
  kind: 'image' | 'pdf' | 'text' | 'docx';
  method: 'text_file' | 'transcribed';
  text: string;
  illegibleCount: number;
  reviewHints: string[];
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<PendingImport[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  /**
   * Read each chosen file in turn. Readings join a review queue; nothing is
   * saved until the reviewer accepts it. A file that fails to read is
   * reported by name and skipped — the others still come through.
   */
  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImportErrors([]);
    for (const file of Array.from(files)) {
      setReading(file.name);
      try {
        const form = new FormData();
        form.set('file', file);
        form.set('purpose', 'note');
        const res = await fetch('/api/imports', { method: 'POST', body: form });
        const d = await res.json().catch(() => null);
        if (!res.ok) {
          setImportErrors((prev) => [...prev, `${file.name}: ${d?.error || 'could not be read'}`]);
          continue;
        }
        setQueue((prev) => [...prev, d as PendingImport]);
      } catch {
        setImportErrors((prev) => [...prev, `${file.name}: could not reach the server`]);
      }
    }
    setReading(null);
    if (fileInput.current) fileInput.current.value = '';
  }

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
          <button
            type="button"
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={!!reading}
            title="Photos of handwritten notes, PDFs, Word or text files"
          >
            <i className="ti ti-file-upload" /> {reading ? 'Reading…' : 'Import notes'}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.md,.docx,image/jpeg,image/png,application/pdf,text/plain"
            onChange={(e) => importFiles(e.target.files)}
          />
        </div>
        {reading && <div className="field-hint">Reading {reading}… handwriting can take a few seconds.</div>}
        {importErrors.map((err) => (
          <div className="rm-inline-err" key={err}>
            {err}
          </div>
        ))}
        {queue.length > 0 && (
          <ImportReview
            key={queue[0].attachmentId}
            item={queue[0]}
            remaining={queue.length - 1}
            fixedProduct={product}
            fixedRunId={runId}
            products={products}
            runsForProduct={runsForProduct}
            onSaved={(note) => {
              setNotes((prev) => [note, ...(prev ?? [])]);
              setQueue((prev) => prev.slice(1));
            }}
            onDiscard={() => setQueue((prev) => prev.slice(1))}
          />
        )}
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
      {note.attachment && (
        <a className="labnote-source" href={`/api/attachments/${note.attachment.id}`} target="_blank" rel="noreferrer">
          <i className="ti ti-paperclip" />
          {note.source === 'transcribed' ? 'Transcribed from ' : 'Imported from '}
          {note.attachment.filename} — view original
        </a>
      )}
      {retracted && (
        <div className="labnote-retraction">
          Retracted {fmtDateTime(note.retractedAt!)} by {note.retractedBy?.name ?? 'someone not signed in'}:{' '}
          {note.retractedReason}
        </div>
      )}
    </div>
  );
}

/**
 * Check one imported note against its original before it is saved.
 *
 * The original sits beside the editable text, so every word — and above all
 * every number — can be compared. Transcribed notes carry the model's own
 * doubts ([illegible] markers, review hints) up front, and cannot be saved
 * while an [illegible] marker is left in: the reviewer must resolve it,
 * even if only by writing "unreadable" in its place.
 */
function ImportReview({
  item,
  remaining,
  fixedProduct,
  fixedRunId,
  products,
  runsForProduct,
  onSaved,
  onDiscard,
}: {
  item: PendingImport;
  remaining: number;
  fixedProduct?: string;
  fixedRunId?: string;
  products: string[];
  runsForProduct?: RunOption[];
  onSaved: (note: LabNoteRecord) => void;
  onDiscard: () => void;
}) {
  const [text, setText] = useState(item.text);
  const [noteProduct, setNoteProduct] = useState('');
  const [noteRunId, setNoteRunId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unresolved = (text.match(/\[illegible\]/gi) ?? []).length;
  const originalUrl = `/api/attachments/${item.attachmentId}`;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lab-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text,
          product: fixedProduct ?? (noteProduct.trim() || null),
          runId: fixedRunId ?? (noteRunId || null),
          source: item.method,
          attachmentId: item.attachmentId,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error || 'Could not save the note.');
        return;
      }
      onSaved(d);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="import-review">
      <div className="import-review-hdr">
        <div>
          <b>Check this {item.method === 'transcribed' ? 'transcription' : 'import'}</b> — {item.filename}
          {remaining > 0 && <span className="prod-muted"> · {remaining} more waiting</span>}
        </div>
        <a href={originalUrl} target="_blank" rel="noreferrer">
          Open original <i className="ti ti-external-link" />
        </a>
      </div>
      <div className="import-review-grid">
        <div className="import-review-original">
          {item.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={originalUrl} alt={`Original: ${item.filename}`} />
          ) : (
            <div className="empty">
              <i className="ti ti-file-text" />
              {item.kind === 'pdf' ? 'PDF' : item.kind === 'docx' ? 'Word document' : 'Text file'} — use “Open
              original” to compare
            </div>
          )}
        </div>
        <div className="import-review-edit">
          {item.method === 'transcribed' && (
            <div className="field-hint" style={{ marginBottom: 6 }}>
              Read by AI from the original. Check every number and word against it before saving.
            </div>
          )}
          {item.reviewHints.length > 0 && (
            <ul className="import-review-hints">
              {item.reviewHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} />
          {unresolved > 0 && (
            <div className="warn-row">
              <i className="ti ti-alert-triangle" />
              <div>
                {unresolved} [illegible] {unresolved === 1 ? 'spot' : 'spots'} left — replace each with what the
                original says, or with “unreadable”, before saving.
              </div>
            </div>
          )}
          {!fixedProduct && !fixedRunId && (
            <>
              <input
                type="text"
                list="labnote-products"
                placeholder="Product (optional)"
                value={noteProduct}
                onChange={(e) => setNoteProduct(e.target.value)}
              />
            </>
          )}
          {fixedProduct && !fixedRunId && runsForProduct && runsForProduct.length > 0 && (
            <select value={noteRunId} onChange={(e) => setNoteRunId(e.target.value)}>
              <option value="">Whole product (no specific batch)</option>
              {runsForProduct.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {new Date(r.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          {error && <div className="rm-inline-err">{error}</div>}
          <div className="popover-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={onDiscard} disabled={saving}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-sm btn-p"
              onClick={save}
              disabled={saving || !text.trim() || unresolved > 0}
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
