/**
 * Work a frame has to wait for that the page API can't see by itself: a WebGL texture or a 3D model loading, say.
 * `seek` waits for fonts and the stage's images, then for everything held here, then for a paint, so a capture never
 * shows a frame before its texture is in. Hold the promise when the load starts, and draw again when it's done.
 */
const pending = new Set<Promise<unknown>>();

/** Makes the next captures wait for `work`. Returns it, so it can be awaited or chained as usual. */
export function holdFrame<T>(work: Promise<T>): Promise<T> {
  pending.add(work);
  const done = () => pending.delete(work);
  work.then(done, done);
  return work;
}

/** Resolves once nothing is held, including work held while waiting. A failed load fails the frame. */
export async function frameSettled() {
  while (pending.size) await Promise.all([...pending]);
}
