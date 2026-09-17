'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placePopover, type Placement } from '@/lib/popoverPosition';

/**
 * A small floating panel anchored to a control, rendered at the page level.
 *
 * Rendered through a portal on purpose: positioned inside the card it belongs
 * to, it was clipped by `.card`'s `overflow: hidden` and the 270px input
 * column — a confirm box lost its buttons at every window size. At the page
 * level nothing can clip it, and lib/popoverPosition.ts keeps it on screen:
 * it shifts sideways, flips above the anchor when there is no room below,
 * narrows on a small window, and scrolls its own content rather than being
 * cut off. Position is recomputed on scroll, resize and content change.
 *
 * Closes on Escape or a click outside, so it can never be left stranded.
 */
export default function Popover({
  anchorRef,
  open,
  onClose,
  children,
  width = 290,
  prefer = 'below',
  label,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  prefer?: 'below' | 'above';
  /** Accessible name for the dialog. */
  label: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    // scrollHeight, not offsetHeight: the panel may already be capped by a
    // previous pass, and measuring the capped height would ratchet it down.
    // It excludes the border, though, while max-height under border-box
    // includes it — so the border is added back. Without it the cap came out
    // ~2px short of what the box needs and the squeeze landed on the bottom
    // padding, leaving the buttons looking stuck to the edge.
    const borders = panel.offsetHeight - panel.clientHeight;
    setPlacement(
      placePopover({
        anchor: { left: a.left, top: a.top, width: a.width, height: a.height },
        desiredWidth: width,
        contentHeight: Math.ceil(panel.scrollHeight + borders),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
    );
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    reposition();
    const panel = panelRef.current;
    const observer = panel ? new ResizeObserver(reposition) : null;
    if (panel && observer) observer.observe(panel);
    // Capture phase: any scrolling ancestor moves the anchor, not just window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    // Deferred so the click that opened it does not immediately close it.
    const id = window.setTimeout(() => document.addEventListener('mousedown', onPointer), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      className="popover"
      role="dialog"
      aria-label={label}
      style={
        placement
          ? {
              left: placement.left,
              top: placement.top,
              width: placement.width,
              maxHeight: placement.maxHeight,
              overflowY: placement.scrolls ? 'auto' : 'visible',
            }
          : // First paint, before measuring: off-screen so nothing flashes in
            // the wrong place.
            { left: -9999, top: 0, width }
      }
    >
      {children}
    </div>,
    document.body
  );
}
