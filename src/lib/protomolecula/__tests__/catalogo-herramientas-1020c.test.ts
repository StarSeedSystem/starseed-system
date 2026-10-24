import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  aPaqueteBiblioteca,
  herramientaPorId,
} from "../catalogo-herramientas";

/** Las cuatro fichas que pide la 3.ª tanda (Ola 1020T). */
const IDS_1020C = ["excalidraw", "penpot", "img2threejs", "supra-tex"] as const;

const FUENTES = ["github-releases", "github-tags", "npm", "pypi", "flathub", "web"];

describe("3.ª tanda 1020T: fichas de diseño", () => {
  it("las cuatro fichas están en el catálogo y no se duplican", () => {
    for (const id of IDS_1020C) {
      const fichas = CATALOGO_PROTOMOLECULA.filter((h) => h.id === id);
      expect(fichas, id).toHaveLength(1);
    }
  });

  it.each(IDS_1020C)("%s trae licencia, fuente de versión y motivo", (id) => {
    const h = herramientaPorId(id);
    expect(h, id).toBeDefined();
    if (!h) return;
    expect(h.licencia.trim().length, id).toBeGreaterThan(0);
    expect(FUENTES, id).toContain(h.actualizacion.fuente);
    expect(h.actualizacion.ref.trim().length, id).toBeGreaterThan(0);
    expect(h.motivo.trim().length, id).toBeGreaterThan(20);
    expect(h.verificado, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Excalidraw es MIT, componente React y dice que aún no está montada", () => {
    const h = herramientaPorId("excalidraw");
    expect(h?.licencia).toBe("MIT");
    expect(h?.codigo).toBe("https://github.com/excalidraw/excalidraw");
    expect(h?.actualizacion).toMatchObject({ fuente: "npm", ref: "@excalidraw/excalidraw" });
    expect(h?.motivo).toMatch(/aún no está montado|integración en curso/i);
    expect((h?.avisos ?? []).join(" ")).toMatch(/no corre en ninguna pantalla/i);
  });

  it("Penpot es MPL-2.0 con conector autoalojado y MCP", () => {
    const h = herramientaPorId("penpot");
    expect(h?.licencia).toBe("MPL-2.0");
    expect(h?.integracion).toBe("servidor-remoto");
    expect(h?.control.via).toContain("mcp");
    expect(h?.motivo).toMatch(/autoalojado/i);
    expect(h?.motivo).toMatch(/MCP/);
  });

  it("img2threejs es Apache-2.0 y convierte imágenes en three.js para agentes", () => {
    const h = herramientaPorId("img2threejs");
    expect(h?.licencia).toBe("Apache-2.0");
    expect(h?.actualizacion.fuente).toBe("github-releases");
    expect(h?.actualizacion.ref).toBe("img2threejs/img2threejs");
    expect(h?.descripcion).toMatch(/three\.js/i);
    expect(h?.ia).toContain("skill-agentes");
    expect(h?.estado).toBe("integrable");
  });

  it("SUPRA-Tex es NO comercial y no publica código", () => {
    const h = herramientaPorId("supra-tex");
    expect(h?.codigo).toBeNull();
    expect(h?.estado).toBe("solo-enlace");
    expect(h?.licencia).toMatch(/NO comercial/i);
    expect(h?.licenciaPesos).toMatch(/NO comercial/i);
    expect(h?.licenciaPesos).toMatch(/Qwen Research/i);
    expect(`${h?.descripcion} ${h?.motivo}`).toMatch(/código de inferencia.*sin publicar|no está publicado/i);
    expect(aPaqueteBiblioteca(h!).comingSoon).toBe(true);
  });
});
