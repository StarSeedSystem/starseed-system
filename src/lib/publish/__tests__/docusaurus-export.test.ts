/**
 * Pruebas del exportador Docusaurus (DSN1025F): Markdown puro, determinista,
 * sin red ni disco; solo funciones puras exportadas del módulo.
 */

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
import type { EduNode, EduNodeKind } from "@/lib/education/curriculum";

const mds = (salida: ArchivoDocs[]) =>
  salida.filter((d) => d.path.endsWith(".md") && d.path !== "LEEME-DOCUSAURUS.md");

const leeme = (salida: ArchivoDocs[]) => salida.find((d) => d.path === "LEEME-DOCUSAURUS.md");

const nodoEdu = (
  id: string,
  name: string,
  parentId: string | null,
  kind: EduNodeKind = "category",
  blurb?: string,
): EduNode => ({ id, kind, name, parentId, blurb });

describe("escaparMd", () => {
  it("escapa llaves, ángulos y la primera letra de líneas import/export", () => {
    const r = escaparMd("{x} <script>\nimport x from 'y'\nexport const z = 1");
    expect(r).toContain("&#123;x&#125;");
    expect(r).toContain("&lt;script&gt;");
    expect(r).toContain("&#105;mport x from 'y'");
    expect(r).toContain("&#101;xport const z = 1");
  });
});

describe("slugDoc", () => {
  it("queda en minúsculas ASCII sin acentos ni signos", () => {
    expect(slugDoc("Árbol de la Vida!")).toBe("arbol-de-la-vida");
  });
});

describe("docusaurusDesdeGuia", () => {
  it("un archivo por tema, en orden, con sus puntos y «Dónde:»", () => {
    const salida = docusaurusDesdeGuia(TEMAS_SISTEMA, "Introducción al sistema");
    const documentos = mds(salida);
    expect(documentos.length).toBe(TEMAS_SISTEMA.length);
    expect(documentos[0].path).toBe("docs/introduccion-al-sistema/protomolecula.md");
    expect(salida.some((d) => d.path === "docs/introduccion-al-sistema/_category_.json")).toBe(true);
    expect(documentos[0].content).toContain(`title: "${TEMAS_SISTEMA[0].titulo}"`);
    expect(documentos[0].content).toContain("sidebar_position: 1");
    expect(documentos[1].content).toContain("sidebar_position: 2");
    expect(documentos[0].content).toContain("- orbe 4D de geometría sagrada");
    expect(documentos[0].content).toContain("Dónde: /protomolecula");
    expect(documentos[0].content).toContain("Pregunta a Astraura: Aurora, abre la Protomolécula");
  });
});

describe("docusaurusDesdeEdu", () => {
  const arbol: EduNode[] = [
    nodoEdu("c1", "Ciencia", null, "category", "Estudio del universo."),
    nodoEdu("t1", "Física", "c1", "topic", "Cuerpos y fuerzas."),
    nodoEdu("s1", "Mecánica Clásica", "t1", "subtopic"),
  ];

  it("un árbol de 3 niveles da carpetas con _category_.json y .md por nodo", () => {
    const salida = docusaurusDesdeEdu(arbol);
    const rutas = salida.map((d) => d.path);
    expect(rutas).toContain("docs/ciencia/_category_.json");
    expect(rutas).toContain("docs/ciencia/fisica/_category_.json");
    expect(rutas).toContain("docs/ciencia/ciencia.md");
    expect(rutas).toContain("docs/ciencia/fisica/fisica.md");
    expect(rutas).toContain("docs/ciencia/fisica/mecanica-clasica.md");
  });

  it("cada nodo es un .md con su blurb (y sin él, se lo dice honesto)", () => {
    const salida = docusaurusDesdeEdu(arbol);
    const fisica = salida.find((d) => d.path === "docs/ciencia/fisica/fisica.md");
    expect(fisica?.content).toContain("Cuerpos y fuerzas.");
    const mecanica = salida.find((d) => d.path === "docs/ciencia/fisica/mecanica-clasica.md");
    expect(mecanica?.content).toContain("Este nodo todavía no tiene una descripción escrita.");
    const categoria = salida.find((d) => d.path === "docs/ciencia/_category_.json");
    expect(categoria?.content).toContain('"label": "Ciencia"');
    expect(categoria?.content).toContain('"collapsed": false');
  });
});

