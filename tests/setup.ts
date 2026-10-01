import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'IntersectionObserver', { value: IntersectionObserverMock, writable: true });
Object.defineProperty(globalThis, 'IntersectionObserver', { value: IntersectionObserverMock, writable: true });
Object.defineProperty(Element.prototype, 'scrollIntoView', { value() {}, configurable: true });
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
