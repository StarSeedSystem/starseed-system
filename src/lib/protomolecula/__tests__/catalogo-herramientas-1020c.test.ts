import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  FECHA_VERIFICACION_PROTOMOLECULA,
  herramientaPorId,
} from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/** Las cuatro fichas de la 3.ª tanda (RLB1020N). */
const IDS_1020C = ["excalidraw", "penpot", "img2threejs", "supra-tex"] as const;

const FUENTES = ["github-releases", "github-tags", "npm", "pypi", "flathub", "web"];

const ficha = (id: string): HerramientaProto => {
  const h = herramientaPorId(id);
  expect(h, `falta la ficha ${id}`).toBeDefined();
  return h as HerramientaProto;
};

describe("fichas 1020c · catálogo de la Protomolécula", () => {
  it.each(IDS_1020C)("%s está presente, con licencia, descripción y fuente real", (id) => {
    const h = ficha(id);
    expect(h.id).toBe(id);
    expect(h.nombre.trim().length).toBeGreaterThan(0);
    expect(h.licencia.trim().length).toBeGreaterThan(0);
    expect(h.descripcion.trim().length).toBeGreaterThan(30);
    expect(h.actualizacion.ref.trim().length).toBeGreaterThan(0);
    expect(FUENTES).toContain(h.actualizacion.fuente);
    expect(h.verificado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("las cuatro fichas están en el catálogo publicado", () => {
    const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);
    for (const id of IDS_1020C) expect(ids, id).toContain(id);
    expect(FECHA_VERIFICACION_PROTOMOLECULA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Excalidraw: MIT, componente de React y dicha la verdad de que aún no está montada", () => {
    const h = ficha("excalidraw");
    expect(h.licencia).toBe("MIT");
    expect(h.actualizacion.fuente).toBe("npm");
    expect(h.actualizacion.ref).toBe("@excalidraw/excalidraw");
    expect(h.descripcion).toMatch(/React/i);
    expect(h.motivo).toMatch(/aún no está montada/i);
    expect(h.motivo).toMatch(/integración está EN CURSO/i);
  });

  it("Penpot: MPL-2.0, conector autoalojado y servidor MCP oficial", () => {
    const h = ficha("penpot");
    expect(h.licencia).toBe("MPL-2.0");
    expect(h.actualizacion.fuente).toBe("github-releases");
    expect(h.integracion).toBe("servidor-remoto");
    expect(h.control.via).toContain("http");
    expect(h.control.via).toContain("mcp");
    expect(`${h.descripcion} ${h.control.notas}`).toMatch(/autoaloj|MCP/i);
  });

  it("img2threejs: Apache-2.0 y descrito como skill para agentes, no como integración ya viva", () => {
    const h = ficha("img2threejs");
    expect(h.licencia).toBe("Apache-2.0");
    expect(h.codigo).toBe("https://github.com/img2threejs/img2threejs");
    expect(h.descripcion).toMatch(/skill para agentes/i);
    expect(h.descripcion).toMatch(/three\.js/i);
    expect(h.motivo).toMatch(/no hay átomo automático montado/i);
  });

  it("SUPRA-Tex: no comercial, sin código publicado y solo enlace", () => {
    const h = ficha("supra-tex");
    expect(h.licencia).toMatch(/no comercial|noncommercial/i);
    expect(h.licenciaPesos ?? "").toMatch(/no comercial|noncommercial/i);
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.descripcion).toMatch(/código de inferencia aún no se ha publicado/i);
    expect((h.sinComprobar ?? []).join(" ")).toMatch(/código de inferencia/i);
    expect((h.avisos ?? []).join(" ")).toMatch(/NO comercial/i);
  });
});
