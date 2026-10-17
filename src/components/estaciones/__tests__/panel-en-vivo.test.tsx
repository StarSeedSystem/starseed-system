/**
 * PanelEnVivo: enseña lo MEDIDO (precisión y cota del reloj común, canales, conectados) y los
 * botones que mandan a todos solo a quien tiene el control.
 * S1010-ES2: el canal de internet dice por qué no conecta (fase y motivo saneado), sin red real:
 * el cliente de Supabase es de mentira y los temporizadores, inyectados.
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
type CanalMock = { tipo: string; etiqueta: string; abierto: boolean; estado?: () => { fase: string; motivo: string | null } };
const INTERNET: CanalMock = { tipo: "internet", etiqueta: "Internet (Supabase Realtime)", abierto: true };
let canales: CanalMock[] = [INTERNET];
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
      canales,
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
type AlEstado = (estado: string, err?: unknown) => void;
const supa = vi.hoisted(() => ({ alEstado: null as AlEstado | null, quitados: 0 }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const c = {
        on: () => c,
        subscribe: (cb: AlEstado) => {
          supa.alEstado = cb;
          return c;
        },
        presenceState: () => ({}),
        track: async () => "ok",
        send: async () => "ok",
      };
      return c;
    },
    removeChannel: async () => {
      supa.quitados += 1;
      return "ok";
    },
  }),
}));
vi.mock("@/lib/estaciones/llaves-locales", () => ({ registroDe: () => (control ? { control: "llave" } : null) }));

import { PanelEnVivo } from "../en-vivo/panel-en-vivo";
import { crearCanalInternet, estadoCanalInternet } from "@/lib/estaciones/canales-estacion";

/** Temporizador como el del navegador: con un `this` que no sea el global, «Illegal invocation». */
function relojFalso() {
  const pendientes = new Map<number, () => void>();
  let n = 0;
  return {
    pendientes,
    poner(this: unknown, fn: () => void): number {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      pendientes.set(++n, fn);
      return n;
    },
    quitar(this: unknown, h: unknown): void {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      pendientes.delete(h as number);
    },
    disparar() {
      for (const [h, fn] of Array.from(pendientes)) {
        pendientes.delete(h);
        fn();
      }
    },
  };
}

const HREF = "/estaciones/vivo/abcdefghijklmnopqrstuv?f=x";

describe("PanelEnVivo", () => {
  afterEach(cleanup);
  beforeEach(() => {
    canales = [INTERNET];
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
  it("un canal con estado en error dice por qué no conecta, en texto y con role=status", () => {
    canales = [{ ...INTERNET, abierto: false, estado: () => ({ fase: "error", motivo: "sin respuesta de Supabase Realtime en 10 s" }) }];
    render(<PanelEnVivo href={HREF} />);
    const aviso = screen.getByText(/sin conexión: sin respuesta de Supabase Realtime en 10 s/);
    expect(aviso.getAttribute("role")).toBe("status");
    expect(screen.queryByText(/^conectando/)).toBeNull();
  });

  it("un canal sin método estado sigue como antes", () => {
    canales = [{ tipo: "local", etiqueta: "Enlace local · tableta", abierto: false }, INTERNET];
    render(<PanelEnVivo href={HREF} />);
    expect(screen.getByText("conectando")).toBeTruthy();
    expect(screen.getByText("abierto")).toBeTruthy();
    expect(screen.queryByText(/sin conexión/)).toBeNull();
  });

  describe("canal real de internet (cliente de Supabase de mentira)", () => {
    const cerrar: (() => void)[] = [];
    afterEach(() => cerrar.splice(0).forEach((c) => c()));

    it("conectando… y, a los 10 s sin SUBSCRIBED, «sin conexión» con el motivo; al cerrar, sin temporizador", async () => {
      const reloj = relojFalso();
      const canal = await crearCanalInternet("abcdefghijklmnopqrstuv", null, { poner: reloj.poner, quitar: reloj.quitar });
      if (!canal) throw new Error("sin canal");
      cerrar.push(() => canal.cerrar());
      canales = [{ ...INTERNET, abierto: false }]; // la foto real no copia estado()
      const { rerender } = render(<PanelEnVivo href={HREF} />);
      expect(screen.getByText("conectando…")).toBeTruthy();
      reloj.disparar();
      rerender(<PanelEnVivo href={HREF} />);
      expect(screen.getByRole("status").textContent).toBe("sin conexión: sin respuesta de Supabase Realtime en 10 s");
      supa.alEstado?.("SUBSCRIBED");
      expect(canal.estado()).toEqual({ fase: "abierto", motivo: null });
      expect(canal.abierto()).toBe(true);
      const otro = await crearCanalInternet("abcdefghijklmnopqrstuv", null, { poner: reloj.poner, quitar: reloj.quitar });
      cerrar.push(() => otro?.cerrar());
      expect(reloj.pendientes.size).toBe(1); // el temporizador de `otro`, aún sin SUBSCRIBED
      for (const c of [otro, canal]) c?.cerrar();
      expect(reloj.pendientes.size).toBe(0);
      expect(estadoCanalInternet()).toBeNull();
      expect(supa.quitados).toBeGreaterThan(0);
    });

    it("CHANNEL_ERROR: el motivo llega sin la dirección del proyecto, claves ni el tema", async () => {
      const reloj = relojFalso();
      const canal = await crearCanalInternet("abcdefghijklmnopqrstuv", null, { poner: reloj.poner, quitar: reloj.quitar });
      if (!canal) throw new Error("sin canal");
      cerrar.push(() => canal.cerrar());
      const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiYW5vbiJ9", "firma"].join(".");
      const host = ["abcdefghijklmnop", "supabase", "co"].join(".");
      supa.alEstado?.("CHANNEL_ERROR", new Error(`"Unauthorized: realtime:estacion-vivo:abcdefghijklmnopqrstuv wss://${host}/realtime/v1 apikey=${jwt}"`));
      expect(reloj.pendientes.size).toBe(1);
      reloj.disparar(); // el error ya dicho no se pisa con el de los 10 s
      const e = estadoCanalInternet();
      expect(e?.fase).toBe("error");
      expect(e?.motivo).toContain("Unauthorized");
      expect(e?.motivo).toContain("(CHANNEL_ERROR)");
      expect(e?.motivo).not.toMatch(/supabase\.co|eyJ|abcdefghijklmnopqrstuv|wss:/);
      canales = [{ ...INTERNET, abierto: false }];
      render(<PanelEnVivo href={HREF} />);
      expect(screen.getByRole("status").textContent).toMatch(/^sin conexión: Unauthorized/);
    });
  });
});
