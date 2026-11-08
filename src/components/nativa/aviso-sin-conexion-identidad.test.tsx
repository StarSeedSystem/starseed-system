/** (IDN1108B) La pastilla enseña la etiqueta de identidad (§5.1) y el helper junta la entrada real. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
const estado = vi.hoisted(() => ({
  llamadas: 0,
  modo: null as { modo: string; identidad: string; etiqueta: string; motivo: string } | null,
  entrada: null as Record<string, unknown> | null,
  decidir: { modo: "sin-internet", identidad: "certificada", etiqueta: "Sin internet · identidad de cuenta certificada", motivo: "" },
}));
vi.mock("@/lib/identidad/modo-acceso-cliente", () => ({
  modoAccesoSinRed: vi.fn(async () => {
    estado.llamadas += 1;
    return estado.modo;
  }),
}));
vi.mock("@/lib/identidad/modo-sin-internet", async () => {
  const actual = await vi.importActual<typeof import("@/lib/identidad/modo-sin-internet")>("@/lib/identidad/modo-sin-internet");
  return {
    ...actual,
    decidirModoAcceso: vi.fn(async (entrada: Record<string, unknown>) => {
      estado.entrada = entrada;
      return estado.decidir;
    }),
  };
});
import { AvisoSinConexion } from "@/components/nativa/aviso-sin-conexion";

function red(enLinea: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: enLinea });
}
async function helper() {
  return vi.importActual<typeof import("@/lib/identidad/modo-acceso-cliente")>("@/lib/identidad/modo-acceso-cliente");
}
beforeEach(() => {
  estado.llamadas = 0;
  estado.modo = null;
  estado.entrada = null;
  estado.decidir = { modo: "sin-internet", identidad: "certificada", etiqueta: "Sin internet · identidad de cuenta certificada", motivo: "" };
  red(false);
});

afterEach(() => {
  cleanup();
  red(true);
});

describe("AvisoSinConexion · etiqueta de identidad", () => {
  it("sin red y decisión «sin-internet» certificada: la etiqueta sale tras el título y en el title", async () => {
    estado.modo = { modo: "sin-internet", identidad: "certificada", etiqueta: "Sin internet · identidad de cuenta certificada", motivo: "" };
    render(<AvisoSinConexion />);
    expect(await screen.findByText("Sin internet · identidad de cuenta certificada")).toBeTruthy();
    const pastilla = screen.getByTestId("aviso-sin-conexion");
    expect(screen.getByText("Sin conexión: trabajando en local")).toBeTruthy();
    expect(pastilla.getAttribute("title")).toContain("Sin internet · identidad de cuenta certificada");
    expect(estado.llamadas).toBe(1);
  });

  it("con decisión «login» la pastilla sale pero no añade etiqueta", async () => {
    estado.modo = { modo: "login", identidad: "ninguna", etiqueta: "", motivo: "sin sesión guardada" };
    render(<AvisoSinConexion />);
    await waitFor(() => expect(estado.llamadas).toBe(1));
    expect(screen.getByTestId("aviso-sin-conexion")).toBeTruthy();
    expect(screen.queryByText("Sin internet · identidad de cuenta certificada")).toBeNull();
  });

  it("con red no se llama al helper y no hay pastilla", async () => {
    red(true);
    render(<AvisoSinConexion />);
    await waitFor(() => expect(screen.queryByTestId("aviso-sin-conexion")).toBeNull());
    expect(estado.llamadas).toBe(0);
  });
});

describe("modoAccesoSinRed · lectura en el cliente", () => {
  it("junta la entrada sin red con la sesión en caché y el certificado del servicio", async () => {
    const { modoAccesoSinRed } = await helper();
    const certificado = { v: 1, neuronaId: "n-1" };
    const anclas = [{ mfp: "acct:uno", nivel: "propia" as const, confianza: 1 }];
    const servicio = {
      certificadoPropio: async () => certificado,
      anclas: { listar: async () => anclas },
      revocaciones: { cargar: async () => new Map(), estaRevocada: () => false },
      estado: async () => ({ neuronaId: "n-1" }),
    };
    const r = await modoAccesoSinRed({ sesionEnCache: async () => true, servicio: async () => servicio, ahora: () => 123 });
    expect(r?.modo).toBe("sin-internet");
    expect(estado.entrada).toMatchObject({
      enLinea: false,
      fallaRed: true,
      sesionVerificada: false,
      sesionEnCache: true,
      certificado,
      ahora: 123,
      esperado: { neuronaId: "n-1" },
    });
    expect(estado.entrada?.anclas).toEqual(anclas);
  });

  it("devuelve null si el servicio de identidad lanza", async () => {
    const { modoAccesoSinRed } = await helper();
    const servicio = async (): Promise<never> => {
      throw new Error("servicio roto");
    };
    expect(await modoAccesoSinRed({ sesionEnCache: async () => true, servicio })).toBeNull();
  });

  it("detecta la clave de sesión de Supabase solo si tiene valor", async () => {
    const { haySesionEnCache } = await helper();
    const almacen = (datos: Record<string, string>) => {
      const claves = Object.keys(datos);
      return { length: claves.length, key: (i: number) => claves[i] ?? null, getItem: (k: string) => datos[k] ?? null };
    };
    expect(haySesionEnCache(almacen({ "sb-proyecto-auth-token": '{"access_token":"a"}' }))).toBe(true);
    expect(haySesionEnCache(almacen({ "sb-proyecto-auth-token.0": "trozo" }))).toBe(true);
    expect(haySesionEnCache(almacen({ "sb-proyecto-auth-token": "   " }))).toBe(false);
    expect(haySesionEnCache(almacen({ otra: "x" }))).toBe(false);
    expect(haySesionEnCache(null)).toBe(false);
  });
});
