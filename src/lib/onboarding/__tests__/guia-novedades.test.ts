// @vitest-environment jsdom
/**
 * Aviso único de novedades de la guía (Ola 1021G · GUI1021H).
 * Una cuenta que vio la versión 1 tiene pendientes los diez temas de §3; al verlos o descartarlos
 * se guarda la versión 2 en la marca de la cuenta y el aviso no vuelve a salir en ningún medio.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas } from "@/lib/sync/avisos-cuenta";
import { PASOS_GUIA } from "../guia-completa";
import {
  AVISO_GUIA_BIENVENIDA,
  GUIA_VERSION,
  TEMAS_NUEVOS_V2,
  marcarGuiaVista,
  temasNuevosPara,
  versionGuiaVistaEnCuenta,
} from "../guia-vista";

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number }>): void {
  localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
  _reiniciarCacheAvisosParaPruebas();
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheAvisosParaPruebas();
});

describe("temasNuevosPara · lógica pura", () => {
  it("quien nunca vio la guía no recibe un aviso de novedades", () => {
    expect(temasNuevosPara(null)).toEqual([]);
    expect(temasNuevosPara(undefined)).toEqual([]);
    expect(temasNuevosPara(Number.NaN)).toEqual([]);
  });

  it("la versión 1 tiene pendientes exactamente los diez temas de §3, en orden de catálogo", () => {
    expect(GUIA_VERSION).toBe(2);
    expect(temasNuevosPara(1)).toEqual([...TEMAS_NUEVOS_V2]);
    expect(TEMAS_NUEVOS_V2).toHaveLength(10);
    expect(TEMAS_NUEVOS_V2[0]).toBe("protomolecula"); // el primero que abre «Ver ahora»
    expect(TEMAS_NUEVOS_V2).toEqual([
      "protomolecula",
      "malla",
      "capas-conciencia",
      "neuronas-cerebro",
      "pilar-politica",
      "pilar-educacion",
      "pilar-cultura",
      "libreria-biblioteca",
      "genesis",
      "personalizacion-segura",
    ]);
  });

  it("cada tema pendiente es un paso real del catálogo (no se inventa nada)", () => {
    const ids = new Set(PASOS_GUIA.map((p) => p.id));
    for (const tema of TEMAS_NUEVOS_V2) expect(ids.has(tema)).toBe(true);
  });

  it("la versión actual y las posteriores ya no tienen novedades pendientes", () => {
    expect(temasNuevosPara(GUIA_VERSION)).toEqual([]);
    expect(temasNuevosPara(GUIA_VERSION + 1)).toEqual([]);
  });

  it("el aviso cabe en una línea: «Novedades de la guía: 10 temas nuevos»", () => {
    expect(`Novedades de la guía: ${temasNuevosPara(1).length} temas nuevos`).toBe(
      "Novedades de la guía: 10 temas nuevos",
    );
  });
});

describe("aviso de novedades · marca de la cuenta", () => {
  it("una cuenta nueva no tiene versión vista", () => {
    expect(versionGuiaVistaEnCuenta()).toBeNull();
    expect(temasNuevosPara(versionGuiaVistaEnCuenta())).toEqual([]);
  });

  it("una cuenta de la versión 1 (marca antigua) tiene los diez temas pendientes", () => {
    cuenta({ [AVISO_GUIA_BIENVENIDA]: { estado: "hecho", ts: 10 } });
    expect(versionGuiaVistaEnCuenta()).toBe(1);
    expect(temasNuevosPara(versionGuiaVistaEnCuenta())).toHaveLength(10);
  });

  it("al verlo o descartarlo se guarda la versión y el aviso no vuelve (ni en otro medio)", () => {
    cuenta({ [AVISO_GUIA_BIENVENIDA]: { estado: "hecho", ts: 10 } });
    marcarGuiaVista(GUIA_VERSION); // «Ver ahora» o «Más tarde»
    expect(versionGuiaVistaEnCuenta()).toBe(2);
    expect(temasNuevosPara(versionGuiaVistaEnCuenta())).toEqual([]);

    // Otro medio lee la MISMA marca de la cuenta: tampoco allí hay aviso.
    _reiniciarCacheAvisosParaPruebas();
    expect(versionGuiaVistaEnCuenta()).toBe(2);
    expect(temasNuevosPara(versionGuiaVistaEnCuenta())).toEqual([]);
  });

  it("cerrar la guía por primera vez también deja la versión actual", () => {
    marcarGuiaVista();
    expect(versionGuiaVistaEnCuenta()).toBe(GUIA_VERSION);
    expect(temasNuevosPara(versionGuiaVistaEnCuenta())).toEqual([]);
  });

  it("con el almacenamiento roto no lanza y no da novedades por vistas", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(versionGuiaVistaEnCuenta()).toBeNull();
      expect(() => marcarGuiaVista(GUIA_VERSION)).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
