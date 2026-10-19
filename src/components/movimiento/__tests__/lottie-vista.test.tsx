import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LottieVista } from '../lottie-vista';

// Mock matchMedia para prefers-reduced-motion
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('LottieVista', () => {
  it('should render without crashing', () => {
    const { container } = render(<LottieVista src="https://example.com/animation.lottie" />);
    expect(container).toBeInTheDocument();
  });

  it('should respect prefers-reduced-motion and show placeholder', () => {
    // Forzar que matchMedia devuelva true para prefers-reduced-motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => {
        if (query === '(prefers-reduced-motion: reduce)') {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn((cb) => {
              // Simular cambio inmediatamente
              cb({ matches: true });
            }),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
          };
        }
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        };
      }),
    });

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
});