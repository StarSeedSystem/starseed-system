import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FundamentoStarSeed from '../fundamento-starseed';

describe('FundamentoStarSeed', () => {
  it('renders the quote and attribution', () => {
    render(<FundamentoStarSeed />);
    
    // Check for the quote text
    screen.getByText(/El diamante es la luz congelada de la verdad, y la piedra filosofal es la semilla que la convierte en oro./i);
    
    // Check for the attribution
    screen.getByText(/— Alex Bordón Garrigós/i);
  });

  it('renders the three symbols with their names, descriptions, and questions', () => {
    render(<FundamentoStarSeed />);
    
    // Piedra Filosofal
    const piedraPhilosophalNameEls = screen.getAllByText(/Piedra Filosofal/i);
    const piedraPhilosophalNameEl = piedraPhilosophalNameEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(piedraPhilosophalNameEl).toBeDefined();
    expect(piedraPhilosophalNameEl.textContent).toMatch(/Piedra Filosofal/i);
    
    const piedraPhilosophalDescEls = screen.getAllByText(/La sustancia que transforma los metales comunes en oro y otorga la inmortalidad./i);
    const piedraPhilosophalDescEl = piedraPhilosophalDescEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(piedraPhilosophalDescEl).toBeDefined();
    expect(piedraPhilosophalDescEl.textContent).toMatch(/La sustancia que transforma los metales comunes en oro y otorga la inmortalidad./i);
    
    const piedraPhilosophalQuestionEls = screen.getAllByText(/¿Qué es lo que realmente buscas transformar en tu vida?/i);
    const piedraPhilosophalQuestionEl = piedraPhilosophalQuestionEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(piedraPhilosophalQuestionEl).toBeDefined();
    expect(piedraPhilosophalQuestionEl.textContent).toMatch(/¿Qué es lo que realmente buscas transformar en tu vida?/i);
    
    // Mercurio
    const mercurioNameEls = screen.getAllByText(/Mercurio/i);
    const mercurioNameEl = mercurioNameEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(mercurioNameEl).toBeDefined();
    expect(mercurioNameEl.textContent).toMatch(/Mercurio/i);
    
    const mercurioDescEls = screen.getAllByText(/El principio volátil que representa la mente y la comunicación en la obra alquímica./i);
    const mercurioDescEl = mercurioDescEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(mercurioDescEl).toBeDefined();
    expect(mercurioDescEl.textContent).toMatch(/El principio volátil que representa la mente y la comunicación en la obra alquímica./i);
    
    const mercurioQuestionEls = screen.getAllByText(/¿Cómo purificas tus pensamientos para alcanzar la claridad?/i);
    const mercurioQuestionEl = mercurioQuestionEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(mercurioQuestionEl).toBeDefined();
    expect(mercurioQuestionEl.textContent).toMatch(/¿Cómo purificas tus pensamientos para alcanzar la claridad?/i);
    
    // Azufre
    const azufreNameEls = screen.getAllByText(/Azufre/i);
    const azufreNameEl = azufreNameEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(azufreNameEl).toBeDefined();
    expect(azufreNameEl.textContent).toMatch(/Azufre/i);
    
    const azufreDescEls = screen.getAllByText(/El principio activo que representa la voluntad y la energía en la transformación./i);
    const azufreDescEl = azufreDescEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(azufreDescEl).toBeDefined();
    expect(azufreDescEl.textContent).toMatch(/El principio activo que representa la voluntad y la energía en la transformación./i);
    
    const azufreQuestionEls = screen.getAllByText(/¿Qué fuego interno impulsa tu camino hacia la realización?/i);
    const azufreQuestionEl = azufreQuestionEls.find(el => 
      !el.classList.contains('text-xl') && !el.classList.contains('text-foreground/90')
    );
    expect(azufreQuestionEl).toBeDefined();
    expect(azufreQuestionEl.textContent).toMatch(/¿Qué fuego interno impulsa tu camino hacia la realización?/i);
  });

  it('SVG has role="img" and aria-label', () => {
    render(<FundamentoStarSeed />);
    const imgElements = screen.getAllByRole('img');
    const diamondSvg = imgElements.find(el => 
      el.getAttribute('aria-label') === 'Diamante con facetas que representa la pureza y la luz' &&
      el.classList.contains('w-24') &&
      el.classList.contains('h-24') &&
      el.classList.contains('md:w-32') &&
      el.classList.contains('md:h-32') &&
      el.classList.contains('text-primary/80')
    );
    expect(diamondSvg).toBeDefined();
  });
});