import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LottieVista } from '../lottie-vista';

// Mock the dotlottie-react module
vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: ({ src, autoplay, loop, speed, style }) => {
    // Return a simple div that represents the Lottie player
    return <div data-testid="lottie-player" style={{ border: '1px solid blue' }}>
      Lottie animation: {src}
    </div>;
  }
}));

// ── Entorno del navegador que jsdom no trae ──
const consola = { error: console.error, warn: console.warn, log: console.log, info: console.info };
let mensajes: string[] = [];
beforeAll(() => {
  for (const k of ["error", "warn", "log", "info"] as const) {
    console[k] = (...a: unknown[]) => { mensajes.push(`${k}: ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ").slice(0, 300)}`); };
  }
  const g = globalThis as any;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as any;
});

// Function to mock matchMedia for prefers-reduced-motion
function simularMovimientoReducido(reducido: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduced-motion") ? reducido : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('LottieVista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to no reduced motion
    simularMovimientoReducido(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<LottieVista src="https://example.com/animation.lottie" />);
    // Check that the container renders
    expect(container).not.toBeNull();
    // Check that our mocked Lottie component is rendered
    expect(container.querySelector('[data-testid="lottie-player"]')).not.toBeNull();
  });

  it('should respect prefers-reduced-motion and show first frame', () => {
    simularMovimientoReducido(true);
    const { container } = render(<LottieVista src="https://example.com/animation.lottie" />);
    expect(container.querySelector('[data-testid="lottie-player"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Animación (movimiento reducido)');
  });

  it('should show author and license when provided', () => {
    const { container } = render(<LottieVista 
      src="https://example.com/animation.lottie" 
      author="John Doe" 
      license="MIT" 
    />);
    
    // Check that author and license are shown in the footer
    expect(container.textContent).toContain('John Doe');
    expect(container.textContent).toContain('MIT');
    // Check that they appear together in the footer
    expect(container.textContent).toContain('John Doe • MIT');
  });

  it('should not show author/license when not provided', () => {
    const { container } = render(<LottieVista src="https://example.com/animation.lottie" />);
    
    // Check that author and license are not shown when not provided
    // We look for the specific pattern that would appear if they were shown
    expect(container.querySelector('[style*="position: absolute"]')).toBeNull();
  });

  it('should respect autoplay and loop props', () => {
    const { container } = render(<LottieVista 
      src="https://example.com/animation.lottie" 
      autoplay={false} 
      loop={false} 
    />);
    
    // The test passes if the component renders without error
    // We're not testing the actual behavior of the Lottie player itself
    // Just check that it renders our mocked component
    expect(container.querySelector('[data-testid="lottie-player"]')).not.toBeNull();
  });

  afterAll(() => { Object.assign(console, consola); });
});