/**
 * Pruebas de la exportación a Docusaurus (DSN1025F · Ola 1025F).
 * Solo funciones puras: entrada → salida, sin red, sin disco, sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
  docusaurusDesdeEdu,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  escaparMd,
  slugDoc,
} from "@/lib/publish/docusaurus-export";
import { TEMAS_SISTEMA } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

describe("escaparMd", () => {
  it("escapa llaves, ángulos y las líneas import/export", () => {
    expect(escaparMd("{x}")).toBe("&#123;x&#125;");
    expect(escaparMd("<script>")).toBe("&lt;script&gt;");
    expect(escaparMd("import x from 'y'")).toBe("&#105;mport x from 'y'");
    expect(escaparMd("export const y = 1")).toBe("&#101;xport const y = 1");
  });
});

describe("slugDoc", () => {
  it("minúscula ASCII sin acentos; vacío → «doc»", () => {
    expect(slugDoc("Protomolécula — guía")).toBe("protomolecula-guia");
    expect(slugDoc("")).toBe("doc");
  });
});

describe("docusaurusDesdeEntradas", () => {
  it("el front matter lleva el título entre comillas aunque tenga «:» o comillas", () => {
    const archivos = docusaurusDesdeEntradas([
      { id: "a", titulo: 'Hola: "el mundo"', cuerpo: "texto" },
    ]);
    expect(archivos).toHaveLength(2); // el doc + el LEEME
    expect(archivos[0].path).toBe("docs/hola-el-mundo.md");
    expect(archivos[0].content).toContain('title: "Hola: \\"el mundo\\""');
    expect(archivos[0].content).toContain('id: "a"');
    expect(archivos[0].content).toContain("sidebar_position: 1");
  });

  it("el cuerpo sale escapado aunque traiga código", () => {
    const archivos = docusaurusDesdeEntradas([
      { id: "x", titulo: "Código", cuerpo: "{x}\n<script>\nimport x from 'y'\n" },
    ]);
    const cuerpo = archivos[0].content.split("---\n\n")[1] ?? "";
    expect(cuerpo).toContain("&#123;x&#125;");
    expect(cuerpo).toContain("&lt;script&gt;");
    expect(cuerpo).toContain("&#105;mport x from 'y'");
  });

  it("dos entradas con el mismo título dan -2", () => {
    const rutas = docusaurusDesdeEntradas([
      { id: "u", titulo: "Igual", cuerpo: "a" },
      { id: "v", titulo: "Igual", cuerpo: "b" },
    ]).map((f) => f.path);
    expect(rutas).toContain("docs/igual.md");
    expect(rutas).toContain("docs/igual-2.md");
  });

  it("el grupo es carpeta con su _category_.json y la raíz antepone carpeta", () => {
    const archivos = docusaurusDesdeEntradas(
      [{ id: "c", titulo: "Tema", cuerpo: "x", grupo: "Publicaciones" }],
      { raiz: "sitio" },
    );
    expect(archivos.some((f) => f.path === "sitio/docs/publicaciones/tema.md")).toBe(true);
    const categoria = archivos.find((f) => f.path === "sitio/docs/publicaciones/_category_.json");
    expect(JSON.parse(categoria!.content)).toEqual({
      label: "Publicaciones",
      position: 1,
      collapsed: false,
    });
  });
});

describe("docusaurusDesdeGuia", () => {
  const archivos = docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía de la red");
  const deRuta = (ruta: string) => archivos.find((f) => f.path === ruta);

  it("da un archivo por tema, en orden, con sus puntos y «Dónde:»", () => {
    const docsDeGuia = archivos.filter(
      (f) => f.path.startsWith("docs/guia-de-la-red/") && f.path.endsWith(".md"),
    );
    expect(docsDeGuia).toHaveLength(TEMAS_SISTEMA.length);
    const primero = deRuta("docs/guia-de-la-red/protomolecula.md");
    expect(primero?.content).toContain('title: "Protomolécula"');
    expect(primero?.content).toContain("sidebar_position: 1");
    expect(primero?.content).toContain("- moléculas con su ámbito (personal, perfil, grupo, pública)");
    expect(primero?.content).toContain("Dónde: /protomolecula");
    expect(primero?.content).toContain("Pregunta a Astraura: Aurora, abre la Protomolécula");
    const ultimo = deRuta("docs/guia-de-la-red/neuronas-y-cerebro.md");
    expect(ultimo?.content).toContain("sidebar_position: 4");
    expect(archivos.some((f) => f.path === "docs/guia-de-la-red/_category_.json")).toBe(true);
  });
});

describe("docusaurusDesdeEdu", () => {
  it("un árbol de 3 niveles da carpetas con _category_.json y .md con su blurb", () => {
    const arbol: EduNode[] = [
      { id: "cat", kind: "category", name: "Ciencia", parentId: null, blurb: "Estudio del universo." },
      { id: "top", kind: "topic", name: "Física", parentId: "cat", blurb: "Materia y movimiento." },
      { id: "sub1", kind: "subtopic", name: "Mecánica Clásica", parentId: "top" },
      { id: "sub2", kind: "subtopic", name: "Relatividad", parentId: "top" },
    ];
    const archivos = docusaurusDesdeEdu(arbol);
    expect(JSON.parse(archivos.find((f) => f.path === "docs/ciencia/_category_.json")!.content)).toEqual({
      label: "Ciencia",
      position: 1,
      collapsed: false,
    });
    expect(JSON.parse(archivos.find((f) => f.path === "docs/ciencia/fisica/_category_.json")!.content)).toEqual({
      label: "Física",
      position: 2,
      collapsed: false,
    });
    const raiz = archivos.find((f) => f.path === "docs/ciencia.md");
    expect(raiz?.content).toContain("Estudio del universo.");
    expect(archivos.some((f) => f.path === "docs/ciencia/fisica/relatividad.md")).toBe(true);
  });

  it("un subtema cuelga de la carpeta de su tema", () => {
    const arbol: EduNode[] = [
      { id: "cat2", kind: "category", name: "Ciencia", parentId: null },
      { id: "top2", kind: "topic", name: "Física", parentId: "cat2", blurb: "Materia." },
    ];
    const archivos = docusaurusDesdeEdu(arbol);
    expect(archivos.some((f) => f.path === "docs/ciencia/fisica.md")).toBe(true);
  });
});

describe("formato y determinismo", () => {
  const todos = [
    ...docusaurusDesdeEntradas([{ id: "g", titulo: "Con grupo", cuerpo: "x", grupo: "Guía" }]),
    ...docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía de la red"),
    ...docusaurusDesdeEdu([
      { id: "c", kind: "category", name: "Ciencia", parentId: null },
      { id: "t", kind: "topic", name: "Física", parentId: "c" },
    ]),
  ];
  it("ninguna ruta termina en .mdx ni .js; el LEEME nombra format: 'detect'", () => {
    expect(todos.every((f) => !f.path.endsWith(".mdx") && !f.path.endsWith(".js"))).toBe(true);
    const leeme = todos.find((f) => f.path.endsWith("LEEME-DOCUSAURUS.md"));
    expect(leeme).toBeDefined();
    expect(leeme!.content).toContain("format: 'detect'");
    expect(leeme!.content).toContain("NO_UPDATE_NOTIFIER=1");
    expect(leeme!.content).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme!.content).toContain("sin la palabra de Alex");
  });

  it("el resultado es idéntico en dos llamadas", () => {
    expect(docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía de la red")).toEqual(
      docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía de la red"),
    );
    const arbol: EduNode[] = [
      { id: "c", kind: "category", name: "Ciencia", parentId: null },
      { id: "t", kind: "topic", name: "Física", parentId: "c" },
    ];
    expect(docusaurusDesdeEdu(arbol)).toEqual(docusaurusDesdeEdu(arbol));
  });
});
