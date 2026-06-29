import "@testing-library/jest-dom";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom provides requestAnimationFrame but it never fires callbacks in the test
// runner (no real animation loop). Stub it to run synchronously so components
// that use rAF inside useLayoutEffect settle immediately.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  cb(performance.now());
  return 0;
};
globalThis.cancelAnimationFrame = () => {};
