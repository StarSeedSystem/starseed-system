import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crearControlador, type Controlador } from "@/lib/protomolecula/controlador";
import { limpiarControladores } from "@/lib/protomolecula/controlador-activo";
import { claveVinculos } from "@/lib/protomolecula/almacen-vinculos";
import { limpiarRegistro, registrarAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

const h = vi.hoisted(() => ({ c: null as Controlador | null }));
vi.mock("@/components/protomolecula/use-molecula", async (original) => {
  const real = await original<typeof import("@/components/protomolecula/use-molecula")>();
  return {
    ...real,
    useMolecula: () => ({ cargando: false, error: null, controlador: h.c, estado: real.useEstadoControl(h.c), guardado: { estado: "sin-cambios" } }),
  };
});

import { PestanaVinculos } from "../pestana-vinculos";

const MESA: DefinicionAtomo = {
  herramientaId: "mesa-vn", nombre: "Mesa de prueba", categoria: "audio", integracion: "libreria-js", control: "total",
  parametros: [{ id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 100, paso: 1, defecto: 0 }],
  entradas: [], salidas: [],
};

function nuevaMolecula(): Molecula {
  return { id: "m-vn", titulo: "Prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1 };
}
function controlador(): Controlador {
  let n = 0, t = 0;
  return crearControlador({ molecula: nuevaMolecula(), rol: "dueno", ahora: () => ++t, nuevoId: () => `id-${++n}` });
}

/** Un acceso MIDI de mentira con una entrada que emite lo que se le diga. */
function midiFalso() {
  const oyentes: Array<(ev: { data: Uint8Array }) => void> = [];
  const entrada = {
    id: "in1", name: "Controlador de prueba", state: "connected",
    addEventListener: (_t: string, f: (ev: { data: Uint8Array }) => void) => { oyentes.push(f); },
    removeEventListener: (_t: string, f: (ev: { data: Uint8Array }) => void) => { const i = oyentes.indexOf(f); if (i >= 0) oyentes.splice(i, 1); },
  };
  const acceso = { inputs: { forEach: (f: (e: typeof entrada) => void) => f(entrada) }, addEventListener: () => {}, removeEventListener: () => {} };
  Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => acceso, configurable: true });
  return { cc: (valor: number) => act(() => { oyentes.forEach((f) => f({ data: new Uint8Array([0xb0, 7, valor]) })); }), oyentes };
}

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});
beforeEach(() => {
  limpiarRegistro();
  limpiarControladores();
  localStorage.clear();
  h.c = controlador();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "requestMIDIAccess");
});

describe("pestaña «Vínculos»", () => {
  it("una molécula sin parámetros lo dice y lleva a Controles", () => {
    const ir = vi.fn();
    render(<PestanaVinculos irAPestana={ir} />);
    expect(screen.getByText(/aún no tiene parámetros que vincular/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Controles" }));
    expect(ir).toHaveBeenCalledWith("controles");
  });

  it("sin Web MIDI ni Gamepad lo dice con su motivo; no finge ningún mando", async () => {
    render(<PestanaVinculos irAPestana={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar MIDI" }));
    expect(await screen.findByText("Este navegador no ofrece MIDI")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conectar Gamepad" }));
    expect(await screen.findByText("Este navegador no ofrece Gamepad API")).toBeTruthy();
    expect(screen.getByText(/HID, puerto serie, OSC y pulsómetro aún no/)).toBeTruthy();
  });

  it("aprender de punta a punta: conectar, mover el mando, confirmar y que el mando mueva el parámetro", async () => {
    registrarAtomo(MESA);
    const c = h.c!;
    const r = c.anadirAtomo("mesa-vn");
    if (!r.ok) throw new Error(r.motivo);
    const midi = midiFalso();
    render(<PestanaVinculos irAPestana={vi.fn()} />);
    expect(screen.getByText("Volumen")).toBeTruthy();
    expect(screen.getByText("Sin vínculos")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Conectar MIDI" }));
    expect(await screen.findByText("MIDI: Controlador de prueba")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aprender" }));
    expect(screen.getByText("Mueve el mando que quieres vincular…")).toBeTruthy();
    midi.cc(10); midi.cc(60); midi.cc(110);
    expect(await screen.findByText(/Detectado: MIDI Controlador de prueba · cc 7 · canal 1/, undefined, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByText(/MIDI Controlador de prueba · cc 7 · canal 1 · absoluto/)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(claveVinculos("m-vn")) ?? "[]")).toHaveLength(1);

    // El mando ya mueve el parámetro de la molécula.
    midi.cc(127);
    await waitFor(() => expect(c.obtener().molecula.valores[`${r.atomo.id}::volumen`]).toBe(100));
  });

  it("se puede quitar un vínculo y deja de guardarse", async () => {
    registrarAtomo(MESA);
    const c = h.c!;
    const r = c.anadirAtomo("mesa-vn");
    if (!r.ok) throw new Error(r.motivo);
    localStorage.setItem(claveVinculos("m-vn"), JSON.stringify([{
      id: "v1", fuente: { tipo: "midi", mensaje: "cc", numero: 7, canal: 1 }, objetivo: { atomoId: r.atomo.id, parametroId: "volumen" },
      modo: "absoluto", curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 }, activo: true, creadoPor: "ventana",
    }]));
    render(<PestanaVinculos irAPestana={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Quitar el vínculo de Volumen" }));
    await waitFor(() => expect(screen.getByText("Sin vínculos")).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(claveVinculos("m-vn")) ?? "null")).toEqual([]);
  });
});
