import { describe, it, expect } from "vitest";
import {
  escaparMd,
  slugDoc,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
} from "../docusaurus-export";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

describe("escaparMd", () => {
  it("escapa llaves y ángulos", () => {
    const input = "{x} <script> {y}";
    const output = escaparMd(input);
    expect(output).toBe("&#123;x&#125; <script> &#123;y&#125;");
  });

  it("escapa import y export al inicio de línea", () => {
    const input = "import x from 'y'\nexport default z\n  import noEscapa";
    const output = escaparMd(input);
    expect(output).toBe("&#105;mport x from 'y'\n&#101;xport default z\n  import noEscapa");
  });

  it("escapa import en el cuerpo al inicio de línea", () => {
    const input = "Texto normal\nimport x from 'y'\nMás texto";
    const output = escaparMd(input);
    expect(output).toContain("&#105;mport x from 'y'");
  });

  it("no afecta texto normal", () => {
    const input = "Hola mundo con acentos: áéíóú";
    expect(escaparMd(input)).toBe(input);
  });
});

describe("slugDoc", () => {
  it("genera slug en minúsculas ASCII", () => {
    expect(slugDoc("Hola Mundo")).toBe("hola-mundo");
    expect(slugDoc("Guía de Inicio")).toBe("guia-de-inicio");
  });

  it("añade sufijo -2, -3 si chocan", () => {
    const usados = new Set(["hola-mundo"]);
    expect(slugDoc("Hola Mundo", usados)).toBe("hola-mundo-2");
    expect(slugDoc("Hola Mundo", usados)).toBe("hola-mundo-3");
  });

  it("maneja strings vacíos", () => {
    expect(slugDoc("")).toBe("doc");
    expect(slugDoc("   ")).toBe("doc");
  });
});

