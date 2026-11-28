import { describe, expect, it } from "vitest";
import type { AlcanceNodo, Grafo4D, Nodo } from "../modelo";
import type { ConsultaDestinos, Convertido } from "@/lib/conversion/cliente";
import { anadirRama, crearEstadoEdicion, deshacer, moverRama, puedeEditar, vincularNodos, type EditorRamas } from "../edicion";
import { destinosTransmutables, evaluarDestino, transmutarRama, type ServicioConversion } from "../transmutar";

function nodo(id: string, dueno: string, alcance: AlcanceNodo, formato = "texto"): Nodo {
  return {
    id, tipo: "archivo", titulo: `Nodo ${id}`, formato, ref: `/${id}`, alcance, dueno,
    capas: ["educacion"], t_creado: 1000, t_actividad: 1000, peso: 1, etiquetas: [],
  };
}

function estado(...nodos: Nodo[]) {
  const grafo: Grafo4D = { nodos: new Map(nodos.map((n) => [n.id, n])), aristas: [], ramas: new Map() };
  return crearEstadoEdicion(grafo);
}

const yo: EditorRamas = { id: "yo" };

describe("permisos de edición", () => {
  it("solo edita lo propio o lo de un grupo del que se tiene permiso", () => {
    expect(puedeEditar(nodo("a", "yo", "privado"), yo)).toBe(true);
    expect(puedeEditar(nodo("b", "ajeno", "publico"), yo)).toBe(false);
    expect(puedeEditar(nodo("c", "ajeno", "privado"), yo)).toBe(false);
    const g = nodo("g", "g-a", "grupo");
    expect(puedeEditar(g, { ...yo, grupos: ["g-a"] })).toBe(false);
    expect(puedeEditar(g, { ...yo, grupos: ["g-a"], puedeEditarEn: new Set(["g-a"]) })).toBe(true);
  });
});

describe("ramas de cualquier formato", () => {
  it("la hija hereda dueño y alcance, se vincula y se deshace sin tocar el original", () => {
    const inicial = estado(nodo("raiz", "yo", "publico"));
    const s = anadirRama(inicial, "raiz", {
      id: "hija", titulo: "Lección 1", formato: "video", tipo: "leccion", ref: "/ramas/leccion-1",
    }, yo, 2000);
    expect(s.error).toBeUndefined();
    expect(s.grafo.nodos.get("hija")).toMatchObject({ dueno: "yo", alcance: "publico", formato: "video" });
    expect(s.grafo.ramas.get("raiz")).toEqual(["hija"]);
    expect(s.grafo.aristas).toContainEqual({ de: "raiz", a: "hija", tipo: "contiene", t: 2000, intensidad: 1 });
    expect(inicial.grafo.nodos.has("hija")).toBe(false);
    expect(deshacer(s).grafo.nodos.has("hija")).toBe(false);
  });

  it("el grupo solo se edita con permiso y la referencia nunca es contenido", () => {
    const g = estado(nodo("g", "g-a", "grupo"));
    const miembro = { ...yo, grupos: ["g-a"], puedeEditarEn: new Set(["g-a"]) };
    const mal = anadirRama(g, "g", { id: "x", titulo: "X", formato: "nota", ref: "contenido privado" }, miembro, 1);
    expect(mal.error).toMatch(/referencia/);
    expect(mal.grafo.nodos.size).toBe(1);
    const bien = anadirRama(g, "g", {
      id: "x", titulo: "X", formato: "nota", ref: "/ramas/x",
    }, miembro, 1);
    expect(bien.error).toBeUndefined();
    expect(bien.grafo.nodos.get("x")?.dueno).toBe("g-a");
  });
});

