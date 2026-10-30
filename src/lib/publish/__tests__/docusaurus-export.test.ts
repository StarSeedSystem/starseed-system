import { describe, expect, it } from "vitest";
import {
  docusaurusDesdeEdu,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  escaparMd,
  slugDoc,
} from "../docusaurus-export";
import type { EntradaDoc } from "../docusaurus-export";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

const entrada = (extra: Partial<EntradaDoc> = {}): EntradaDoc => ({
  id: "uno",
  titulo: "Documento",
  cuerpo: "Cuerpo de prueba.",
  ...extra,
});

describe("escaparMd", () => {
  it("convierte llaves, ángulos e instrucciones de módulo", () => {
    expect(escaparMd("{x} <script>")).toBe("&#123;x&#125; &lt;script&gt;");
    expect(escaparMd("import x from 'y'")).toBe("&#105;mport x from 'y'");
    expect(escaparMd("export const y = 1")).toBe("&#101;xport const y = 1");
  });
});

describe("slugDoc", () => {
  it("pasa a ASCII en minúsculas y tiene respaldo", () => {
    expect(slugDoc("Guía: Mecánica Clásica")).toBe("guia-mecanica-clasica");
    expect(slugDoc("¿?")).toBe("documento");
  });
});

describe("docusaurusDesdeEntradas", () => {
  it("cita el título en el front matter aunque tenga «:» y comillas", () => {
    const [archivo] = docusaurusDesdeEntradas([entrada({ titulo: 'Guía: "paso"' })]);
    expect(archivo.content).toContain(`title: ${JSON.stringify('Guía: "paso"')}`);
    expect(archivo.content).toContain('id: "guia-paso"');
    expect(archivo.content).toContain("sidebar_position: 1");
  });

  it("escapa llaves, etiquetas e import en el cuerpo", () => {
    const [archivo] = docusaurusDesdeEntradas([entrada({ cuerpo: "{x}\n<script>\nimport x from 'y'" })]);
    expect(archivo.content).toContain("&#123;x&#125;");
    expect(archivo.content).toContain("&lt;script&gt;");
    expect(archivo.content).toContain("&#105;mport x from 'y'");
  });

  it("resuelve dos títulos iguales con sufijos -2", () => {
    const docs = docusaurusDesdeEntradas([entrada(), entrada()]);
    expect(docs.map((d) => d.path)).toEqual(["docs/documento.md", "docs/documento-2.md", "LEEME-DOCUSAURUS.md"]);
  });

  it("usa docs/<grupo>/<slug>.md y no exporta .mdx ni .js", () => {
    const docs = docusaurusDesdeEntradas([entrada({ grupo: "Educación" })]);
    expect(docs[0].path).toBe("docs/educacion/documento.md");
    expect(docs.every((d) => !/\.(mdx|js|ts)$/.test(d.path))).toBe(true);
  });

  it("el LEEME pide format: 'detect' y es idéntico en dos llamadas", () => {
    const a = docusaurusDesdeEntradas([entrada()]);
    const b = docusaurusDesdeEntradas([entrada()]);
    const leeme = a.find((d) => d.path === "LEEME-DOCUSAURUS.md");
    expect(leeme?.content).toContain("format: 'detect'");
    expect(a).toEqual(b);
  });
});

const temas: readonly TemaGuia[] = [
  {
    key: "uno", titulo: "Primer tema", cuerpo: "Cuerpo uno.", voz: "Voz uno.", ruta: "/uno",
    preguntaAurora: "Aurora, abre uno", puntos: ["punto a", "punto b"],
  },
  {
    key: "dos", titulo: "Segundo tema", cuerpo: "Cuerpo dos.", voz: "Voz dos.", ruta: "/dos",
    preguntaAurora: "Aurora, abre dos", puntos: ["punto c"],
  },
];

describe("docusaurusDesdeGuia", () => {
  it("da un archivo por tema, en orden, con puntos y «Dónde:»", () => {
    const docs = docusaurusDesdeGuia(temas, "Guía de ejemplo")
      .filter((d) => d.path.endsWith(".md") && !d.path.includes("LEEME"));
    expect(docs.map((d) => d.path)).toEqual(["docs/guia-de-ejemplo/primer-tema.md", "docs/guia-de-ejemplo/segundo-tema.md"]);
    expect(docs[0].content).toContain("- punto a");
    expect(docs[0].content).toContain("Dónde: /uno");
    expect(docs[0].content).toContain("Pregunta a Astraura: Aurora, abre uno");
  });
});

const arbol: EduNode[] = [
  { id: "cat", kind: "category", name: "Ciencia", blurb: "Ciencia.", parentId: null },
  { id: "top", kind: "topic", name: "Física", blurb: "Física.", parentId: "cat" },
  { id: "sub", kind: "subtopic", name: "Mecánica", blurb: "Mecánica.", parentId: "top" },
];

describe("docusaurusDesdeEdu", () => {
  it("crea carpetas con _category_.json en tres niveles", () => {
    const docs = docusaurusDesdeEdu(arbol);
    const paths = docs.map((d) => d.path);
    expect(paths).toContain("docs/ciencia.md");
    expect(paths).toContain("docs/ciencia/_category_.json");
    expect(paths).toContain("docs/ciencia/fisica.md");
    expect(paths).toContain("docs/ciencia/fisica/_category_.json");
    expect(paths).toContain("docs/ciencia/fisica/mecanica.md");
    const categoria = docs.find((d) => d.path === "docs/ciencia/_category_.json");
    expect(JSON.parse(categoria!.content)).toEqual({ label: "Ciencia", position: 1, collapsed: false });
    expect(docs.every((d) => !/\.(mdx|js|ts)$/.test(d.path))).toBe(true);
  });
});