describe("docusaurusDesdeEntradas", () => {
  it("genera front matter con título entre comillas dobles aunque tenga dos puntos o comillas", () => {
    const entradas = [
      { id: "1", titulo: 'Título con "comillas" y: dos puntos', cuerpo: "Contenido", orden: 1 },
    ];
    const archivos = docusaurusDesdeEntradas(entradas);
    const doc = archivos.find((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    expect(doc).toBeDefined();
    expect(doc!.content).toContain('title: "Título con \\"comillas\\" y: dos puntos"');
  });

  it("escapa {x}, <script> e import en el cuerpo al inicio de línea", () => {
    const entradas = [
      { id: "1", titulo: "Test", cuerpo: "{x} <script>\nimport x from 'y'", orden: 1 },
    ];
    const archivos = docusaurusDesdeEntradas(entradas);
    const doc = archivos.find((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    expect(doc!.content).toContain("&#123;x&#125;");
    expect(doc!.content).toContain("<script>");
    expect(doc!.content).toContain("&#105;mport x from 'y'");
  });

  it("dos entradas con mismo título en grupos distintos no chocan", () => {
    const entradas = [
      { id: "1", titulo: "Mismo Título", cuerpo: "A", grupo: "grupo1", orden: 1 },
      { id: "2", titulo: "Mismo Título", cuerpo: "B", grupo: "grupo2", orden: 1 },
    ];
    const archivos = docusaurusDesdeEntradas(entradas);
    const docs = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    const paths = docs.map((d) => d.path).sort();
    expect(paths[0]).toContain("grupo1/mismo-titulo.md");
    expect(paths[1]).toContain("grupo2/mismo-titulo.md");
  });

  it("dos entradas con mismo título en mismo grupo generan -2", () => {
    const entradas = [
      { id: "1", titulo: "Mismo Título", cuerpo: "A", grupo: "grupo1", orden: 1 },
      { id: "2", titulo: "Mismo Título", cuerpo: "B", grupo: "grupo1", orden: 2 },
    ];
    const archivos = docusaurusDesdeEntradas(entradas);
    const docs = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    const paths = docs.map((d) => d.path);
    expect(paths.some((p) => p.includes("grupo1/mismo-titulo.md"))).toBe(true);
    expect(paths.some((p) => p.includes("grupo1/mismo-titulo-2.md"))).toBe(true);
  });

  it("respeta grupo y orden", () => {
    const entradas = [
      { id: "1", titulo: "A", cuerpo: "a", grupo: "grupo1", orden: 2 },
      { id: "2", titulo: "B", cuerpo: "b", grupo: "grupo1", orden: 1 },
    ];
    const archivos = docusaurusDesdeEntradas(entradas);
    const docs = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    const paths = docs.map((d) => d.path).sort();
    expect(paths[0]).toContain("grupo1/");
    expect(paths[1]).toContain("grupo1/");
  });

  it("incluye LEEME-DOCUSAURUS.md con format: detect", () => {
    const entradas = [{ id: "1", titulo: "Test", cuerpo: "x", orden: 1 }];
    const archivos = docusaurusDesdeEntradas(entradas);
    const leeme = archivos.find((a) => a.path === "LEEME-DOCUSAURUS.md");
    expect(leeme).toBeDefined();
    expect(leeme!.content).toContain("format: 'detect'");
    expect(leeme!.content).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme!.content).toContain("NO_UPDATE_NOTIFIER=1");
  });

  it("limita a 500 documentos y avisa en LEEME", () => {
    const entradas = Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
      titulo: `Doc ${i}`,
      cuerpo: "x",
      orden: i,
    }));
    const archivos = docusaurusDesdeEntradas(entradas);
    const docs = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    expect(docs.length).toBe(500);
    const leeme = archivos.find((a) => a.path === "LEEME-DOCUSAURUS.md");
    expect(leeme!.content).toContain("501 entradas");
    expect(leeme!.content).toContain("500");
  });

  it("recorta documentos > 200 KB y avisa", () => {
    const grande = "x".repeat(250 * 1024);
    const entradas = [{ id: "1", titulo: "Grande", cuerpo: grande, orden: 1 }];
    const archivos = docusaurusDesdeEntradas(entradas);
    const doc = archivos.find((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    expect(Buffer.byteLength(doc!.content, "utf8")).toBeLessThanOrEqual(200 * 1024);
    expect(doc!.content).toContain("Aviso:");
    expect(doc!.content).toContain("recortado");
  });

  it("resultado idéntico en dos llamadas", () => {
    const entradas = [
      { id: "1", titulo: "A", cuerpo: "a", orden: 1 },
      { id: "2", titulo: "B", cuerpo: "b", orden: 2 },
    ];
    const r1 = docusaurusDesdeEntradas(entradas);
    const r2 = docusaurusDesdeEntradas(entradas);
    expect(r1).toEqual(r2);
  });
});

describe("docusaurusDesdeGuia", () => {
  const temas: readonly TemaGuia[] = [
    {
      key: "tema1",
      titulo: "Primer Tema",
      cuerpo: "Cuerpo del primer tema",
      voz: "Voz 1",
      ruta: "/ruta1",
      preguntaAurora: "Pregunta 1",
      puntos: ["Punto A", "Punto B"],
    },
    {
      key: "tema2",
      titulo: "Segundo Tema",
      cuerpo: "Cuerpo del segundo",
      voz: "Voz 2",
      ruta: "/ruta2",
      preguntaAurora: "Pregunta 2",
      puntos: ["Punto C"],
    },
  ];

  it("genera un archivo por tema en orden dentro del grupo guia", () => {
    const archivos = docusaurusDesdeGuia(temas, "Guía");
    const docs = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    expect(docs.length).toBe(2);
    expect(docs[0].path).toContain("guia/primer-tema.md");
    expect(docs[1].path).toContain("guia/segundo-tema.md");
  });

  it("incluye puntos, Dónde: y Pregunta a Astraura:", () => {
    const archivos = docusaurusDesdeGuia(temas, "Guía");
    const doc1 = archivos.find((a) => a.path.includes("primer-tema.md"));
    expect(doc1!.content).toContain("## Puntos clave");
    expect(doc1!.content).toContain("- Punto A");
    expect(doc1!.content).toContain("- Punto B");
    expect(doc1!.content).toContain("**Dónde:** /ruta1");
    expect(doc1!.content).toContain("**Pregunta a Astraura:** Pregunta 1");
  });

  it("usa sidebar_position según orden", () => {
    const archivos = docusaurusDesdeGuia(temas, "Guía");
    const doc1 = archivos.find((a) => a.path.includes("primer-tema.md"));
    const doc2 = archivos.find((a) => a.path.includes("segundo-tema.md"));
    expect(doc1!.content).toContain("sidebar_position: 1");
    expect(doc2!.content).toContain("sidebar_position: 2");
  });
});

describe("docusaurusDesdeEdu", () => {
  const nodos: EduNode[] = [
    { id: "cat-1", kind: "category", name: "Ciencia", parentId: null, blurb: "Categoría ciencia" },
    { id: "top-1", kind: "topic", name: "Física", parentId: "cat-1", blurb: "Tema física" },
    { id: "sub-1", kind: "subtopic", name: "Mecánica", parentId: "top-1", blurb: "Subtema mecánica" },
    { id: "top-2", kind: "topic", name: "Química", parentId: "cat-1" },
    { id: "cat-2", kind: "category", name: "Arte", parentId: null, blurb: "Categoría arte" },
  ];

  it("genera carpetas con _category_.json para categorías y temas con hijos", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    const categoryFiles = archivos.filter((a) => a.path.endsWith("_category_.json"));
    expect(categoryFiles.length).toBeGreaterThanOrEqual(2);
    // Las raíces se ordenan alfabéticamente: "Arte" (pos 1), "Ciencia" (pos 2)
    const catCiencia = categoryFiles.find((a) => a.path.includes("ciencia/_category_.json"));
    expect(catCiencia).toBeDefined();
    const catJson = JSON.parse(catCiencia!.content);
    expect(catJson).toEqual({ label: "Ciencia", position: 2, collapsed: false });
  });

  it("genera _category_.json para temas con hijos (Física)", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    const categoryFiles = archivos.filter((a) => a.path.endsWith("_category_.json"));
    const catFisica = categoryFiles.find((a) => a.path.includes("fisica/_category_.json"));
    expect(catFisica).toBeDefined();
    const catJson = JSON.parse(catFisica!.content);
    expect(catJson.label).toBe("Física");
  });

  it("genera .md para nodos hoja (subtemas)", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    const mdFiles = archivos.filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"));
    const mecanica = mdFiles.find((a) => a.path.includes("mecanica.md"));
    expect(mecanica).toBeDefined();
    expect(mecanica!.content).toContain('id: "sub-1"');
    expect(mecanica!.content).toContain('title: "Mecánica"');
    expect(mecanica!.content).toContain("Subtema mecánica");
  });

  it("ninguna ruta termina en .mdx ni .js", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    for (const a of archivos) {
      expect(a.path).not.toMatch(/\.mdx$/);
      expect(a.path).not.toMatch(/\.js$/);
    }
  });

  it("incluye LEEME-DOCUSAURUS.md con format: detect", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    const leeme = archivos.find((a) => a.path === "LEEME-DOCUSAURUS.md");
    expect(leeme).toBeDefined();
    expect(leeme!.content).toContain("format: 'detect'");
  });

  it("resultado idéntico en dos llamadas", () => {
    const r1 = docusaurusDesdeEdu(nodos);
    const r2 = docusaurusDesdeEdu(nodos);
    expect(r1).toEqual(r2);
  });

  it("ordena alfabéticamente por nombre en español en cada nivel", () => {
    const nodosDesordenados: EduNode[] = [
      { id: "c1", kind: "category", name: "Zeta", parentId: null },
      { id: "c2", kind: "category", name: "Alpha", parentId: null },
      { id: "t1", kind: "topic", name: "Gamma", parentId: "c2" },
      { id: "t2", kind: "topic", name: "Beta", parentId: "c2" },
      { id: "t3", kind: "topic", name: "Delta", parentId: "c2" },
    ];
    const archivos = docusaurusDesdeEdu(nodosDesordenados);
    const mdFiles = archivos
      .filter((a) => a.path.endsWith(".md") && !a.path.includes("LEEME"))
      .map((a) => a.path);
    // Alpha (pos 1) -> Beta, Delta, Gamma (ordenados alfabéticamente)
    // Zeta (pos 2) -> (no hijos, solo _category_.json)
    expect(mdFiles.some((p) => p.includes("alpha/beta.md"))).toBe(true);
    expect(mdFiles.some((p) => p.includes("alpha/delta.md"))).toBe(true);
    expect(mdFiles.some((p) => p.includes("alpha/gamma.md"))).toBe(true);
  });
});