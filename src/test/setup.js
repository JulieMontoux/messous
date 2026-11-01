// Environnement des tests de composants (jsdom)
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

// Absents de jsdom
if (!window.matchMedia) {
  window.matchMedia = query => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ target: el, contentRect: { width: 800, height: 300 } }]); }
    unobserve() {}
    disconnect() {}
  };
}
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
}
window.scrollTo = () => {};
// Les graphiques (recharts) ont besoin d'une taille
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 300; } });
