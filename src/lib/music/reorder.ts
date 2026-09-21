/**
 * Moving a track within the queue.
 *
 * MusicKit has no reorder call — its `remove` is deprecated and there is no
 * move — so the only way is to hand it a whole new queue. That means the track
 * playing has to be found again in the new order, and found *exactly*: a family
 * queue can hold the same song twice, so searching for its id would sooner or
 * later resume the wrong copy.
 *
 * Both functions are pure, because getting this wrong is silent. The queue
 * still plays; it just plays the wrong thing.
 */

/** The queue with one entry moved. Out-of-range moves leave it alone. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  // A drop past the end lands at the end rather than vanishing.
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Where the track that was at `current` ends up once `from` moves to `to`.
 *
 * Worked out from the move rather than by looking the track up again, so a
 * queue containing the same song twice still resumes the copy that was playing.
 */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (from === to) return current;

  // The track being moved is the one playing: it goes where it was dropped.
  if (current === from) return to;

  // Moving something from above to below shifts everything between up one.
  if (from < current && to >= current) return current - 1;

  // Moving something from below to above shifts everything between down one.
  if (from > current && to <= current) return current + 1;

  return current;
}
