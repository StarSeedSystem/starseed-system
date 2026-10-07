import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_AVISO_NOVEDAD_ARRANQUE,
  ESPERA_LUEGO_MS,
  UMBRAL_CUENTA_NUEVA_MS,
  debeMostrarAviso,
  esRutaExcluidaAviso,
  leerEstadoAviso,
  marcarAviso,
  type EntradaAvisoNovedad,
} from "../aviso-novedad";

const AHORA = 1_800_000_000_000;

function entradaBase(): EntradaAvisoNovedad {
  return {
    conSesion: true,
    ruta: "/escritorios",
    ritualOModalActivo: false,
    sinBloqueoConfigurado: true,
    pantallaInicialSinElegir: true,
    cuentaCreadaHaceMs: UMBRAL_CUENTA_NUEVA_MS + 1,
    estadoPrevio: null,
    ahora: AHORA,
  };
}

describe("esRutaExcluidaAviso", () => {
  it("excluye /login, /mando, /llamada y /vivo (y sus subrutas)", () => {
    expect(esRutaExcluidaAviso("/login")).toBe(true);
    expect(esRutaExcluidaAviso("/genesis")).toBe(true);
    expect(esRutaExcluidaAviso("/genesis/procesos")).toBe(true);
    expect(esRutaExcluidaAviso("/mando")).toBe(true);
    expect(esRutaExcluidaAviso("/mando/procesos")).toBe(true);
    expect(esRutaExcluidaAviso("/llamada")).toBe(true);
    expect(esRutaExcluidaAviso("/vivo")).toBe(true);
    expect(esRutaExcluidaAviso("/vivo/abc123")).toBe(true);
  });

  it("no excluye una página normal ni null", () => {
    expect(esRutaExcluidaAviso("/escritorios")).toBe(false);
    expect(esRutaExcluidaAviso("/mandoble")).toBe(false); // prefijo parcial, no es /mando
    expect(esRutaExcluidaAviso(null)).toBe(false);
  });
});

describe("debeMostrarAviso", () => {
  it("se muestra cuando todas las condiciones se cumplen (primera vez)", () => {
    expect(debeMostrarAviso(entradaBase())).toBe(true);
  });

  it("nunca sin sesión", () => {
    expect(debeMostrarAviso({ ...entradaBase(), conSesion: false })).toBe(false);
  });

  it("nunca en rutas excluidas (login, mando, llamada, vivo)", () => {
    for (const ruta of ["/login", "/genesis", "/mando", "/llamada", "/vivo"]) {
      expect(debeMostrarAviso({ ...entradaBase(), ruta })).toBe(false);
    }
  });

  it("nunca mientras un rito o un modal está en primer plano", () => {
    expect(debeMostrarAviso({ ...entradaBase(), ritualOModalActivo: true })).toBe(false);
  });

  it("nunca si esta neurona ya tiene un bloqueo configurado", () => {
    expect(debeMostrarAviso({ ...entradaBase(), sinBloqueoConfigurado: false })).toBe(false);
  });

  it("nunca si ya se eligió una pantalla inicial", () => {
    expect(debeMostrarAviso({ ...entradaBase(), pantallaInicialSinElegir: false })).toBe(false);
  });

  it("nunca si la cuenta tiene menos de 10 minutos (su propio rito ya lo ofrece)", () => {
    expect(debeMostrarAviso({ ...entradaBase(), cuentaCreadaHaceMs: UMBRAL_CUENTA_NUEVA_MS - 1 })).toBe(false);
    expect(debeMostrarAviso({ ...entradaBase(), cuentaCreadaHaceMs: 0 })).toBe(false);
  });

  it("una antigüedad desconocida (null) no bloquea el aviso", () => {
    expect(debeMostrarAviso({ ...entradaBase(), cuentaCreadaHaceMs: null })).toBe(true);
  });

  it("nunca si ya se respondió «configurado»", () => {
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "configurado", fecha: 0 } })).toBe(false);
  });

  it("nunca si ya se respondió «no-mostrar»", () => {
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "no-mostrar", fecha: AHORA - 1 } })).toBe(false);
  });

  it("«luego» sigue posponiendo mientras la espera de 3 días no haya vencido", () => {
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "luego", fecha: AHORA - (ESPERA_LUEGO_MS - 1) } })).toBe(false);
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "luego", fecha: AHORA } })).toBe(false);
  });

  it("«luego» vuelve a mostrarse justo al vencer la espera de 3 días", () => {
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "luego", fecha: AHORA - ESPERA_LUEGO_MS } })).toBe(true);
    expect(debeMostrarAviso({ ...entradaBase(), estadoPrevio: { respuesta: "luego", fecha: AHORA - (ESPERA_LUEGO_MS + 1) } })).toBe(true);
  });
});

describe("marcarAviso / leerEstadoAviso", () => {
  beforeEach(() => {
    const d = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      clear: () => d.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no hay nada guardado antes de la primera respuesta", () => {
    expect(leerEstadoAviso()).toBeNull();
  });

  it("guarda y relee la respuesta con su fecha", () => {
    marcarAviso("luego", 12345);
    expect(leerEstadoAviso()).toEqual({ respuesta: "luego", fecha: 12345 });
  });

  it("una respuesta posterior sustituye a la anterior", () => {
    marcarAviso("luego", 1);
    marcarAviso("no-mostrar", 2);
    expect(leerEstadoAviso()).toEqual({ respuesta: "no-mostrar", fecha: 2 });
  });

  it("un valor corrupto en la clave se ignora sin lanzar", () => {
    localStorage.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, "{no es json");
    expect(leerEstadoAviso()).toBeNull();
    localStorage.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, JSON.stringify({ respuesta: "otra-cosa", fecha: 1 }));
    expect(leerEstadoAviso()).toBeNull();
  });
});
