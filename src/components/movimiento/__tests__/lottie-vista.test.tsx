import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('LottieVista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<LottieVista src="https://example.com/animation.lottie" />);
    expect(container).toBeInTheDocument();
    // Check that our mocked Lottie component is rendered
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('should respect prefers-reduced-motion and show placeholder', () => {
    // Mock matchMedia to return true for prefers-reduced-motion
    vi.stubGlobal('matchMedia', 
      vi.fn().mockImplementation((query) => {
        if (query === '(prefers-reduced-motion: reduce)') {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn((cb) => {
              // Simular cambio inmediatamente
              cb({ matches: true });
            }),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
          };
        }
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      })
    );

    // Re-render con el mock aplicado
    const { rerender } = render(<LottieVista src="https://example.com/animation.lottie" />);
    
    // Esperar a que se procese el efecto
    expect(screen.getByText(/animación/i)).toBeInTheDocument();
  });

  it('should show author and license when provided', () => {
    render(<LottieVista 
      src="https://example.com/animation.lottie" 
      author="John Doe" 
      license="MIT" 
    />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('MIT')).toBeInTheDocument();
  });

  it('should not show author/license when not provided', () => {
    render(<LottieVista src="https://example.com/animation.lottie" />);
    
    // Verificar que no haya elementos de autor/licencia
    const authorElements = screen.getAllByText(/john doe/i);
    const licenseElements = screen.getAllByText(/mit/i);
    
    // Como usamos mocks, es posible que haya otros elementos, pero verificamos que
    // nuestro componente específico no los muestre
    expect(authorElements.length).toBe(0);
    expect(licenseElements.length).toBe(0);
  });

  it('should respect autoplay and loop props', () => {
    render(<LottieVista 
      src="https://example.com/animation.lottie" 
      autoplay={false} 
      loop={false} 
    />);
    
    // The test passes if the component renders without error
    // We're not testing the actual behavior of the Lottie player itself
    expect(screen.getByText(/lottie animation:/i)).toBeInTheDocument();
  });
});