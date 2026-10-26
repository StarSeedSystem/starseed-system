import { describe, it, expect } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";
import { exportarSet, FORMATO_SET, type OpcionesSet, type SetFondo } from "../sets-fondo";
import {
  CARPETA_FONDOS, MIME_SET, SUFIJO_VISTA, guardarSet, listarSets, nombreArchivoSet, nombreVistaPrevia,
  esSetGuardado, buscarCarpeta, slugFondo, type CarpetaFondo, type ItemFondo, type PuertoFondos,
} from "../fondos-biblioteca";
import type { EntityRef } from "@/lib/library/entity-library";

const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Gradients" },
  { name: "FilmGrain", category: "Textures" },
  { name: "WebcamTexture", category: "Textures" },
]);
const o: OpcionesSet = { catalogo };
const ref: EntityRef = { kind: "user", id: "u1" };
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`;

function setDe(nombre: string): SetFondo {
  const r = exportarSet({ nombre, base: "spline", capas: [], autor: "Alex", vistaPrevia: PNG },
    { ...o, crearId: () => "set-1", ahora: () => new Date("2026-10-23T10:00:00Z") });
  if (!r.ok) throw new Error(r.motivos.join(" | "));
  return r.set;
}

/** Biblioteca en memoria: el mismo contrato que el adaptador real, sin red, disco ni DOM. */
function biblioteca(): PuertoFondos & { carpetas: CarpetaFondo[]; items: ItemFondo[] } {
  const carpetas: CarpetaFondo[] = [], items: ItemFondo[] = [];
  let n = 0;
  return {
    carpetas, items,
    async listar() { return { carpetas: [...carpetas], items: [...items] }; },
    async crearCarpeta(_ref, nombre, padreId) {
      const id = `c${++n}`;
      carpetas.push({ id, nombre, padreId });
      return id;
    },
    async guardarArchivo(_ref, a) {
      const id = `i${++n}`;
      items.push({ id, titulo: a.nombre, mime: a.mime, carpetaId: a.carpetaId, contenido: a.contenido });
      return { ok: true, itemId: id };
    },
    async leerTexto(_ref, item) { return item.contenido ?? null; },
  };
}

describe("fondos-biblioteca · nombres y detección", () => {
  it("slug sin acentos, archivo con la extensión del formato y carpeta por nombre", () => {
    const set = setDe("Aurora Cristalina · ñandú");
    expect(slugFondo("Aurora Cristalina · ñandú")).toBe("aurora-cristalina-nandu");
    expect(nombreArchivoSet(set)).toBe("aurora-cristalina-nandu.starseed-fondo.json");
    expect(nombreVistaPrevia(set)).toBe(`aurora-cristalina-nandu${SUFIJO_VISTA}`);
    expect(esSetGuardado({ id: "1", titulo: "X.STARSEED-FONDO.JSON" })).toBe(true);
    expect(esSetGuardado({ id: "2", titulo: "foto.png" })).toBe(false);
    expect(buscarCarpeta([{ id: "c", nombre: "  fondos ", padreId: null }], CARPETA_FONDOS)?.id).toBe("c");
  });
});

describe("fondos-biblioteca · guardar", () => {
  it("crea «Fondos» si falta y guarda el set y su vista previa juntos", async () => {
    const b = biblioteca();
    const r = await guardarSet(ref, setDe("Aurora"), undefined, { ...o, deps: b });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(b.carpetas).toHaveLength(1);
    expect(b.carpetas[0]).toMatchObject({ nombre: CARPETA_FONDOS, padreId: null });
    expect(r.carpetaId).toBe(b.carpetas[0].id);
    expect(b.items.map((i) => i.mime)).toEqual([MIME_SET, "image/png"]);
    expect(b.items.every((i) => i.carpetaId === r.carpetaId)).toBe(true);
    expect(r.vistaPreviaId).toBe(b.items[1].id);
    expect(JSON.parse(b.items[0].contenido ?? "{}")).toMatchObject({ formato: FORMATO_SET, nombre: "Aurora" });
  });

  it("usa la carpeta elegida sin crear «Fondos» y rechaza una carpeta ajena", async () => {
    const b = biblioteca();
    b.carpetas.push({ id: "mia", nombre: "Mis cosas", padreId: null });
    const r = await guardarSet(ref, setDe("Boreal"), "mia", { ...o, deps: b });
    expect(r.ok && r.carpetaId).toBe("mia");
    expect(b.carpetas.map((c) => c.nombre)).toEqual(["Mis cosas"]);
    const malo = await guardarSet(ref, setDe("Otra"), "no-existe", { ...o, deps: b });
    expect(malo).toEqual({ ok: false, motivos: ["la carpeta elegida no existe en esta Biblioteca"] });
  });

  it("valida antes de escribir: un set corrupto no llega a la Biblioteca", async () => {
    const b = biblioteca();
    const corrupto = { ...setDe("Rota"), formato: "otra-cosa" } as unknown as SetFondo;
    const r = await guardarSet(ref, corrupto, undefined, { ...o, deps: b });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" | ")).toMatch(/formato/);
    expect(b.items).toHaveLength(0);
  });
});

describe("fondos-biblioteca · listar", () => {
  it("lee los sets guardados en cualquier carpeta e ignora lo que no es un set", async () => {
    const b = biblioteca();
    const r = await guardarSet(ref, setDe("Aurora"), undefined, { ...o, deps: b });
    expect(r.ok).toBe(true);
    b.items.push({ id: "x", titulo: "foto.png", mime: "image/png" });
    const lista = await listarSets(ref, { ...o, deps: b });
    expect(lista.rechazados).toEqual([]);
    expect(lista.sets).toHaveLength(1);
    expect(lista.sets[0].set.nombre).toBe("Aurora");
    expect(lista.sets[0].carpetaId).toBe(b.carpetas[0].id);
  });

  it("un set corrupto o ilegible se explica en rechazados, no se oculta", async () => {
    const b = biblioteca();
    await guardarSet(ref, setDe("Buena"), undefined, { ...o, deps: b });
    b.items.push({ id: "malo", titulo: "roto.starseed-fondo.json", mime: MIME_SET, carpetaId: null, contenido: '{"formato":"x"}' });
    b.items.push({ id: "ilegible", titulo: "sin-leer.starseed-fondo.json", mime: MIME_SET, carpetaId: null });
    const lista = await listarSets(ref, { ...o, deps: b });
    expect(lista.sets.map((s) => s.set.nombre)).toEqual(["Buena"]);
    expect(lista.rechazados.map((s) => s.itemId)).toEqual(["malo", "ilegible"]);
    expect(lista.rechazados[0].motivos.join(" | ")).toMatch(/formato/);
    expect(lista.rechazados[1].motivos).toEqual(["no se pudo leer el archivo del set"]);
  });
});
