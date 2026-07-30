'use client';

import { useState, type KeyboardEvent } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatPanelProps {
  title: string;
  icon?: string;
  placeholder?: string;
  emptyHint?: string;
  /** Sends one message plus prior history, resolves to the assistant's reply text, or throws/rejects on failure. */
  onSend: (message: string, history: ChatMessage[]) => Promise<string>;
}

/**
 * Generic, reusable on-demand chat UI with zero knowledge of what it's
 * chatting about — the parent supplies onSend (message + prior history in,
 * reply text out) and everything else (message list, input, loading, error
 * state) lives here. Built for the Formulations troubleshooting chat, but
 * deliberately free of any Formulation-specific logic so a future
 * R&D-memory chatbot can reuse it verbatim with a different onSend.
 */
export default function ChatPanel({ title, icon = 'message-circle', placeholder, emptyHint, onSend }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const reply = await onSend(text, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat unavailable right now.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty">
            <i className={`ti ti-${icon}`} />
            {emptyHint ?? `Ask ${title} a question to get started.`}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.content}
            </div>
          ))
        )}
        {sending && <div className="chat-bubble assistant chat-typing">Thinking…</div>}
      </div>
      {error && (
        <div className="warn-row">
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder={placeholder ?? 'Type a message…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={2}
        />
        <button className="btn btn-p chat-send-btn" onClick={send} disabled={sending || !input.trim()}>
          <i className="ti ti-send" />
        </button>
      </div>
    </div>
  );
}
