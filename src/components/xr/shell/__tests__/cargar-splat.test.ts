import { describe, it, expect } from "vitest";
import type { NivelCalidad } from "@/lib/xr/tipos";

import {
  presupuestoSplat,
  urlSplatSegura,
  revisarUrlSplat,
  urlSplatDeObjeto,
  cargarSplat,
  MAX_BYTES_SPLAT,
  MOTIVO_TAMANO_SPLAT,
  MOTIVO_NIVEL_SPLAT,
  MOTIVO_FALLO_SPLAT,
  MOTIVO_URL_SPLAT,
  URL_OK,
  BYTES,
  type ConstructorSplatMesh,
  type MallaSplat,
  type ObjetoBiblioteca,
} from "../cargar-splat";

function objeto(opts: { tipo: string; id?: string; formato?: string; contenido?: string }): ObjetoBiblioteca {
  return { tipo: opts.tipo, id: opts.id, formato: opts.formato, contenido: opts.contenido } as ObjetoBiblioteca;
}

const BYTES grande = { byteLength: MAX_BYTES_SPLAT + 1 } as unknown as Uint8Array;

const creadorFalso = (registro: { opciones?: any }) => {
  return class as unknown as ConstructorSplatMesh;
};

describe("cargar-splat", () => {
  it("presupuesto: 1,5 M en alta, 3 M en máxima y 0 en los demás", () => {
    expect(presupuestoSplat("alta")).toBe(1_500_000);
    expect(presupuestoSplat("maxima")).toBe(3_000_000);
    for (const nivel of ["minima", "baja", "media"] as NivelCalidad[]) expect(presupuestoSplat(nivel)).toBe(0);
  });

  it("acepta una URL https normal", () => {
    expect(urlSplatSegura(URL_OK)).toBe(true);
    expect(revisarUrlSplat(URL_OK)).toBeNull();
  });

  it("devuelve la URL y no la inventa", () => {
    expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL_OK, formato: "splat" }))).toBe(URL_OK);
    expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL_OK, formato: "glb" }))).toBeNull();
    expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: "ficha-123", formato: "splat" }))).toBeNull();
    expect(urlSplatDeObjeto(objeto({ tipo: "texto", contenido: "hola" }))).toBeNull();
  });

  it("un archivo mayor de 60 MB no se carga y dice el motivo", async () => {
    const grande = { byteLength: MAX_BYTES_SPLAT + 1 } as unknown as Uint8Array;
    const r = await cargarSplat(URL_OK, { obtenerBytes: async () => grande });
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining(MOTIVO_TAMANO_SPLAT) });
    if (!r.ok) expect(r.motivo).toContain("60 MB");
  });

  it("un nivel que no admite splats ni descarga el archivo", async () => {
    let descargado = false;
    const r = await cargarSplat(URL_OK, { nivel: "media", obtenerBytes: async () => ((descargado = true), BYTES) });
    expect(r).toEqual({ ok: false, motivo: MOTIVO_NIVEL_SPLAT });
    expect(descargado).toBe(false);
  });

  it("un cargador falso que lanza devuelve { ok:false }", async () => {
    const lanza = function lanza(): MallaSplat { throw new Error("motor roto"); } as unknown as ConstructorSplatMesh;
    const r = await cargarSplat(URL_OK, { nivel: "alta", SplatMesh: lanza, obtenerBytes: async () => BYTES });
    expect(r).toEqual({ ok: false, motivo: MOTIVO_FALLO_SPLAT });
  });

  it("si el import perezoso de Spark falla, tampoco lanza", async () => {
    const r = await cargarSplat(URL_OK, {
      nivel: "maxima", obtenerBytes: async () => BYTES,
      importarSpark: async () => { throw new Error("sin motor"); },
    });
    expect(r).toEqual({ ok: false, motivo: MOTIVO_FALLO_SPLAT });
  });

  it("una URL insegura se rechaza antes de descargar", async () => {
    let descargado = false;
    const r = await cargarSplat("http://cdn.starseed.app/a.spz", {
      obtenerBytes: async () => ((descargado = true), BYTES),
    });
    expect(r).toEqual({ ok: false, motivo: MOTIVO_URL_SPLAT });
    expect(descargado).toBe(false);
  });

  it("construye la malla con los bytes, el tope del nivel y sin credenciales", async () => {
    const registro: { opciones?: any } = {};
    const r = await cargarSplat(URL_OK, {
      nivel: "alta", SplatMesh: creadorFalso(registro), obtenerBytes: async () => BYTES,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bytes).toBe(BYTES.byteLength);
      expect(r.puntos).toBe(1_500_000);
      expect(typeof r.malla.dispose).toBe("function");
    }
    expect(registro.opciones).toMatchObject({
      url: URL_OK, fileBytes: BYTES, maxSplats: 1_500_000, withCredentials: false,
    });
  });
});