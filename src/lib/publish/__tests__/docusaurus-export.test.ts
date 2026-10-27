import { describe, it, expect } from "vitest";
import {
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
  escaparMd,
  slugDoc,
} from "@/lib/publish/docusaurus-export";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

const TEMAS_GUIA: readonly TemaGuia[] = [
  {
    key: "malla", titulo: "Redes mesh", cuerpo: "Tus aparatos forman una malla: {saltan} <nada>.",
    voz: "La malla une tus aparatos.", ruta: "/red-mesh", preguntaAurora: "Aurora, abre la red mesh",
    puntos: ["autovínculo", "QR o código"],
  },
  {
    key: "protomolecula", titulo: "Protomolécula", cuerpo: "Creación universal.",
    voz: "Moléculas vivas.", ruta: "/protomolecula", preguntaAurora: "Aurora, abre la Protomolécula",
    puntos: ["átomos = herramientas"],
  },
];

const NODOS_EDU: EduNode[] = [
  { id: "cat", kind: "category", name: "Ciencia", parentId: null, blurb: "Estudio del universo" },
  { id: "top", kind: "topic", name: "Física", parentId: "cat" },
  { id: "hoja", kind: "subtopic", name: "Relatividad", parentId: "top", blurb: "Espacio y tiempo" },
];

describe("docusaurus-export", () => {
  it("el front matter lleva el título entre comillas aunque tenga «:» o comillas", () => {
    const [doc] = docusaurusDesdeEntradas([{ id: "a", titulo: 'Guía: "algo"', cuerpo: "Texto" }]);
    expect(doc.content).toContain(`title: "Guía: \\"algo\\""`);
  });

  it("{x}, <script> e import x from 'y' salen escapados", () => {
    expect(escaparMd("{x}")).toBe("&#123;x&#125;");
    expect(escaparMd("<script>")).toBe("&lt;script&gt;");
    expect(escaparMd("import x from 'y'")).toBe("&#105;mport x from 'y'");
    const [doc] = docusaurusDesdeEntradas([
      { id: "a", titulo: "código", cuerpo: "{x}\n<script>\nimport x from 'y'\nexport const n = 1;" },
    ]);
    expect(doc.content).toContain("&#123;x&#125;");
    expect(doc.content).toContain("&lt;script&gt;");
    expect(doc.content).toContain("&#105;mport x from 'y'");
    expect(doc.content).toContain("&#101;xport const n = 1;");
  });

  it("dos entradas con el mismo título dan el slug -2", () => {
    const archivos = docusaurusDesdeEntradas([
      { id: "a", titulo: "Malla", cuerpo: "Uno" },
      { id: "b", titulo: "Malla", cuerpo: "Dos" },
    ]);
    expect(archivos.filter((f) => f.path !== "LEEME-DOCUSAURUS.md").map((f) => f.path)).toEqual([
      "docs/malla.md", "docs/malla-2.md",
    ]);
  });

  it("la guía da un archivo por tema, en orden, con sus puntos y «Dónde:»", () => {
    const archivos = docusaurusDesdeGuia(TEMAS_GUIA, "Guía del sistema");
    const doc1 = archivos.find((f) => f.path === "docs/guia-del-sistema/redes-mesh.md");
    expect(doc1).toBeDefined();
    expect(doc1?.content).toContain("sidebar_position: 1");
    expect(doc1?.content).toContain("- autovínculo");
    expect(doc1?.content).toContain("Dónde: /red-mesh");
    expect(doc1?.content).toContain("Pregunta a Astraura: Aurora, abre la red mesh");
    expect(doc1?.content).toContain("&#123;saltan&#125; &lt;nada&gt;");
    expect(doc1?.content).toContain('description: "La malla une tus aparatos."');
    const doc2 = archivos.find((f) => f.path === "docs/guia-del-sistema/protomolecula.md");
    expect(doc2?.content).toContain("sidebar_position: 2");
    expect(archivos.some((f) => f.path.endsWith(".mdx") || f.path.endsWith(".js"))).toBe(false);
  });

  it("un árbol de educación de 3 niveles da carpetas con _category_.json", () => {
    const archivos = docusaurusDesdeEdu(NODOS_EDU);
    const categoria = archivos.find((f) => f.path === "docs/ciencia/_category_.json");
    expect(categoria).toBeDefined();
    const estado = categoria ? JSON.parse(categoria.content) : {};
    expect(estado).toEqual({ label: "Ciencia", position: 1, collapsed: false });
    expect(archivos.some((f) => f.path === "docs/ciencia/fisica/_category_.json")).toBe(true);
    const hoja = archivos.find((f) => f.path === "docs/ciencia/fisica/relatividad.md");
    expect(hoja?.content).toContain("Espacio y tiempo");
    expect(archivos.some((f) => f.path === "LEEME-DOCUSAURUS.md")).toBe(true);
  });

  it("ninguna ruta termina en .mdx ni .js (solo .md y _category_.json)", () => {
    const archivos = [
      ...docusaurusDesdeGuia(TEMAS_GUIA, "Guía"),
      ...docusaurusDesdeEdu(NODOS_EDU),
    ];
    for (const archivo of archivos) {
      expect(archivo.path.endsWith(".mdx")).toBe(false);
      expect(archivo.path.endsWith(".js")).toBe(false);
      expect(
        archivo.path.endsWith(".md") || archivo.path.endsWith("_category_.json"),
      ).toBe(true);
    }
  });

  it("el LEEME nombra format: 'detect'", () => {
    const leeme = docusaurusDesdeEntradas([]).find((f) => f.path === "LEEME-DOCUSAURUS.md");
    expect(leeme?.content).toContain("format: 'detect'");
    expect(leeme?.content).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme?.content).toContain("NO_UPDATE_NOTIFIER=1");
  });

  it("el resultado es idéntico en dos llamadas", () => {
    const a = JSON.stringify(docusaurusDesdeGuia(TEMAS_GUIA, "Guía"));
    const b = JSON.stringify(docusaurusDesdeGuia(TEMAS_GUIA, "Guía"));
    expect(a).toBe(b);
  });

  it("slugDoc baja a minúsculas ASCII y escaparMd cubre líneas export", () => {
    expect(slugDoc("Relatividad")).toBe("relatividad");
    expect(slugDoc("Teoría de Grupos")).toBe("teoria-de-grupos");
    expect(slugDoc("")).toBe("documento");
  });
});
