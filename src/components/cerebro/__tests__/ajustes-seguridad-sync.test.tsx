import { render, screen } from '@testing-library/react';
import AjustesSeguridad from '@/components/cerebro/ajustes-seguridad-sync';
import AjustesSync from '@/components/cerebro/ajustes-sync';

describe('AjustesSeguridad y AjustesSync', () => {
  it("renders privacy options and security notice", () => {
    render(<AjustesSeguridad valor={{ privacidad: "privado", cifradoLocal: false, acceso: [] }} />);
    expect(screen.getByText("Privado")).toBeDefined();
    expect(screen.getByText("Cifrado local")).toBeDefined();
    expect(screen.getByText("Lista de acceso")).toBeDefined();
  });

  it("renders direction and destinations", () => {
    render(<AjustesSync valor={{ direccion: "ambas", auto: true, destinos: [] }} />);
    expect(screen.getByText("Vinculación y sincronización")).toBeDefined();
    expect(screen.getByText("Dirección")).toBeDefined();
    expect(screen.getByText("Destinos")).toBeDefined();
  });
});