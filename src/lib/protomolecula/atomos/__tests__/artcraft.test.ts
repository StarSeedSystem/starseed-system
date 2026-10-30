/**
 * Pruebas puras de los átomos web de ArtCraft: contrato del átomo, URL del build alojado
 * como origen aparte, vista aislada y registro idempotente. Sin red, sin disco, sin código ejecutado.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_ARTCRAFT, crearAtomosArtcraft, documentoArtcraft, urlBuildWeb } from "../artcraft";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../index";
import { limpiarRegistro, listarAtomos, registrarAtomo, type DefinicionAtomo } from "../../registro-atomos";

const ORIGEN = "https://artcraft.example.com";
const htmlDe = (a: DefinicionAtomo): string => (a.vista?.tipo === "documento" ? a.vista.documento() : "");

describe("átomos web de ArtCraft", () => {
  beforeEach(() => limpiarRegistro());

  it("declara los tres ids del catálogo, aislados y con control de ventana", () => {
    expect(ATOMOS_ARTCRAFT.map((a) => a.herramientaId)).toEqual(["figcraft", "gridcraft", "deckcraft"]);
    for (const a of ATOMOS_ARTCRAFT) {
      expect(a.integracion).toBe("iframe-aislado");
      expect(a.control).toBe("ventana");
      expect(a.categoria).toBe(a.herramientaId === "gridcraft" ? "codigo" : "imagen");
      expect(a.proximamente).toBeUndefined();
    }
  });

  it("declara parámetros cortos, de tipo seguro y saneados", () => {
    for (const a of ATOMOS_ARTCRAFT) {
      expect(a.parametros.length).toBeGreaterThan(0);
      for (const p of a.parametros) {
        expect(["numero", "entero", "booleano", "opcion"]).toContain(p.tipo);
        expect(p.id).toMatch(/^[a-z0-9-]+$/);
        expect(p.nombre).not.toContain("<");
      }
    }
  });

  it("sin origen alojado no pinta iframe y avisa con el nombre y el repositorio", () => {
    for (const a of ATOMOS_ARTCRAFT) {
      const html = htmlDe(a);
      expect(html).not.toContain("<iframe");
      expect(html).toContain("Próximamente");
      expect(html).toContain(a.nombre);
      expect(html).toContain("aún no está alojado");
      expect(html).toContain("//github.com/storytold/");
    }
  });

  it("con un origen válido pinta el iframe aislado y acota la CSP a ese origen", () => {
    const html = documentoArtcraft("figcraft", ORIGEN);
    expect(html).toContain(`<iframe id="marco" src="${ORIGEN}/artcraft/figcraft/index.html"`);
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain(`frame-src ${ORIGEN}`);
    expect(html).not.toContain("allow-top-navigation");
    expect(html).not.toContain("allow-popups");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["http sin https", "http://artcraft.example.com"],
    ["credenciales", "https://usuario:clave@artcraft.example.com"],
    ["texto suelto", "no es una URL"],
    ["vacío", ""],
    ["ausente", null],
  ] as const)("rechaza el origen %s", (_nombre, origen) => {
    expect(urlBuildWeb("figcraft", origen)).toBeNull();
    expect(documentoArtcraft("figcraft", origen)).not.toContain("<iframe");
  });

  it("no embebe un build del mismo origen que el OS y sí uno aparte", () => {
    expect(urlBuildWeb("figcraft", "https://os.example.com", "https://os.example.com")).toBeNull();
    expect(urlBuildWeb("figcraft", ORIGEN, "https://os.example.com")).toBe(`${ORIGEN}/artcraft/figcraft/index.html`);
    expect(urlBuildWeb("gridcraft", `${ORIGEN}/`)).toBe(`${ORIGEN}/artcraft/gridcraft/index.html`);
  });

  it("las vistas llevan CSP, marcador del canal y nada que ejecute código ajeno", () => {
    for (const a of ATOMOS_ARTCRAFT) {
      const html = htmlDe(a);
      expect(html).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain("__PM_CANAL__");
      expect(html).toMatch(/default-src 'none'/);
      expect(html).toContain("protomolecula:1");
      for (const prohibida of ["eval(", "new Function", "fetch(", "XMLHttpRequest", "WebSocket", "importScripts"]) {
        expect(html, `${a.herramientaId} no debe contener ${prohibida}`).not.toContain(prohibida);
      }
      expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    }
  });

  it("la fábrica liga el origen alojado a las tres vistas", () => {
    const conOrigen = crearAtomosArtcraft(ORIGEN, "https://os.example.com");
    expect(conOrigen).toHaveLength(3);
    for (const a of conOrigen) {
      const html = htmlDe(a);
      expect(html).toContain("<iframe");
      expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
      expect(html).not.toContain("allow-top-navigation");
      expect(html).not.toContain("allow-popups");
    }
  });

  it("registrar dos veces no duplica y el índice sigue siendo idempotente", () => {
    for (const a of ATOMOS_ARTCRAFT) expect(registrarAtomo(a)).toEqual({ ok: true });
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(listarAtomos()).toHaveLength(ATOMOS_PROPIOS.length);
    const artcraft = listarAtomos().filter((a) => ATOMOS_ARTCRAFT.some((x) => x.herramientaId === a.herramientaId));
    expect(artcraft.map((a) => a.herramientaId)).toEqual(["figcraft", "gridcraft", "deckcraft"]);
  });
});
