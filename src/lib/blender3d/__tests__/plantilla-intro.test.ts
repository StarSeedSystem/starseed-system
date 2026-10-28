import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vocabulario from "../vocabulario.json";
import { estimarCoste, validarTrabajo } from "../trabajo";
import type { Trabajo3D } from "../trabajo";

type Parametro = { t: string; v?: unknown[] };
type Definicion = { params: Record<string, Parametro> };
type Vocabulario = { topes: Record<string, number>; operaciones: Record<string, Definicion>; salidas: Record<string, Definicion> };

const PLANTILLA = "../../../../servicios/blender-3d/plantillas/intro-logo-facetado.json";
const SKILL = "../../../../.agent/skills/claude-video-studio/STARSEED.md";
const V = vocabulario as unknown as Vocabulario;
const leer = (ruta: string): string => readFileSync(new URL(ruta, import.meta.url), "utf8");
const bruto: unknown = (() => { try { return JSON.parse(leer(PLANTILLA)); } catch { return null; } })();

const trabajo = (): Trabajo3D => {
  const r = validarTrabajo(bruto);
  expect(r.ok, r.ok ? "" : r.motivos.join(" · ")).toBe(true);
  return (r as { ok: true; trabajo: Trabajo3D }).trabajo;
};

const textos = (valor: unknown, salida: string[] = []): string[] => {
  if (typeof valor === "string") salida.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textos(v, salida);
  else if (typeof valor === "object" && valor !== null) for (const v of Object.values(valor)) textos(v, salida);
  return salida;
};

describe("plantilla de intro con logo facetado", () => {
  it("es un Trabajo3D v1 válido del Estudio para una persona", () => {
    const t = trabajo();
    expect(t.v).toBe(1);
    expect(t.origen).toBe("estudio");
    expect(t.quien).toBe("persona");
    expect(t.ambito).toBe("personal");
    expect(t.calidad).toBe("borrador");
    expect(t.escena[0]).toMatchObject({ op: "importar", archivo: "logo.svg", nombre: "Logo" });
    expect(t.escena.some((o) => o.op === "material")).toBe(true);
    expect(t.escena.filter((o) => o.op === "modificador" && (o.tipo === "solidificar" || o.tipo === "bisel"))).toHaveLength(2);
  });

  it("estimarCoste cabe en el perfil ligero", () => {
    const t = trabajo();
    const coste = estimarCoste(t);
    expect(coste.segundos).toBeLessThanOrEqual(V.topes.segundos);
    expect(coste.vertices).toBeLessThanOrEqual(V.topes.vertices);
    const renders = t.salidas.filter((s) => s.tipo.startsWith("render_"));
    expect(renders.length).toBeGreaterThanOrEqual(2);
    for (const s of renders) {
      expect(Number(s.ancho)).toBeLessThanOrEqual(1280);
      expect(Number(s.alto)).toBeLessThanOrEqual(720);
      expect(Number(s.muestras)).toBeLessThanOrEqual(64);
      const fotogramas = s.tipo === "render_mp4" ? Number(s.hasta) - Number(s.desde) + 1 : 1;
      expect(fotogramas).toBeLessThanOrEqual(120);
    }
  });

  it("no contiene rutas absolutas ni ..", () => {
    for (const texto of textos(bruto)) {
      expect(texto.startsWith("/")).toBe(false);
      expect(texto.includes("..")).toBe(false);
      expect(/^[A-Za-z]:[\\/]/.test(texto)).toBe(false);
    }
  });

  it("todas las op y tipo existen en el vocabulario", () => {
    const t = trabajo();
    for (const op of t.escena) {
      const def = V.operaciones[op.op];
      expect(def, `operación desconocida: ${op.op}`).toBeDefined();
      if (def && typeof op.tipo === "string") {
        const permitidos = def.params.tipo?.v ?? [];
        expect(permitidos, `tipo no declarado en ${op.op}: ${op.tipo}`).toContain(op.tipo);
      }
    }
    for (const salida of t.salidas) {
      const def = V.salidas[salida.tipo];
      expect(def, `salida desconocida: ${salida.tipo}`).toBeDefined();
      const permitidos = def?.params.motor?.v;
      if (permitidos) expect(permitidos, `motor no permitido: ${String(salida.motor)}`).toContain(salida.motor);
    }
  });

  it("STARSEED.md tiene la sección de escenas 3D con Blender", () => {
    const skill = leer(SKILL);
    expect(skill).toContain("## 7. Escenas 3D con Blender");
    expect(skill).toContain("POST /api/3d/trabajos");
    expect(skill).toContain("próximamente: ninguna de tus neuronas tiene Blender");
    expect(skill).toContain("servicios/blender-3d/plantillas/");
  });
});