describe("vínculos, movimientos y deshacer", () => {
  it("vincula con tipo, no repite, mueve sin ciclos y deshace los dos pasos", () => {
    const base = estado(nodo("a", "yo", "privado"), nodo("b", "yo", "privado"));
    base.grafo.ramas.set("a", ["b"]);
    const v = vincularNodos(base, "a", "b", "prerrequisito", yo, 5);
    expect(v.grafo.aristas).toHaveLength(1);
    expect(vincularNodos(v, "a", "b", "prerrequisito", yo, 6).error).toMatch(/ya están/);
    expect(moverRama(v, "b", "a", yo, 7).error).toBeUndefined();
    expect(moverRama(v, "a", "b", yo, 8).error).toMatch(/dentro de ella/);
    expect(deshacer(deshacer(v)).grafo.aristas).toHaveLength(0);
    expect(deshacer(crearEstadoEdicion(base.grafo)).error).toMatch(/nada que deshacer/);
  });

  it("no vincula con un nodo ajeno aunque sea público", () => {
    const s = estado(nodo("a", "yo", "privado"), nodo("b", "ajeno", "publico"));
    expect(vincularNodos(s, "a", "b", "cita", yo).error).toMatch(/puedas editar/);
  });
});

const consulta: ConsultaDestinos = {
  disponible: true, version: "2.0.0",
  destinos: { nombre: "Markdown", ids: ["md"], destinos: ["pdf", "docx"], conMotor: [] },
};
const convertido: Convertido = { blob: new Blob(["pdf"]), nombre: "apunte.pdf", salidas: 1, motor: "filee", ms: 1 };
const servicio: ServicioConversion = { consultar: async () => consulta, convertir: async () => convertido };

describe("transmutación simulada", () => {
  it("ofrece solo destinos posibles y explica el formato imposible", () => {
    expect(destinosTransmutables(consulta, "md")).toEqual(["pdf", "docx"]);
    expect(evaluarDestino(consulta, "md", "pdf").ok).toBe(true);
    expect(evaluarDestino(consulta, "md", "xyz").motivo).toMatch(/No se puede convertir/);
    const sin: ConsultaDestinos = { disponible: false, version: null, destinos: null, motivo: "Filee no está instalado." };
    expect(evaluarDestino(sin, "md", "pdf").motivo).toBe("Filee no está instalado.");
  });

  it("cuelga la forma convertida como hermana con arista transmuta y un solo deshacer", async () => {
    const base = estado(nodo("raiz", "yo", "publico"), nodo("md", "yo", "publico", "md"));
    base.grafo.ramas.set("raiz", ["md"]);
    const r = await transmutarRama(base, "md", "pdf", {
      servicio, archivo: new Blob(["md"]), nombre: "apunte.md", refNueva: "/ramas/apunte-pdf", editor: yo, t: 42,
    });
    expect(r.error).toBeUndefined();
    expect(r.grafo.ramas.get("raiz")).toContain("md-pdf-42");
    expect(r.grafo.aristas).toContainEqual({ de: "md", a: "md-pdf-42", tipo: "transmuta", t: 42, intensidad: 1 });
    expect(r.grafo.nodos.get("md-pdf-42")).toMatchObject({ formato: "pdf", ref: "/ramas/apunte-pdf" });
    expect(deshacer(r).grafo.nodos.has("md-pdf-42")).toBe(false);
  });

  it("si no se puede convertir, lo dice y no inventa la rama", async () => {
    const base = estado(nodo("raiz", "yo", "publico"), nodo("md", "yo", "publico", "md"));
    base.grafo.ramas.set("raiz", ["md"]);
    const sin: ConsultaDestinos = { disponible: false, version: null, destinos: null, motivo: "Sin conversor." };
    const r = await transmutarRama(base, "md", "pdf", {
      servicio: { ...servicio, consultar: async () => sin }, archivo: new Blob(["md"]),
      nombre: "a.md", refNueva: "/ramas/a.pdf", editor: yo,
    });
    expect(r.error).toBe("Sin conversor.");
    expect(r.grafo.nodos.size).toBe(2);
  });
});
