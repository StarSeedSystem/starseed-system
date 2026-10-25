import { describe, it, expect } from "vitest";
import {
  escaparMd,
  slugDoc,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
  type ArchivoDocs,
} from "@/lib/publish/docusaurus-export";
import { TEMAS_SISTEMA } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

const porRuta = (archivos: ArchivoDocs[], ruta: string) =>
  archivos.find((a) => a.path === ruta)?.content ?? "";

const rutasMd = (archivos: ArchivoDocs[]) =>
  archivos.filter((a) => a.path.startsWith("docs/") && a.path.endsWith(".md"));

describe("escaparMd y slugDoc", () => {
  it("convierte llaves y ángulos en entidades", () => {
    expect(escaparMd("{x} <script> y > z")).toBe("&#123;x&#125; &lt;script&gt; y &gt; z");
  });

  it("rompe el código al inicio de línea import y export", () => {
    const texto = escaparMd("import x from 'y'\nexport default y");
    expect(texto).toBe("&#105;mport x from 'y'\n&#101;xport default y");
  });

  it("hace slugs en minúsculas ASCII y sin acentos", () => {
    expect(slugDoc("Guía de Física: Nivel 2")).toBe("guia-de-fisica-nivel-2");
    expect(slugDoc("   ")).toBe("doc");
  });
});

describe("docusaurusDesdeEntradas", () => {
  it("cita el título del front matter aunque lleve dos puntos y comillas", () => {
    const titulo = 'Mi "guía": paso 1';
    const [doc] = docusaurusDesdeEntradas([{ id: "a", titulo, cuerpo: "Hola" }]);
    expect(doc.content).toContain(`title: ${JSON.stringify(titulo)}`);
    expect(doc.content).toContain(`id: "a"`);
  });

  it("escapa el cuerpo para que no sea código ni MDX", () => {
    const [doc] = docusaurusDesdeEntradas([
      { id: "a", titulo: "Escapes", cuerpo: "{x}, <script>\nimport x from 'y'" },
    ]);
    expect(doc.content).toContain("&#123;x&#125;");
    expect(doc.content).toContain("&lt;script&gt;");
    expect(doc.content).toContain("&#105;mport x");
  });

  it("resuelve títulos repetidos con sufijo -2 y nunca genera .mdx ni .js", () => {
    const archivos = docusaurusDesdeEntradas([
      { id: "a", titulo: "Igual", cuerpo: "Uno" },
      { id: "b", titulo: "Igual", cuerpo: "Dos" },
    ]);
    const rutas = rutasMd(archivos).map((a) => a.path);
    expect(rutas).toEqual(["docs/igual.md", "docs/igual-2.md"]);
    expect(archivos.every((a) => !/\.(mdx|js|ts)$/.test(a.path))).toBe(true);
  });

  it("agrupa, ordena y añade LEEME con los pasos manuales", () => {
    const archivos = docusaurusDesdeEntradas([
      { id: "b", titulo: "Segundo", cuerpo: "B", grupo: "Guías", orden: 2 },
      { id: "a", titulo: "Primero", cuerpo: "A", grupo: "Guías", orden: 1 },
    ]);
    expect(archivos.map((a) => a.path)).toContain("docs/guias/_category_.json");
    const categoria = JSON.parse(porRuta(archivos, "docs/guias/_category_.json"));
    expect(categoria).toEqual({ label: "Guías", position: 1, collapsed: false });
    expect(porRuta(archivos, "docs/guias/primero.md")).toContain("sidebar_position: 1");
    const leeme = porRuta(archivos, "LEEME-DOCUSAURUS.md");
    expect(leeme).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme).toContain("format: 'detect'");
    expect(leeme).toContain("NO_UPDATE_NOTIFIER=1");
  });

  it("es determinista: dos llamadas dan exactamente lo mismo", () => {
    const entradas = [
      { id: "a", titulo: "Uno", cuerpo: "<b>{x}</b>" },
      { id: "b", titulo: "Dos", cuerpo: "export default 1", grupo: "Grupo" },
    ];
    expect(docusaurusDesdeEntradas(entradas)).toEqual(docusaurusDesdeEntradas(entradas));
  });
});

describe("docusaurusDesdeGuia", () => {
  it("da un archivo por tema, en orden, con puntos y Dónde", () => {
    const archivos = docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía del sistema");
    const docs = rutasMd(archivos);
    expect(docs).toHaveLength(TEMAS_SISTEMA.length);
    docs.forEach((doc, i) => {
      const tema = TEMAS_SISTEMA[i];
      expect(doc.content).toContain(`title: ${JSON.stringify(tema.titulo)}`);
      expect(doc.content).toContain(`Dónde: ${tema.ruta}`);
      expect(doc.content).toContain(`Pregunta a Astraura: ${tema.preguntaAurora}`);
      expect(doc.content).toContain(`- ${tema.puntos[0]}`);
      expect(doc.content).toContain(`sidebar_position: ${i + 1}`);
    });
  });
});

describe("docusaurusDesdeEdu", () => {
  const nodos: EduNode[] = [
    { id: "cat", kind: "category", name: "Ciencia", blurb: "Categoría raíz.", parentId: null },
    { id: "top", kind: "topic", name: "Física", blurb: "Tema con hijos.", parentId: "cat" },
    { id: "sub", kind: "subtopic", name: "Mecánica Clásica", blurb: "Subtema.", parentId: "top" },
  ];

  it("crea carpetas con _category_.json hasta tres niveles y un .md por nodo", () => {
    const archivos = docusaurusDesdeEdu(nodos);
    expect(archivos.map((a) => a.path)).toEqual([
      "docs/ciencia/_category_.json",
      "docs/ciencia/ciencia.md",
      "docs/ciencia/fisica/_category_.json",
      "docs/ciencia/fisica/fisica.md",
      "docs/ciencia/fisica/mecanica-clasica.md",
      "LEEME-DOCUSAURUS.md",
    ]);
    expect(porRuta(archivos, "docs/ciencia/fisica/mecanica-clasica.md")).toContain("Subtema.");
    expect(JSON.parse(porRuta(archivos, "docs/ciencia/fisica/_category_.json"))).toEqual({
      label: "Física",
      position: 1,
      collapsed: false,
    });
  });
});
