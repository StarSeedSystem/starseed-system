import { describe, it, expect } from "vitest";
import { seccionesOssu, cursosDeNodo, nodosConOssu, buscarEnOssu, itinerarioOssu } from "@/lib/education/ossu";
import { BUILTIN_NODES } from "@/lib/education/curriculum";

describe("educacion-ossu", () => {
  it("tiene 63 cursos y 15 secciones", () => {
    const secs = seccionesOssu();
    expect(secs.length).toBe(15);
    const allCursos = secs.flatMap(s => s.cursos);
    expect(new Set(allCursos).size).toBe(63);
  });

  it("todos los nodos existen en BUILTIN_NODES", () => {
    const ids = new Set(BUILTIN_NODES.map(n => n.id));
    const nodos = nodosConOssu();
    for (const n of nodos) {
      expect(ids.has(n)).toBe(true);
    }
  });

  it("ids únicos y parentId existe", () => {
    const ids = BUILTIN_NODES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const idSet = new Set(ids);
    for (const n of BUILTIN_NODES) {
      if (n.parentId) {
        expect(idSet.has(n.parentId)).toBe(true);
      }
    }
  });

  it("todas las URLs son https", () => {
    const { cursos } = require("../../../config/educacion-ossu.json");
    for (const c of cursos) {
      expect(c.url.startsWith("https://")).toBe(true);
    }
  });

  it("itinerario tiene una sección por sección OSSU y recursos con URL", () => {
    const it = itinerarioOssu();
    expect(it.sections.length).toBe(15);
    for (const s of it.sections) {
      expect(Array.isArray(s.resources)).toBe(true);
      for (const r of s.resources ?? []) {
        expect(r.url).toBeDefined();
        expect(r.url?.startsWith("https://")).toBe(true);
      }
    }
  });

  it("buscarEnOssu devuelve cursos de seguridad", () => {
    const res = buscarEnOssu("seguridad");
    expect(res.length).toBeGreaterThan(0);
    const nombres = res.map(r => r.nombre.toLowerCase());
    expect(nombres.some(n => n.includes("security") || n.includes("seguridad"))).toBe(true);
  });
});
