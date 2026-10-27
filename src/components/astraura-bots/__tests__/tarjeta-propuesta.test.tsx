import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TarjetaPropuesta } from '../tarjeta-propuesta';

afterEach(() => cleanup());

describe('TarjetaPropuesta', () => {
  const accion = { tipo: 'mover' as const } as any;
  const decision = { permitido: false, requiere: 'confirmacion', motivo: 'Mover widget', riesgo: 'bajo' } as any;
  const estado = { botId: '1', fase: 'esperando', sentidosActivos: [] as any, registro: [] } as any;

  it('renderiza correctamente', () => {
    const onConfirmar = vi.fn();
    render(<TarjetaPropuesta accion={accion} decision={decision} estado={estado} onConfirmar={onConfirmar} onRechazar={vi.fn()} onVotacion={vi.fn()} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} />);
    expect(screen.getByText('Propuesta del bot')).toBeDefined();
    expect(screen.getByText(/Mover widget/)).toBeDefined();
  });

  it('llama a funciones', () => {
    const onConfirmar = vi.fn();
    const onRechazar = vi.fn();
    render(<TarjetaPropuesta accion={accion} decision={decision} estado={estado} onConfirmar={onConfirmar} onRechazar={onRechazar} onVotacion={vi.fn()} onApagarSentido={vi.fn()} onPausarBot={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));
    expect(onConfirmar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Rechazar/i }));
    expect(onRechazar).toHaveBeenCalled();
  });
});
