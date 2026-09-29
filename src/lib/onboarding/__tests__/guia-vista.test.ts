// @vitest-environment jsdom
/**
 * Guía de bienvenida vista con la cuenta (2026-09-29): la marca local antigua se respeta, se copia
 * a la cuenta y «vista» en cualquier medio basta para no reabrirla sola.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";
import { AVISO_GUIA_BIENVENIDA, CLAVE_GUIA_VISTA_LOCAL, copiarGuiaLocalACuenta, guiaVistaAqui, marcarGuiaVista } from "../guia-vista";

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
  localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
  _reiniciarCacheAvisosParaPruebas();
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheAvisosParaPruebas();
});

describe("guía vista", () => {
  it("medio nuevo y cuenta sin registro: no consta como vista", () => {
    expect(guiaVistaAqui()).toBe(false);
    expect(copiarGuiaLocalACuenta()).toBe(false);
    expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBeNull();
  });

  it("vista en OTRO medio (la cuenta lo sabe): no se abre sola aquí", () => {
    cuenta({ [AVISO_GUIA_BIENVENIDA]: { estado: "hecho", ts: 10 } });
    expect(guiaVistaAqui()).toBe(true);
    expect(copiarGuiaLocalACuenta()).toBe(true);
    expect(localStorage.getItem(CLAVE_GUIA_VISTA_LOCAL)).toBeNull(); // no se inventa marca local
  });

  it("marca local antigua: se respeta y se copia a la cuenta (una sola vez)", () => {
    localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "1");
    expect(guiaVistaAqui()).toBe(true);
    expect(copiarGuiaLocalACuenta()).toBe(true);
    const r = estadoAviso(AVISO_GUIA_BIENVENIDA);
    expect(r.estado).toBe("hecho");
    copiarGuiaLocalACuenta();
    expect(estadoAviso(AVISO_GUIA_BIENVENIDA).ts).toBe(r.ts); // idempotente: no reescribe
  });

  it("un valor local distinto de «1» no cuenta", () => {
    localStorage.setItem(CLAVE_GUIA_VISTA_LOCAL, "0");
    expect(guiaVistaAqui()).toBe(false);
  });

  it("marcarGuiaVista deja huella en este medio y en la cuenta", () => {
    marcarGuiaVista();
    expect(localStorage.getItem(CLAVE_GUIA_VISTA_LOCAL)).toBe("1");
    expect(estadoAviso(AVISO_GUIA_BIENVENIDA).estado).toBe("hecho");
    const ts = estadoAviso(AVISO_GUIA_BIENVENIDA).ts;
    marcarGuiaVista(); // cerrarla otra vez no reescribe la marca
    expect(estadoAviso(AVISO_GUIA_BIENVENIDA).ts).toBe(ts);
  });

  it("con el almacenamiento roto no lanza y no da nada por visto", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(guiaVistaAqui()).toBe(false);
      expect(() => marcarGuiaVista()).not.toThrow();
      expect(() => copiarGuiaLocalACuenta()).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
