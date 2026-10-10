/**
 * PanelEnVivo: enseña lo MEDIDO (precisión y cota del reloj común, canales, conectados) y los
 * botones que mandan a todos solo a quien tiene el control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const T = 1_700_000_000_000;
const ficha = {
  v: 1, id: "abcdefghijklmnopqrstuv", fuente: "omnifrecuencias", titulo: "Círculo 432",
  enlace: "https://omnifrecuencias.vercel.app/", pk: "B".repeat(87), privada: false, creada: 0,
  params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.7, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
};
let control = true;
const controlar = vi.fn(async () => ({ ok: true }));
const escuchar = vi.fn(async () => true);

function foto() {
  return {
    href: "/estaciones/vivo/abcdefghijklmnopqrstuv?f=x",
    sesion: {
      ficha,
      estado: { ficha, linea: [{ n: 1, t: T - 65_000, tipo: "iniciar" }], rev: 1 },
      posicion: {},
      reloj: { modo: "sincronizado", desfaseMs: 3, derivaPpm: 0, precisionMs: 0.8, cotaMs: 21.5, retardoMinMs: 43, muestras: 12, ultimaMuestra: T },
      control,
      referencia: false,
      canales: [{ tipo: "internet", etiqueta: "Internet (Supabase Realtime)", abierto: true }],
      oyentes: 4,
      anfitrionVisto: T,
      descartados: 0,
    },
    motor: { listo: false, latenciaMs: null, baseTiempo: null, necesitaGesto: true, sonando: false, tramos: 0, error: null },
    volumen: 0.8, silenciada: false, cargando: false, error: null, fila: null,
  };
}

vi.mock("@/lib/estaciones/estacion-global", () => ({
  useEstacionGlobal: () => foto(),
  estacionGlobal: () => ({
    sintonizar: async () => ({ ok: true }),
    sesionActual: () => ({ ahora: () => T }),
    controlar,
    escuchar,
    silenciar: vi.fn(),
    volumen: vi.fn(),
  }),
}));
vi.mock("@/lib/estaciones/llaves-locales", () => ({ registroDe: () => (control ? { control: "llave" } : null) }));

import { PanelEnVivo } from "../en-vivo/panel-en-vivo";

describe("PanelEnVivo", () => {
  afterEach(cleanup);
  beforeEach(() => {
    controlar.mockClear();
    escuchar.mockClear();
  });

  it("enseña la precisión medida, la cota, el canal y los conectados", () => {
    render(<PanelEnVivo href="/estaciones/vivo/abcdefghijklmnopqrstuv?f=x" />);
    expect(screen.getByTestId("precision-reloj").textContent).toBe("Sincronizado ± 0,8 ms");
    expect(screen.getByText(/Cota máxima ± 21,5 ms/)).toBeTruthy();
    expect(screen.getByText(/Internet \(Supabase Realtime\)/)).toBeTruthy();
    expect(screen.getByText(/Conectados además de ti: 4/)).toBeTruthy();
    expect(screen.getByText(/En vivo · 1:05/)).toBeTruthy();
    expect(screen.getByText(/432 Hz/)).toBeTruthy();
  });

  it("con control: pausar para todos; escuchar abre el audio con un gesto", async () => {
    const user = userEvent.setup();
    render(<PanelEnVivo href="/estaciones/vivo/abcdefghijklmnopqrstuv?f=x" />);
    await user.click(screen.getByRole("button", { name: /pausar para todos/i }));
    await waitFor(() => expect(controlar).toHaveBeenCalledWith("pausar"));
    await user.click(screen.getByRole("button", { name: /escuchar aquí/i }));
    expect(escuchar).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /controlar desde otro aparato/i })).toBeTruthy();
  });

  it("sin control no hay botones que manden a todos", () => {
    control = false;
    render(<PanelEnVivo href="/estaciones/vivo/abcdefghijklmnopqrstuv?f=x" />);
    expect(screen.queryByRole("button", { name: /para todos/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /controlar desde otro aparato/i })).toBeNull();
    expect(screen.getByText(/anfitrión presente/)).toBeTruthy();
    control = true;
  });
});
