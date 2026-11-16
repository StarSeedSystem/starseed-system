import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RacionBanco } from '../racion-banco';
import type { AjustesBanco, TextosInternet, VentanaBanco } from '@/lib/malla/internet/tipos';

const textosMock: Pick<TextosInternet, 'racionDiaria' | 'programacion' | 'mb' | 'gb' | 'bancoTitulo'> = {
  racionDiaria: 'Ración diaria',
  programacion: 'Programación',
  mb: 'MB',
  gb: 'GB',
  bancoTitulo: 'Modo banco',
};

const extraMock = {
  desde: 'Desde',
  hasta: 'Hasta',
  limite: 'Límite',
};

const bancoInicial: AjustesBanco = {
  activo: true,
  modo: 'diario',
  diarioMb: 0,
  ventanas: [],
};

const onCambiarMock = vi.fn();

function renderComponent(banco: AjustesBanco = bancoInicial) {
  return render(
    <RacionBanco banco={banco} onCambiar={onCambiarMock} textos={textosMock} extra={extraMock} />
  );
}

describe('RacionBanco', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza las dos pestañas accesibles', () => {
    renderComponent();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ración diaria' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Programación' })).toBeInTheDocument();
  });

  it('muestra la pestaña de ración diaria por defecto', () => {
    renderComponent();
    expect(screen.getByRole('tabpanel', { name: 'Ración diaria' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ración diaria')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /unidad/i })).toBeInTheDocument();
  });

  it('guarda 2 GB como 2000 MB al cambiar unidad a GB e ingresar 2', () => {
    renderComponent();
    const input = screen.getByLabelText('Ración diaria');
    const select = screen.getByRole('combobox', { name: /unidad/i });

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(select, { target: { value: 'GB' } });

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({ diarioMb: 2000 }),
      })
    );
  });

  it('admite decimales con coma y los convierte a punto', () => {
    renderComponent();
    const input = screen.getByLabelText('Ración diaria');

    fireEvent.change(input, { target: { value: '1,5' } });

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({ diarioMb: 1500 }),
      })
    );
  });

  it('no permite valores negativos', () => {
    renderComponent();
    const input = screen.getByLabelText('Ración diaria');

    fireEvent.change(input, { target: { value: '-100' } });

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({ diarioMb: 0 }),
      })
    );
  });

  it('cambia a pestaña de programación y muestra lista vacía', () => {
    renderComponent();
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });

    fireEvent.click(tabProgramacion);

    expect(screen.getByRole('tabpanel', { name: 'Programación' })).toBeInTheDocument();
    expect(screen.getByText('Sin ventanas programadas')).toBeInTheDocument();
  });

  it('añade una ventana al hacer click en añadir', () => {
    renderComponent();
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const btnAnadir = screen.getByRole('button', { name: /añadir ventana/i });
    fireEvent.click(btnAnadir);

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({
              desde: '',
              hasta: '',
              horaDesde: '00:00',
              horaHasta: '23:59',
              limiteMb: 0,
            }),
          ]),
        }),
      })
    );
  });

  it('quita una ventana al hacer click en quitar', () => {
    const bancoConVentana: AjustesBanco = {
      ...bancoInicial,
      modo: 'programado',
      ventanas: [
        { desde: '2025-01-01', hasta: '2025-01-31', horaDesde: '08:00', horaHasta: '20:00', limiteMb: 500 },
      ],
    };
    renderComponent(bancoConVentana);
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const btnQuitar = screen.getByRole('button', { name: /quitar ventana 1/i });
    fireEvent.click(btnQuitar);

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({ ventanas: [] }),
      })
    );
  });

  it('limita a 12 ventanas máximo', () => {
    const muchasVentanas: VentanaBanco[] = Array.from({ length: 12 }, (_, i) => ({
      desde: '2025-01-01',
      hasta: '2025-01-31',
      horaDesde: '08:00',
      horaHasta: '20:00',
      limiteMb: 100 * (i + 1),
    }));
    const bancoCon12: AjustesBanco = {
      ...bancoInicial,
      modo: 'programado',
      ventanas: muchasVentanas,
    };
    renderComponent(bancoCon12);
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const btnAnadir = screen.getByRole('button', { name: /añadir ventana/i });
    fireEvent.click(btnAnadir);

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({ ventanas: expect.arrayContaining([]) }),
      })
    );
    const llamadas = onCambiarMock.mock.calls;
    const ultimaLlamada = llamadas[llamadas.length - 1][0];
    expect(ultimaLlamada.banco.ventanas.length).toBe(12);
  });

  it('cambiar de pestaña mantiene los datos de ración diaria', () => {
    renderComponent();
    const input = screen.getByLabelText('Ración diaria');
    fireEvent.change(input, { target: { value: '500' } });

    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const tabRacion = screen.getByRole('tab', { name: 'Ración diaria' });
    fireEvent.click(tabRacion);

    expect(screen.getByLabelText('Ración diaria')).toHaveValue('500');
  });

  it('cambiar de pestaña mantiene los datos de programación', () => {
    const bancoConVentana: AjustesBanco = {
      ...bancoInicial,
      modo: 'programado',
      ventanas: [
        { desde: '2025-01-01', hasta: '2025-01-31', horaDesde: '08:00', horaHasta: '20:00', limiteMb: 500 },
      ],
    };
    renderComponent(bancoConVentana);
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const tabRacion = screen.getByRole('tab', { name: 'Ración diaria' });
    fireEvent.click(tabRacion);

    fireEvent.click(tabProgramacion);

    expect(screen.getByDisplayValue('2025-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2025-01-31')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20:00')).toBeInTheDocument();
  });

  it('edita los campos de una ventana existente', () => {
    const bancoConVentana: AjustesBanco = {
      ...bancoInicial,
      modo: 'programado',
      ventanas: [
        { desde: '2025-01-01', hasta: '2025-01-31', horaDesde: '08:00', horaHasta: '20:00', limiteMb: 500 },
      ],
    };
    renderComponent(bancoConVentana);
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const inputDesde = screen.getByLabelText('Desde 1');
    fireEvent.change(inputDesde, { target: { value: '2025-02-01' } });

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({ desde: '2025-02-01' }),
          ]),
        }),
      })
    );
  });

  it('edita el límite de una ventana y convierte GB a MB', () => {
    const bancoConVentana: AjustesBanco = {
      ...bancoInicial,
      modo: 'programado',
      ventanas: [
        { desde: '2025-01-01', hasta: '2025-01-31', horaDesde: '08:00', horaHasta: '20:00', limiteMb: 500 },
      ],
    };
    renderComponent(bancoConVentana);
    const tabProgramacion = screen.getByRole('tab', { name: 'Programación' });
    fireEvent.click(tabProgramacion);

    const inputLimite = screen.getByLabelText('Límite 1');
    const selectUnidad = screen.getByRole('combobox', { name: /unidad límite 1/i });

    fireEvent.change(inputLimite, { target: { value: '1' } });
    fireEvent.change(selectUnidad, { target: { value: 'GB' } });

    expect(onCambiarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        banco: expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({ limiteMb: 1000 }),
          ]),
        }),
      })
    );
  });
});