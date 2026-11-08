/**
 * (NEU1108A) `capabilities.aparato`: la identidad del aparato que cada neurona guarda en su fila (sin
 * migración), su huella (hash, nunca el hierro crudo) y cómo se funde sin que un navegador pise lo que
 * escribió la app nativa.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/aparato-registro.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  aparatoDesde,
  combinarAparato,
  compararAparatos,
  entradaHuella,
  equipoUtil,
  huellaAparato,
  leerAparato,
  sanearAparato,
} from "../aparato-registro";

const AHORA = Date.parse("2026-11-08T01:20:00Z");
const INFO_TABLETA = {
  app_version: "0.5.0",
  sistema: "os",
  plataforma: "android",
  so_version: "14",
  arquitectura: "aarch64",
  equipo: null,
  modelo: "Samsung SM-X205",
};
const INFO_MAC = { app_version: "0.5.0", sistema: "os", plataforma: "macos", so_version: "15.1", arquitectura: "aarch64", equipo: "MaggaBook.local", modelo: null };

describe("huella del aparato", () => {
  it("sin equipo (un navegador) no hay huella; «localhost» de Android tampoco cuenta como equipo", () => {
    expect(entradaHuella({ so: "android", equipo: null, cores: 8 })).toBeNull();
    expect(entradaHuella({ so: "android", equipo: "localhost", cores: 8 })).toBeNull();
    expect(equipoUtil("localhost")).toBe(false);
    expect(equipoUtil("MaggaBook.local")).toBe(true);
  });

  it("escritorio: sistema + equipo (sin pantalla ni GPU: cambian con monitores y zoom)", () => {
    expect(entradaHuella({ so: "macOS", equipo: "MaggaBook.local", cores: 8, pantalla: "900x1440@2" })).toBe("starseed-aparato:v1|macos|maggabook");
    expect(entradaHuella({ so: "macos", equipo: "maggabook", pantalla: "1080x1920@1" })).toBe("starseed-aparato:v1|macos|maggabook");
  });

  it("móvil: modelo + núcleos + GPU + pantalla (dos aparatos del mismo modelo casi nunca coinciden en todo)", () => {
    const a = entradaHuella({ so: "android", equipo: "Samsung SM-X205", cores: 8, gpuRenderer: "ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)", pantalla: "800x1340@1.5" });
    const b = entradaHuella({ so: "Android", equipo: "Samsung SM-X205", cores: "8", gpuRenderer: "Mali-G57 MC2", pantalla: "800x1340@1.5" });
    expect(a).toBe(b);
    expect(entradaHuella({ so: "android", equipo: "Samsung SM-X205", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "720x1280@2" })).not.toBe(a);
  });

  it("es un hash corto (16 hex), estable, y nunca el texto del hierro", async () => {
    const d = { so: "android", equipo: "Samsung SM-X205", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "800x1340@1.5" };
    const h = await huellaAparato(d);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await huellaAparato({ ...d })).toBe(h);
    expect(await huellaAparato({ so: "android", equipo: null })).toBeNull();
  });
});

describe("bloque `aparato`", () => {
  it("la app nativa escribe su identidad; el navegador, solo el medio, la hora y el sistema", () => {
    const nativa = aparatoDesde({ medio: "android", info: INFO_TABLETA, plataforma: "Android", huella: "a1a1a1a1b2b2b2b2", ahora: AHORA });
    expect(nativa).toEqual({
      v: 1,
      medio: "android",
      app: "os",
      so: "android",
      soV: "14",
      arq: "aarch64",
      equipo: "Samsung SM-X205",
      huella: "a1a1a1a1b2b2b2b2",
      version: "0.5.0",
      ultimoMedio: "android",
      visto: "2026-11-08T01:20:00.000Z",
    });
    expect(aparatoDesde({ medio: "web", plataforma: "macOS", ahora: AHORA })).toEqual({ v: 1, so: "macos", ultimoMedio: "web", visto: "2026-11-08T01:20:00.000Z" });
  });

  it("un navegador nunca pisa lo que escribió la app nativa: solo apunta el último medio y la hora", () => {
    const fila = aparatoDesde({ medio: "escritorio", info: INFO_MAC, huella: "0123456789abcdef", ahora: AHORA - 3_600_000 });
    const web = aparatoDesde({ medio: "web", plataforma: "macOS", ahora: AHORA });
    const r = combinarAparato(fila, web);
    expect(r).toMatchObject({ medio: "escritorio", equipo: "MaggaBook.local", huella: "0123456789abcdef", version: "0.5.0", ultimoMedio: "web", visto: "2026-11-08T01:20:00.000Z" });
  });

  it("una app nativa nueva sustituye la identidad entera (sin mezclar campos de dos versiones)", () => {
    const vieja = { v: 1, medio: "escritorio", equipo: "MaggaBook", version: "0.4.2", soV: "14.0", huella: "1111111111111111" };
    const nueva = aparatoDesde({ medio: "escritorio", info: { ...INFO_MAC, so_version: null }, huella: null, ahora: AHORA });
    const r = combinarAparato(vieja, nueva);
    expect(r?.version).toBe("0.5.0");
    expect(r?.soV).toBeUndefined();
    expect(r?.huella).toBeUndefined();
  });

  it("lo que llega de la base de datos se sanea (basura fuera, nunca lanza)", () => {
    expect(sanearAparato(null)).toBeNull();
    expect(sanearAparato({ v: 1 })).toBeNull();
    expect(sanearAparato({ medio: "satélite", huella: "XYZ", version: "build-77", equipo: "  localhost ", so: "Android" })).toEqual({ v: 1, so: "android" });
    expect(leerAparato({ aparato: { equipo: "Mac\u0007Book", version: "v0.5.0" } })).toEqual({ v: 1, equipo: "MacBook", version: "0.5.0" });
    expect(leerAparato("nada")).toBeNull();
  });
});

describe("compararAparatos", () => {
  const tableta = { v: 1 as const, so: "android", equipo: "Samsung SM-X205", huella: "a1a1a1a1b2b2b2b2" };
  it("misma huella → mismo; otra huella → distinto (aunque el modelo coincida)", () => {
    expect(compararAparatos(tableta, { ...tableta }).parecido).toBe("mismo");
    expect(compararAparatos(tableta, { ...tableta, huella: "ffffffff00000000" })).toMatchObject({ parecido: "distinto" });
  });
  it("sin huellas: el equipo decide; sin equipo en alguno, no se sabe", () => {
    expect(compararAparatos({ v: 1, so: "macos", equipo: "MaggaBook" }, { v: 1, so: "macos", equipo: "maggabook.local" }).parecido).toBe("mismo");
    expect(compararAparatos({ v: 1, so: "android", equipo: "Samsung SM-X205" }, { v: 1, so: "android", equipo: "Samsung SM-A536B" })).toEqual({
      parecido: "distinto",
      motivo: "otro equipo (Samsung SM-A536B)",
    });
    expect(compararAparatos({ v: 1, so: "android", equipo: "Samsung SM-X205" }, { v: 1, so: "android" }).parecido).toBe("sin-datos");
    expect(compararAparatos(null, tableta).parecido).toBe("sin-datos");
  });
  it("sistemas distintos → distinto", () => {
    expect(compararAparatos({ v: 1, so: "ios" }, { v: 1, so: "android", equipo: "x" }).parecido).toBe("distinto");
  });
});
