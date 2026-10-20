import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IndicadorSentidos from '../indicador-sentidos';

// Mock the indicadorVisible function from bucle.ts
 vi.mock("@/lib/astraura-bots/bucle", () => ({ indicadorVisible: (estado: { sentidosActivos: any[]; fase: string }) => estado.sentidosActivos.length > 0, }));
describe('IndicadorSentidos', () => {
  const botId = 'bot-123';
  const sentidoActivo: 'micfono' = 'microfono';
  const estadoBase = {
    sentidosActivos: [] as const,
    fase: 'reposo' as const,
  };

  const onApagarSentido = vi.fn();
  const onPausarBot = vi.fn();

  function renderComponent(sentidos) {
    if (sentidos === void 0) sentidos = [];
    return render(<IndicadorSentidos
      botId={botId}
      estadoBucle={{
        ...estadoBase,
        sentidosActivos: sentidos,
      }}
      onApagarSentido={onApagarSentido}
      onPausarBot={onPausarBot}
    />);
  }

  describe('visibilidad', () => {
    it('no se muestra cuando no hay sentidos activos', () => {
      renderComponent([]);
      
      // Should not contain any sense icons
      expect(screen.queryByLabelText(/apagar sentido:/i)).not.toBeInTheDocument();
      
      // Should still show pause button
      expect(screen.getByRole('button', { name: /pausar el bot/i })).toBeInTheDocument();
    });

    it('se muestra cuando hay sentidos activos', () => {
      renderComponent([sentidoActivo]);
      
      // Should contain the sense icon button
      expect(screen.getByLabelText(/apagar sentido: micrófono/i)).toBeInTheDocument();
      
      // Should show pause button
      expect(screen.getByRole('button', { name: /pausar el bot/i })).toBeInTheDocument();
    });
  });

  it('el aria-live nombra los sentidos activos', async () => {
    // Test with no senses
    renderComponent([]);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Astraura no está usando ningún sentido'
      );
    });

    // Test with one sense
    renderComponent([sentidoActivo]);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        expect.stringContaining('Astraura está usando: micrófono')
      );
    });

    // Test with multiple senses
    renderComponent([sentidoActivo, 'pantalla' as const]);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        expect.stringContaining('Astraura está usando: micrófono, pantalla')
      );
    });
  });

  it('apagar un sentido llama al callback', async () => {
    renderComponent([sentidoActivo]);
    
    const botonApagar = screen.getByLabelText(/apagar sentido: micrófono/i);
    await userEvent.click(botonApagar);
    
    expect(onApagarSentido).toHaveBeenCalledWith(sentidoActivo);
  });

  it('pausar el bot llama al callback', async () => {
    renderComponent([sentidoActivo]);
    
    const botonPausar = screen.getByRole('button', { name: /pausar el bot/i });
    await userEvent.click(botonPausar);
    
    expect(onPausarBot).toHaveBeenCalled();
  });

  it('renderiza iconos correctos para cada sentido', () => {
    // Test a few different senses
    const sentidosDePrueba: Sentido[] = [
      'pantalla',
      'camara',
      'microfono',
      'archivos',
    ];
    
    renderComponent(sentidosDePrueba);
    
    // Check that each sense has its corresponding button
    sentidosDePrueba.forEach((sentido) => {
      const labelText = `Apagar sentido: ${sentido}`;
      expect(screen.getByLabelText(labelText)).toBeInTheDocument();
    });
  });
});