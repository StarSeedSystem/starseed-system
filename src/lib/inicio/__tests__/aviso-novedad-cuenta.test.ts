// @vitest-environment jsdom
/**
 * Aviso de novedad con la cuenta (2026-09-29, persistencia entre medios): la respuesta viaja con la
 * cuenta, la marca local antigua se respeta y se copia, y lo definitivo gana a «más tarde».
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  AVISO_NOVEDAD_ARRANQUE,
  CLAVE_AVISO_NOVEDAD_ARRANQUE,
  ESPERA_LUEGO_MS,
  copiarAvisoLocalACuenta,
  leerEstadoAviso,
  marcarAviso,
} from "../aviso-novedad";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const T0 = 1_800_000_000_000;

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
  localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
  _reiniciarCacheAvisosParaPruebas();
}

function local(respuesta: string, fecha: number): void {
  localStorage.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, JSON.stringify({ respuesta, fecha }));
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheAvisosParaPruebas();
});

describe("leerEstadoAviso con la cuenta", () => {
  it("nada en ningún sitio: null", () => {
    expect(leerEstadoAviso()).toBeNull();
  });

  it("la cuenta lo sabe (otro medio): «configurado», «no-mostrar» y «luego» se traducen", () => {
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "hecho", ts: 7 } });
    expect(leerEstadoAviso()).toEqual({ respuesta: "configurado", fecha: 7 });
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "visto", ts: 8 } });
    expect(leerEstadoAviso()).toEqual({ respuesta: "no-mostrar", fecha: 8 });
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: 9, hasta: 99 } });
    expect(leerEstadoAviso()).toEqual({ respuesta: "luego", fecha: 9 });
  });

  it("lo definitivo (de cualquier lado) gana a «luego»", () => {
    local("luego", T0);
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "hecho", ts: 5 } });
    expect(leerEstadoAviso()?.respuesta).toBe("configurado");
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: T0 + 5, hasta: T0 + 6 } });
    local("no-mostrar", 1);
    expect(leerEstadoAviso()?.respuesta).toBe("no-mostrar");
  });

  it("entre dos «luego», el más reciente", () => {
    local("luego", T0);
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: T0 + 100, hasta: T0 + 200 } });
    expect(leerEstadoAviso()).toEqual({ respuesta: "luego", fecha: T0 + 100 });
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: T0 - 100, hasta: T0 + 200 } });
    expect(leerEstadoAviso()).toEqual({ respuesta: "luego", fecha: T0 });
  });
});

describe("marcarAviso escribe también en la cuenta", () => {
  it("«configurado» → hecho; «no-mostrar» → visto; «luego» → luego con plazo de 3 días", () => {
    marcarAviso("configurado", T0);
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("hecho");
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    marcarAviso("no-mostrar", T0);
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("visto");
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    marcarAviso("luego", T0);
    const r = estadoAviso(AVISO_NOVEDAD_ARRANQUE);
    expect(r.estado).toBe("luego");
    expect(r.hasta).toBe(T0 + ESPERA_LUEGO_MS);
  });

  it("se sigue guardando la marca local (compatibilidad hacia atrás)", () => {
    marcarAviso("luego", T0);
    expect(JSON.parse(localStorage.getItem(CLAVE_AVISO_NOVEDAD_ARRANQUE)!)).toEqual({ respuesta: "luego", fecha: T0 });
  });

  it("«luego» no des-hace un «configurado» ya guardado en la cuenta", () => {
    marcarAviso("configurado", T0);
    marcarAviso("luego", T0 + 10);
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("hecho");
    expect(leerEstadoAviso()?.respuesta).toBe("configurado");
  });
});

describe("copiarAvisoLocalACuenta", () => {
  it("sin marca local no hace nada", () => {
    copiarAvisoLocalACuenta();
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBeNull();
  });

  it("una respuesta local que la cuenta no conoce se copia (una sola vez)", () => {
    local("no-mostrar", T0);
    copiarAvisoLocalACuenta();
    const r = estadoAviso(AVISO_NOVEDAD_ARRANQUE);
    expect(r.estado).toBe("visto");
    copiarAvisoLocalACuenta();
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).ts).toBe(r.ts);
  });

  it("un «luego» local no pisa un definitivo de la cuenta", () => {
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "hecho", ts: 3 } });
    local("luego", T0);
    copiarAvisoLocalACuenta();
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("hecho");
  });

  it("un definitivo local sí sustituye a un «luego» de la cuenta", () => {
    cuenta({ [AVISO_NOVEDAD_ARRANQUE]: { estado: "luego", ts: T0, hasta: T0 + 5 } });
    local("configurado", T0 + 1);
    copiarAvisoLocalACuenta();
    expect(estadoAviso(AVISO_NOVEDAD_ARRANQUE).estado).toBe("hecho");
  });
});
