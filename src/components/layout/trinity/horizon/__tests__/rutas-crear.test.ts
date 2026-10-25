/**
 * «Una ficha no promete lo que no hace»: toda ruta que enseña la cortina Horizon existe en `src/app`, y los dos
 * eventos globales (Editor y Fragua) tienen su anfitrión montado en el layout raíz.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ACCIONES_CREAR, DESTINOS_PUBLICACION, LIENZO_UNIVERSAL, rutasDeLaCortina } from "../datos";

const RAIZ_APP = path.join(process.cwd(), "src/app");

/** Rutas públicas de `src/app`: sin los grupos `(x)` y sin `page.tsx`. */
function rutasDePaginas(dir = RAIZ_APP, prefijo = ""): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const completa = path.join(dir, nombre);
    if (!statSync(completa).isDirectory()) {
      if (nombre === "page.tsx") salida.push(prefijo || "/");
      continue;
    }
    const grupo = /^\(.+\)$/.test(nombre);
    salida.push(...rutasDePaginas(completa, grupo ? prefijo : `${prefijo}/${nombre}`));
  }
  return salida;
}

describe("Cortina Horizon · destinos reales", () => {
  const paginas = new Set(rutasDePaginas());

  it("cada ruta de la cortina tiene su page.tsx", () => {
    const rutas = rutasDeLaCortina();
    expect(rutas.length).toBeGreaterThanOrEqual(12);
    for (const href of rutas) {
      const sinQuery = href.split("?")[0];
      expect(paginas.has(sinQuery), `${href} no existe en src/app`).toBe(true);
    }
  });

  it("los destinos de publicación llevan area=publicar y su dest, y cada uno tiene un acento propio", () => {
    expect(DESTINOS_PUBLICACION.map((d) => d.id)).toEqual(["politica", "educacion", "cultura", "biblioteca"]);
    for (const d of DESTINOS_PUBLICACION) expect(d.href).toBe(`/crear?area=publicar&dest=${d.id}`);
    expect(new Set(DESTINOS_PUBLICACION.map((d) => d.caja)).size).toBe(4);
  });

  it("el Lienzo y las acciones no repiten id ni destino", () => {
    const todas = [LIENZO_UNIVERSAL, ...ACCIONES_CREAR];
    expect(new Set(todas.map((a) => a.id)).size).toBe(todas.length);
    const destinos = todas.map((a) => JSON.stringify(a.destino));
    expect(new Set(destinos).size).toBe(destinos.length);
  });

  it("el Editor y la Fragua tienen anfitrión global en el layout raíz", () => {
    const layout = readFileSync(path.join(RAIZ_APP, "layout.tsx"), "utf8");
    expect(layout).toContain("<GlobalEditorHost");
    expect(layout).toContain("<GlobalForgeHost");
    const comp = (f: string) => path.join(process.cwd(), "src/components/creation", f);
    expect(existsSync(comp("global-editor-host.tsx"))).toBe(true);
    expect(readFileSync(comp("global-editor-host.tsx"), "utf8")).toContain("starseed:open-editor");
    expect(readFileSync(comp("global-forge-host.tsx"), "utf8")).toContain("starseed:open-forge");
  });
});
