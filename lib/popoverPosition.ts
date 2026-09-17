/**
 * Where to put a floating panel so it is never cut off — pure geometry, no DOM.
 *
 * The panels that prompted this were positioned inside a card, and `.card` is
 * `overflow: hidden` inside a 270px column, so a 290px confirm box was clipped
 * on screens of every size. Position is computed against the VIEWPORT and the
 * panel is rendered at the page level, so no ancestor can clip it:
 *
 *  - it shifts sideways to stay fully on screen rather than running off an edge;
 *  - it flips above its button when there is not enough room below;
 *  - it narrows on a small window instead of overflowing;
 *  - if it still cannot fit, it gets a maxHeight and scrolls its own content,
 *    so the buttons at the bottom stay reachable rather than being cut away;
 *  - and it is clamped into the viewport even when its own anchor has been
 *    scrolled out of view, which these controls can be — they sit inside
 *    scrolling columns.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacementInput {
  /** The control the panel hangs off, in viewport coordinates. */
  anchor: Rect;
  /** Preferred panel size. Width is capped to the viewport; height may scroll. */
  desiredWidth: number;
  contentHeight: number;
  viewport: { width: number; height: number };
  /** Gap between anchor and panel. */
  gap?: number;
  /** Minimum breathing room from every viewport edge. */
  margin?: number;
  /** Which side to try first. */
  prefer?: 'below' | 'above';
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'below' | 'above';
  /** True when the panel had to be shortened and will scroll internally. */
  scrolls: boolean;
}

export function placePopover({
  anchor,
  desiredWidth,
  contentHeight,
  viewport,
  gap = 6,
  margin = 8,
  prefer = 'below',
}: PlacementInput): Placement {
  const width = Math.max(0, Math.min(desiredWidth, viewport.width - margin * 2));

  const spaceBelow = viewport.height - (anchor.top + anchor.height) - gap - margin;
  const spaceAbove = anchor.top - gap - margin;

  // Keep the preferred side unless it cannot fit and the other side is roomier.
  const preferredSpace = prefer === 'below' ? spaceBelow : spaceAbove;
  const otherSpace = prefer === 'below' ? spaceAbove : spaceBelow;
  const placement =
    contentHeight <= preferredSpace || preferredSpace >= otherSpace
      ? prefer
      : prefer === 'below'
        ? 'above'
        : 'below';

  // The anchor can be scrolled out of view — these controls live inside
  // scrolling columns — so the height is capped by the viewport itself, not
  // just by the space beside the anchor. Without this a panel anchored to a
  // button below the fold was positioned below the fold with it.
  const available = Math.max(0, placement === 'below' ? spaceBelow : spaceAbove);
  const viewportRoom = Math.max(0, viewport.height - margin * 2);
  const maxHeight = Math.min(contentHeight, Math.max(available, Math.min(contentHeight, viewportRoom)));
  const scrolls = contentHeight > maxHeight;

  // Right-aligned with the anchor by default (these hang off right-hand
  // buttons), then pulled back inside whichever edge it would cross.
  let left = anchor.left + anchor.width - width;
  left = Math.min(left, viewport.width - margin - width);
  left = Math.max(margin, left);

  const wanted =
    placement === 'below' ? anchor.top + anchor.height + gap : anchor.top - gap - maxHeight;
  // Final guarantee: on screen, whatever the anchor is doing.
  const top = Math.max(margin, Math.min(wanted, viewport.height - margin - maxHeight));

  return { left, top, width, maxHeight, placement, scrolls };
}