describe("docusaurusDesdeEntradas: front matter y escapado", () => {
  const salida = docusaurusDesdeEntradas([
    {
      id: "red-seed",
      titulo: 'Guía: "semilla" de la red',
      cuerpo: "Hola <b>mundo</b> {x}.\n\nimport x from 'y'",
      descripcion: "Resumen de la guía",
    },
  ]);
  const doc = mds(salida)[0].content;

  it("el título del front matter va entre comillas aunque tenga «:» o comillas", () => {
    expect(doc).toContain('title: "Guía: \\"semilla\\" de la red"');
    expect(doc).toContain('description: "Resumen de la guía"');
    expect(doc).toContain('id: "red-seed"');
  });

  it("{x}, <script> e import x from 'y' salen escapados en el cuerpo", () => {
    expect(doc).toContain("Hola &lt;b&gt;mundo&lt;/b&gt; &#123;x&#125;.");
    expect(doc).toContain("&#105;mport x from 'y'");
  });
});

describe("docusaurusDesdeEntradas: colisiones, topes y determinismo", () => {
  it("dos entradas con el mismo título en la misma carpeta acaban en -2", () => {
    const rutas = mds(
      docusaurusDesdeEntradas([
        { id: "a", titulo: "Guía", cuerpo: "una" },
        { id: "b", titulo: "Guía", cuerpo: "dos" },
      ]),
    ).map((d) => d.path);
    expect(rutas).toContain("docs/guia.md");
    expect(rutas).toContain("docs/guia-2.md");
  });

  it("ninguna ruta acaba en .mdx ni .js (ni de .md llega un ejecutable)", () => {
    const salida = docusaurusDesdeEntradas([
      { id: "a", titulo: "Redes mesh", cuerpo: "texto", grupo: "Documentación" },
    ]);
    for (const d of salida) {
      expect(d.path.endsWith(".mdx")).toBe(false);
      expect(d.path.endsWith(".js")).toBe(false);
    }
  });

  it("más de 500 documentos: se recorta y el LEEME lo avisa", () => {
    const lote = Array.from({ length: 503 }, (_, i) => ({ id: `s${i}`, titulo: `Doc ${i}`, cuerpo: "x" }));
    const salida = docusaurusDesdeEntradas(lote);
    expect(salida.filter((d) => d.path.startsWith("docs/") && d.path.endsWith(".md")).length).toBe(500);
    expect(leeme(salida)?.content).toContain("Se omitieron 3 documentos");
  });

  it("un cuerpo mayor de 200 KB se recorta y el LEEME lo lista", () => {
    const salida = docusaurusDesdeEntradas([{ id: "g", titulo: "Grande", cuerpo: "x".repeat(250_000) }]);
    const grande = salida.find((d) => d.path === "docs/grande.md");
    expect(grande && new TextEncoder().encode(grande.content).length < 250_000).toBe(true);
    expect(leeme(salida)?.content).toContain("Recortados al tope de 200 KB por documento: Grande");
  });

  it("el resultado es idéntico en dos llamadas", () => {
    const entradas = [
      { id: "a", titulo: "Energía renovable", cuerpo: "Detalle.", grupo: "Ecología", orden: 2 },
      { id: "b", titulo: "Onda sísmica", cuerpo: "Detalle.", orden: 1 },
    ];
    expect(JSON.stringify(docusaurusDesdeEntradas(entradas))).toBe(
      JSON.stringify(docusaurusDesdeEntradas(entradas)),
    );
  });
});

describe("LEEME-DOCUSAURUS.md", () => {
  it("nombra los pasos manuales concretos y el formato detect", () => {
    const salida = docusaurusDesdeEntradas([{ id: "x", titulo: "Hola", cuerpo: "mundo" }]);
    const contenido = leeme(salida)?.content ?? "";
    expect(contenido).toContain("npm create docusaurus@latest sitio classic");
    expect(contenido).toContain("markdown: { format: 'detect' }");
    expect(contenido).toContain("NO_UPDATE_NOTIFIER=1");
    expect(contenido).toContain("sidebars.js");
    expect(contenido).toContain("sin la palabra de Alex");
  });
});
