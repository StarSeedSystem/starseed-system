import { describe, expect, it } from "vitest";
import {
  CLAVE_DISENOS,
  DISENOS_FABRICA,
  DISENO_POR_DEFECTO,
  borrarDiseno,
  disenoPorId,
  guardarDiseno,
  listarDisenos,
  type AlmacenDisenos,
} from "@/lib/mausbot/disenos";
import { IDS_CUERPO_MAUSBOT } from "@/lib/mausbot/cuerpos";

function almacenFalso(): AlmacenDisenos & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (c) => datos.get(c) ?? null,
    setItem: (c, v) => void datos.set(c, v),
    removeItem: (c) => void datos.delete(c),
  };
}

const SVG_LIMPIO = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#007FFF"/></svg>';
const SVG_CON_SCRIPT =
  '<svg viewBox="0 0 64 64"><script>alert(1)</script><circle cx="32" cy="32" r="20" fill="#007FFF"/></svg>';

const PROPIO = {
  id: "propio-orbe",
  nombre: "Orbe de Astraura",
  cuerpo: "svg" as const,
  svgCuerpo: SVG_LIMPIO,
  gradiente: ["#66A3FF", "#007FFF", "#0052B3"] as [string, string, string],
  cara: { ojos: true, boca: true, mirada: true },
  tamano: 1,
  origen: "protomolecula" as const,
};

describe("diseños del Mausbot", () => {
  it("hay un diseño de fábrica por cada cuerpo, con ids únicos y degradado de tres colores", () => {
    expect(DISENOS_FABRICA).toHaveLength(IDS_CUERPO_MAUSBOT.length);
    expect(new Set(DISENOS_FABRICA.map((d) => d.id)).size).toBe(DISENOS_FABRICA.length);
    for (const d of DISENOS_FABRICA) {
      expect(d.origen).toBe("fabrica");
      expect(d.gradiente).toHaveLength(3);
      for (const c of d.gradiente) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(DISENO_POR_DEFECTO.id).toBe("fabrica-cursor");
  });

  it("disenoPorId cae al cursor de fábrica ante un id desconocido", () => {
    expect(disenoPorId("no-existe", almacenFalso()).id).toBe("fabrica-cursor");
    expect(disenoPorId("fabrica-star", almacenFalso()).id).toBe("fabrica-star");
  });

  it("un SVG con <script> no se guarda y devuelve el motivo", () => {
    const al = almacenFalso();
    const r = guardarDiseno({ ...PROPIO, svgCuerpo: SVG_CON_SCRIPT }, al);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("script");
    expect(listarDisenos(al)).toHaveLength(DISENOS_FABRICA.length);
    expect(al.datos.has(CLAVE_DISENOS)).toBe(false);
  });

  it("un SVG limpio se sanea, se guarda y se lista entre los diseños", () => {
    const al = almacenFalso();
    const r = guardarDiseno(PROPIO, al);
    expect(r.ok).toBe(true);
    expect(listarDisenos(al)).toHaveLength(DISENOS_FABRICA.length + 1);
    const propio = disenoPorId("propio-orbe", al);
    expect(propio.nombre).toBe("Orbe de Astraura");
    expect(propio.svgCuerpo).not.toContain("script");
    expect(guardarDiseno({ ...PROPIO, nombre: "Orbe v2" }, al).ok).toBe(true);
    expect(listarDisenos(al).filter((d) => d.id === "propio-orbe")).toHaveLength(1);
  });

  it("los diseños de fábrica no se pueden borrar ni sobrescribir, y los propios sí", () => {
    const al = almacenFalso();
    expect(borrarDiseno("fabrica-cursor", al).ok).toBe(false);
    expect(guardarDiseno({ ...PROPIO, id: "fabrica-cursor" }, al).ok).toBe(false);
    expect(guardarDiseno(PROPIO, al).ok).toBe(true);
    expect(borrarDiseno("propio-orbe", al).ok).toBe(true);
    expect(disenoPorId("propio-orbe", al).id).toBe("fabrica-cursor");
    expect(borrarDiseno("propio-orbe", al).ok).toBe(false);
  });
});
