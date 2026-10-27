import { describe, it, expect } from "vitest";
import { docusaurusDesdeEntradas, docusaurusDesdeGuia, docusaurusDesdeEdu, escaparMd, slugDoc } from "../docusaurus-export";
import { TEMAS_SISTEMA } from "@/lib/onboarding/guia-temas-sistema";
import { BUILTIN_NODES } from "@/lib/education/curriculum";

describe("docusaurus-export", () => {
  it("front matter title quoted", () => {
    const res = docusaurusDesdeEntradas([{ id: "a", titulo: "Título: con comillas \"y dos puntos", cuerpo: "c" }]);
    const md = res[0].content;
    expect(md).toMatch(/title:\s*"Título: con comillas \\"y dos puntos"/);
  });
  it("escapes { } < > and import/export", () => {
    const out = escaparMd("{x} <script>\nimport x from 'y'\nexport const a=1");
    expect(out).toContain("&#123;x&#125;");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&#105;mport x from 'y'");
    expect(out).toContain("&#101;xport const a=1");
  });
  it("slug collision adds -2", () => {
    const res = docusaurusDesdeEntradas([
      { id: "1", titulo: "Mismo", cuerpo: "" },
      { id: "2", titulo: "Mismo", cuerpo: "" }
    ]);
    expect(res[0].path).toMatch(/mismo\.md$/);
    expect(res[1].path).toMatch(/mismo-2\.md$/);
  });
  it("guide produces one file per tema with puntos and Dónde", () => {
    const res = docusaurusDesdeGuia(TEMAS_SISTEMA.slice(0,2), "t");
    expect(res.length).toBe(3);
    expect(res[0].content).toContain("Dónde:");
    expect(res[0].content).toContain("Pregunta a Astraura:");
    expect(res[0].content).toContain("- ");
  });
  it("edu tree gives _category_.json and .md", () => {
    const nodes = BUILTIN_NODES.slice(0,6);
    const res = docusaurusDesdeEdu(nodes);
    const cats = res.filter(r=>r.path.endsWith("_category_.json"));
    const mds = res.filter(r=>r.path.endsWith(".md") && !r.path.includes("LEEME"));
    expect(cats.length).toBeGreaterThan(0);
    expect(mds.length).toBeGreaterThan(0);
    expect(res.every(r=>!r.path.endsWith(".mdx") && !r.path.endsWith(".js"))).toBe(true);
  });
  it("LEEME mentions format detect", () => {
    const res = docusaurusDesdeEntradas([]);
    const leeme = res.find(r=>r.path.includes("LEEME"));
    expect(leeme?.content).toContain("format: 'detect'");
  });
  it("idempotent", () => {
    const a = docusaurusDesdeEntradas([{id:"x",titulo:"T",cuerpo:"c"}]);
    const b = docusaurusDesdeEntradas([{id:"x",titulo:"T",cuerpo:"c"}]);
    expect(a).toEqual(b);
  });
});
