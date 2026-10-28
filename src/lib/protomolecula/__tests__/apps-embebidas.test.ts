import { describe, it, expect, beforeEach } from "vitest";
import { APPS_EMBEBIDAS, registrarAppsEmbebidas } from "../apps-embebidas";
import { esUrlEmbebible } from "../puente-herramientas";
import { limpiarRegistro, listarAtomos, obtenerAtomo, registrarAtomo } from "../registro-atomos";

/** Origen de mentira: en el OS real lo da `window.location.origin`; nunca coincide con estas URLs. */
const ORIGEN_OS = "https://os-de-prueba.example";

/** La url externa de una app, sea cual sea su forma (`tipo: "externa"` lleva `url: string`). */
function urlExterna(def: (typeof APPS_EMBEBIDAS)[number]): string {
  const v = def.vista;
  if (v && v.tipo === "externa") return v.url;
  return "";
}

describe("apps embebidas (tercer grado, §3.2)", () => {
  beforeEach(() => limpiarRegistro());

  it("las ids de herramienta son únicas", () => {
    const ids = APPS_EMBEBIDAS.map((d) => d.herramientaId);
    expect(new Set(ids).size).toBe(APPS_EMBEBIDAS.length);
  });

  it("todas exigen solo ventana y cero parámetros, con integración iframe-aislado", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.control).toBe("ventana");
      expect(def.parametros).toEqual([]);
      expect(def.integracion).toBe("iframe-aislado");
    }
  });

  it("las urls con vista externa son https y pasan esUrlEmbebible (https, sin credenciales, origen ajeno al OS)", () => {
    for (const def of APPS_EMBEBIDAS) {
      const url = urlExterna(def);
      expect(url.startsWith("https://")).toBe(true);
      expect(esUrlEmbebible(url, ORIGEN_OS)).toEqual({ ok: true, origen: new URL(url).origin });
    }
  });

  it("honestidad: ninguna con vista externa declara proximamente; ninguna con proximamente tiene vista", () => {
    for (const def of APPS_EMBEBIDAS) {
      if (def.vista?.tipo === "externa") expect(def.proximamente).toBeUndefined();
      if (def.proximamente) expect(def.vista).toBeUndefined();
    }
  });

  it("cada ficha trae repo y licencia verificada (no «sin verificar»)", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.ficha?.repo).toBeTruthy();
      expect(def.ficha?.licencia).toBeTruthy();
      expect(def.ficha?.licencia).not.toBe("sin verificar");
    }
  });

  it("registrarAppsEmbebidas registra todas y es idempotente", () => {
    registrarAppsEmbebidas();
    const primeras = listarAtomos().map((d) => d.herramientaId);
    registrarAppsEmbebidas();
    expect(listarAtomos().map((d) => d.herramientaId)).toEqual(primeras);
    for (const def of APPS_EMBEBIDAS) {
      expect(obtenerAtomo(def.herramientaId)).toBeDefined();
    }
  });

  it("las apps no entran en el registro si algo cambia que lo invalide (nombre vacío)", () => {
    const copia = { ...APPS_EMBEBIDAS[0], nombre: "  ".repeat(50) };
    const r = registrarAtomo(copia);
    expect(r.ok).toBe(false);
  });
});
