export interface Rect { left: number; top: number; right: number; bottom: number; }

/**
 * Cubic-bezier beam from a summary card (right panel) to a source highlight
 * (left/PDF panel). Start = card's left-center, end = source's right-center.
 * Control points bow horizontally toward each side for a smooth arc.
 * Pure function — no DOM, fully unit-testable.
 */
export function beamPath(card: Rect, source: Rect): string {
  const sx = card.left;
  const sy = (card.top + card.bottom) / 2;
  const ex = source.right;
  const ey = (source.top + source.bottom) / 2;

  const dx = Math.abs(sx - ex);
  const pull = Math.max(40, dx * 0.4);

  const c1x = sx - pull;   // pull left from the card toward the source
  const c1y = sy;
  const c2x = ex + pull;   // pull right from the source toward the card
  const c2y = ey;

  return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
}
