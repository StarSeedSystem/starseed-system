// @vitest-environment jsdom
// Pruebas puras de la exportación de diagramas (architecture/diagramas.md §4-I) con las plantillas MIT de
// vendor/habilidades/diagram-design/assets/. Sin red: jsdom solo aporta DOMParser para exigir XML bien formado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { conModo, modoDeDiagrama, planPng, svgDeDiagrama } from "../exportar-diagrama";
import { prepararDiagrama } from "../aislar-diagrama";
import { sustituirFuentes } from "../fuentes-locales";

// En jsdom, import.meta.url no es una ruta de archivo: se parte de la raíz del repositorio.
const plantilla = (nombre: string) => readFileSync(path.join(process.cwd(), "vendor/habilidades/diagram-design/assets", nombre), "utf8");
/** Lo parsea como un .svg suelto: falla si no es XML bien formado. */
function comoXml(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  return doc;
}
const svgOk = (html: string): string => { const r = svgDeDiagrama(html); if (!r.ok) throw new Error(r.motivo); return r.svg; };

describe("svgDeDiagrama", () => {
  it("entrega solo el <svg> de la plantilla, autónomo, con su CSS y el título como primer hijo", () => {
    const svg = svgOk(plantilla("template.html"));
    expect(svg.startsWith("<svg ") && svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/<h1|class="frame"|fonts\.googleapis/);
    const raiz = comoXml(svg).documentElement;
    expect(raiz.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect([...raiz.children].slice(0, 3).map((h) => h.tagName)).toEqual(["title", "desc", "style"]);
    const css = raiz.children[2]?.textContent ?? "";
    for (const c of ["--color-paper:   #f5f5f5", ":root { font-family: var(--font-sans); color: var(--color-ink); }"]) expect(css).toContain(c);
    // El `svg { min-width: 960px }` es maquetación de la página: fuera, también dentro de @media print.
    expect([/min-width/.test(css), css.includes("@media print {")]).toEqual([false, true]);
  });
  it("cuenta los <svg> anidados y no se deja engañar por comentarios ni scripts", () => {
    const svg = svgOk('<!DOCTYPE html><html><head><style>.n { fill: red; }</style></head><body><!-- <svg id="falso"> -->' +
      '<script>const s = "<svg>";</script><svg viewBox="0 0 10 10"><svg class="icono"><path d="M0 0"/></svg>' +
      '<svg/><text>después del icono</text></svg><svg id="otro"></svg></body></html>');
    expect(svg).not.toMatch(/falso|otro|<script/);
    expect(svg.endsWith("<text>después del icono</text></svg>")).toBe(true);
    expect(comoXml(svg).documentElement.getAttribute("viewBox")).toBe("0 0 10 10");
  });
  it("quita los scripts, añade los espacios de nombres que faltan y escapa el CSS para XML", () => {
    const svg = svgOk('<!DOCTYPE html><html><head><style>.t::after { content: "R&D <1>"; }</style></head><body>' +
      '<svg viewBox="0 0 4 4"><script>alert(1)</script><script src="x.js"/><use xlink:href="#a"/></svg></body></html>');
    expect(svg).not.toContain("<script");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
    expect(svg).toContain('content: "R&amp;D &lt;1>"');
    expect(comoXml(svg).querySelector("style")?.textContent).toContain('"R&D <1>"');
  });
  it("deja fuera los scripts de un diagrama animado y dice el motivo si no hay <svg>", () => {
    const animado = plantilla("example-exploded-ai-stack-animated.html");
    expect(animado).toMatch(/<script\b/);
    expect(svgOk(animado)).not.toMatch(/<script\b/i);
    expect(svgDeDiagrama("<!DOCTYPE html><p>sin dibujo</p>")).toEqual({ ok: false, motivo: "no hay ningún <svg> de diagrama" });
  });
  it("sale ya aislado y con las fuentes del OS: sin red, el SVG lleva su @font-face local", () => {
    const local = sustituirFuentes(plantilla("template.html"), [{ family: "Geist", categoria: "sans", dataUrl: "data:font/woff2;base64,AAAA" }]);
    const svg = svgOk(prepararDiagrama(local).srcdoc ?? "");
    expect(svg).toContain("@font-face { font-family: 'Geist'; src: url('data:font/woff2;base64,AAAA')");
    expect(svg).not.toMatch(/googleapis|gstatic|Content-Security-Policy/);
    comoXml(svg);
  });
});
describe("planPng", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="100%" stroke-width="2"><rect/></svg>';
  it("mide viewBox × escala y deja el <svg> con ese tamaño exacto", () => {
    const plan = planPng(svg, 2);
    expect(plan).toMatchObject({ ok: true, ancho: 1920, alto: 1200, escala: 2 });
    const raiz = comoXml(plan.ok ? plan.svg : "").documentElement;
    expect(["width", "height", "stroke-width"].map((a) => raiz.getAttribute(a))).toEqual(["1920", "1200", "2"]);
    expect(plan.ok && plan.svg.match(/\swidth=/g)).toHaveLength(1);
  });
  it("acota la escala entre 1 y 4, como la skill, y por defecto usa 2", () => {
    expect(planPng(svg, 0.5)).toMatchObject({ ancho: 960, alto: 600, escala: 1 });
    expect(planPng(svg, 10)).toMatchObject({ ancho: 3840, alto: 2400, escala: 4 });
    expect(planPng(svg, Number.NaN)).toMatchObject({ ancho: 1920, escala: 2 });
    expect(planPng(svg)).toMatchObject({ ancho: 1920, alto: 1200 });
    expect(planPng('<svg viewBox="0,0,960,504">', 1.25)).toMatchObject({ ancho: 1200, alto: 630 });
  });
  it("no pasa del área de lienzo que aceptan los navegadores y rechaza lo que no se puede medir", () => {
    const grande = planPng('<svg viewBox="0 0 3000 3000"></svg>', 4);
    expect(grande.ok && grande.ancho * grande.alto <= 4096 * 4096).toBe(true);
    expect(planPng('<svg viewBox="0 0 5000 5000"></svg>').ok).toBe(false);
    expect(planPng("<svg></svg>")).toEqual({ ok: false, motivo: "el PNG necesita un viewBox con ancho y alto positivos" });
    expect([planPng('<svg viewBox="0 0 -10 10"></svg>').ok, planPng("<div>").ok]).toEqual([false, false]);
  });
});
describe("modo claro/oscuro", () => {
  it("reconoce la piel de cada plantilla por su papel", () => {
    expect(modoDeDiagrama(plantilla("template.html"))).toBe("claro");
    expect(modoDeDiagrama(plantilla("template-dark.html"))).toBe("oscuro");
    expect(modoDeDiagrama('<svg><rect width="100%" height="100%" fill="rgb(20, 20, 20)"/></svg>')).toBe("oscuro");
    expect(modoDeDiagrama("<svg></svg>")).toBe("claro");
  });
  it("pasa la plantilla clara a la piel oscura de la skill y vuelve a la clara", () => {
    const claro = plantilla("template.html");
    expect(conModo(claro, "claro")).toBe(claro);
    const oscuro = conModo(claro, "oscuro");
    expect(modoDeDiagrama(oscuro)).toBe("oscuro");
    for (const c of ['<rect width="100%" height="100%" fill="#2d3142"/>', "--color-ink:     #f5f5f5", 'fill="#bfc0c0"/></marker>',
      'fill="#f08a59"/></marker>', 'fill="#739fdf"/></marker>']) expect(oscuro).toContain(c);
    const vuelta = conModo(oscuro, "claro");
    for (const c of ['fill="#f5f5f5"', 'fill="#4f5d75"', 'fill="#bf4520"', 'fill="#2e5aa8"', "--color-ink:     #2d3142"]) expect(vuelta).toContain(c);
  });
  it("escala el alfa de los tintes, invierte lo que no es de la piel y no toca textos ni referencias", () => {
    const oscuro = conModo('<svg><rect width="100%" height="100%" fill="#f5f5f5"/><rect fill="rgba(191,69,32,0.08)" stroke="#bf452014"/>' +
      '<style>#face { fill: #f5f5f5 }</style><path fill="#336699" marker-end="url(#add)"/><a href="#bad"><text>PR #abc&#160;</text></a></svg>', "oscuro");
    expect(oscuro).toContain('fill="rgba(240,138,89,0.1)" stroke="#f08a5919"');
    expect(oscuro).toContain('fill="#6699cc" marker-end="url(#add)"');
    expect(oscuro).toContain("<style>#face { fill: #2d3142 }</style>");
    expect(oscuro).toContain('<a href="#bad"><text>PR #abc&#160;</text></a>');
    expect(conModo(oscuro, "claro")).toMatch(/fill="rgba\(191,69,32,0\.08\)"[\s\S]*fill="#336699"/);
  });
  it("el SVG exportado conserva la piel elegida", () => {
    const svg = svgOk(prepararDiagrama(conModo(plantilla("template.html"), "oscuro")).srcdoc ?? "");
    expect(comoXml(svg).querySelector("rect")?.getAttribute("fill")).toBe("#2d3142");
    expect(svg).toContain("--color-paper:   #2d3142");
  });
});
