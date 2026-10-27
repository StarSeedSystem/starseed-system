import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TarjetaPropuesta } from '../tarjeta-propuesta';

afterEach(() => cleanup());

describe('TarjetaPropuesta', () => {
  const propuesta = { id: '1', descripcion: 'Mover widget', riesgo: 'bajo', requiere: 'confirmacion' } as any;

  it('renderiza correctamente', () => {
    const onConfirmar = vi.fn();
    render(<TarjetaPropuesta propuesta={propuesta} onConfirmar={onConfirmar} onRechazar={vi.fn()} onVotacion={vi.fn()} />);
    expect(screen.getByText('Propuesta del bot')).toBeDefined();
    expect(screen.getByText('Mover widget')).toBeDefined();
  });

  it('llama a funciones', () => {
    const onConfirmar = vi.fn();
    const onRechazar = vi.fn();
    render(<TarjetaPropuesta propuesta={propuesta} onConfirmar={onConfirmar} onRechazar={onRechazar} onVotacion={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));
    expect(onConfirmar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Rechazar/i }));
    expect(onRechazar).toHaveBeenCalled();
  });
});
