import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutersMallaPanel } from '../routers-malla-panel';

describe('RoutersMallaPanel', () => {
  it('muestra bloqueado-operador al añadir un router de operador', async () => {
    // Mock empty hardware table (will result in desconocido, but we test the operator case)
    const tablaHardwareMock = [];

    render(<RoutersMallaPanel tablaHardware={tablaHardwareMock} />);

    // Fill in router form as operator
    const fabricanteInput = screen.getByPlaceholderText(/fabricante/i);
    const modeloInput = screen.getByPlaceholderText(/modelo/i);
    const operadorCheckbox = screen.getByLabelText(/es router del operador/i);
    const añadirButton = screen.getByRole('button', { name: /añadir router/i });

    await userEvent.type(fabricanteInput, 'OperadorXYZ');
    await userEvent.type(modeloInput, 'RouterX1');
    await userEvent.click(operadorCheckbox);
    await userEvent.click(añadirButton);

    // Should show the compatibility result with blocked-operator state
    expect(await screen.findByText(/bloqueado-operador/i)).toBeTruthy();

    // Should show the operator warning
    expect(await screen.findByText(/los routers del operador suelen ir bloqueados/i)).toBeTruthy();
  });
});