import { describe, expect, it } from 'vitest';
import { placePopover, type PlacementInput } from './popoverPosition';

const viewport = { width: 1200, height: 800 };
const base = (over: Partial<PlacementInput> = {}): PlacementInput => ({
  anchor: { left: 900, top: 100, width: 120, height: 30 },
  desiredWidth: 290,
  contentHeight: 160,
  viewport,
  ...over,
});

describe('placePopover', () => {
  it('hangs below, right-aligned with its button', () => {
    const p = placePopover(base());
    expect(p.placement).toBe('below');
    expect(p.top).toBe(136); // 100 + 30 + 6 gap
    expect(p.left + p.width).toBe(1020); // right edge of the anchor
    expect(p.scrolls).toBe(false);
  });

  // The actual bug: a 290px panel right-aligned in a 270px column ran off.
  it('pulls back inside the right edge instead of running off', () => {
    const p = placePopover(base({ anchor: { left: 1100, top: 100, width: 90, height: 30 } }));
    expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });

  it('never crosses the left edge either', () => {
    const p = placePopover(base({ anchor: { left: 4, top: 100, width: 40, height: 30 } }));
    expect(p.left).toBe(8);
  });

  it('narrows on a window too small for its preferred width', () => {
    // 290px preferred, but a 280px window only has 264px between the margins.
    const p = placePopover(base({ viewport: { width: 280, height: 800 }, anchor: { left: 170, top: 100, width: 100, height: 30 } }));
    expect(p.width).toBe(280 - 16);
    expect(p.left).toBe(8);
    expect(p.left + p.width).toBeLessThanOrEqual(280 - 8);
  });

  it('flips above when there is no room below', () => {
    const p = placePopover(base({ anchor: { left: 900, top: 700, width: 120, height: 30 } }));
    expect(p.placement).toBe('above');
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(700 - 6);
  });

  it('keeps the preferred side when it fits, even if the other side is roomier', () => {
    expect(placePopover(base({ anchor: { left: 900, top: 300, width: 120, height: 30 } })).placement).toBe('below');
    expect(placePopover(base({ prefer: 'above', anchor: { left: 900, top: 300, width: 120, height: 30 } })).placement).toBe(
      'above'
    );
  });

  it('takes the roomier side when neither fits, and scrolls rather than being cut off', () => {
    const p = placePopover(base({ contentHeight: 900, anchor: { left: 900, top: 600, width: 120, height: 30 } }));
    expect(p.placement).toBe('above');
    expect(p.scrolls).toBe(true);
    expect(p.maxHeight).toBeGreaterThan(0);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });

  it('stays on screen even in a window shorter than the panel', () => {
    const p = placePopover(base({ contentHeight: 400, viewport: { width: 1200, height: 200 }, anchor: { left: 900, top: 90, width: 120, height: 30 } }));
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(200);
    expect(p.scrolls).toBe(true);
  });
});

describe('anchors that are off screen', () => {
  // Regression: "Reset values" sits at the bottom of a scrolling column. With
  // the column scrolled up, the button's rect was below the fold and the panel
  // was placed below the fold with it — invisible, at top 1011 in a 768 window.
  it('stays on screen when the anchor is below the fold', () => {
    const p = placePopover({
      anchor: { left: 176, top: 1128, width: 120, height: 30 },
      desiredWidth: 290,
      contentHeight: 111,
      viewport,
      prefer: 'above',
    });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
  });

  it('stays on screen when the anchor is above the fold', () => {
    const p = placePopover({
      anchor: { left: 176, top: -400, width: 120, height: 30 },
      desiredWidth: 290,
      contentHeight: 111,
      viewport,
    });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
  });
});
