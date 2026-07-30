'use client';

import { useState } from 'react';
import ChatPanel, { type ChatPanelProps } from './ChatPanel';

/**
 * Fixed bottom-right collapsible wrapper around the generic ChatPanel —
 * presentation only, no chat logic of its own. Collapsed state is a small
 * round bubble button; expanded state is a compact fixed-size panel
 * floating above page content rather than occupying inline layout space.
 */
export default function FloatingChatWidget({ title, icon = 'message-circle', ...chatProps }: ChatPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="chat-widget-fab" onClick={() => setOpen(true)} aria-label={`Open ${title} chat`}>
        <i className={`ti ti-${icon}`} />
      </button>
    );
  }

  return (
    <div className="chat-widget-panel">
      <div className="chat-widget-hdr">
        <div className="chat-widget-hdr-title">
          <i className={`ti ti-${icon}`} /> {title}
        </div>
        <button className="chat-widget-close" onClick={() => setOpen(false)} aria-label="Close chat">
          <i className="ti ti-x" />
        </button>
      </div>
      <ChatPanel title={title} icon={icon} {...chatProps} />
    </div>
  );
}
