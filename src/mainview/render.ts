// Render scheduler. State changes call invalidate(); the shell's renderer
// then runs once, in a microtask, no matter how many changes piled up.
//
// Keeping this in its own dependency-free module lets actions request a
// render without importing any view (views import actions, not vice versa).

/** Which part of the UI is stale. The list is the default. */
export type Scope = "list" | "settings";

type Renderer = (dirty: ReadonlySet<Scope>) => void;

let renderer: Renderer | null = null;
const dirty = new Set<Scope>();
const afterCallbacks: (() => void)[] = [];
let queued = false;
let running = false;

export function setRenderer(fn: Renderer): void {
  renderer = fn;
}

export function invalidate(...scopes: Scope[]): void {
  if (scopes.length === 0) dirty.add("list");
  for (const scope of scopes) dirty.add(scope);
  schedule();
}

/** Run once after the next render (e.g. to scroll a freshly rendered card into view). */
export function afterRender(fn: () => void): void {
  afterCallbacks.push(fn);
  schedule();
}

function schedule(): void {
  if (queued) return;
  queued = true;
  queueMicrotask(flushRender);
}

/** Render now instead of waiting for the microtask. */
export function flushRender(): void {
  // a render that invalidates (re-entrancy) is picked up by the next microtask
  if (running) return;
  queued = false;
  if (!renderer) return;
  running = true;
  try {
    const scopes = new Set(dirty);
    dirty.clear();
    renderer(scopes);
    for (const fn of afterCallbacks.splice(0)) fn();
  } catch (err) {
    console.error("[oxide] render failed", err);
  } finally {
    running = false;
  }
}
