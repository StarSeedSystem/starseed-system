import { describe, it, expect } from "vitest";
import { prepararDiagrama } from "../aislar-diagrama";

const LIMPIO =
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>' +
  '<body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>';

// Extracto de vendor/habilidades/diagram-design/assets/template.html (MIT):
// trae el <link> a Google Fonts que debe quitarse antes de mostrarlo.
const PLANTILLA_VENDOR =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
  '<link href="https://fonts.googleapis.com/css2?family=Geist&display=swap" rel="stylesheet">' +
  '<style>:root{--font-sans:"Geist",system-ui,sans-serif}body{font-family:var(--font-sans)}</style>' +
  '</head><body><svg viewBox="0 0 100 100"><rect width="100" height="100"></rect></svg></body></html>';

describe("prepararDiagrama", () => {
  it("exige un solo documento con <svg>", () => {
    const sinSvg = prepararDiagrama("<!DOCTYPE html><html><body></body></html>");
    expect(sinSvg.ok).toBe(false);
    expect(sinSvg.motivos).toContain("falta etiqueta <svg>");

    const sinDoctype = prepararDiagrama("<html><svg></svg></html>");
    expect(sinDoctype.ok).toBe(false);
    expect(sinDoctype.motivos.some((m) => m.includes("espera exactamente"))).toBe(true);

    const doble = prepararDiagrama("<!DOCTYPE html><!DOCTYPE html><html><svg></svg></html>");
    expect(doble.ok).toBe(false);
    expect(doble.srcdoc).toBeUndefined();
  });

  it("rechaza HTML mayor a 2 MB", () => {
    const grande = LIMPIO + "x".repeat(2 * 1024 * 1024);
    const r = prepararDiagrama(grande);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("excede el límite de 2 MB");
    expect(r.srcdoc).toBeUndefined();
  });

  it("acepta la plantilla de vendor sin fuentes ni red", () => {
    const r = prepararDiagrama(PLANTILLA_VENDOR, { permitirAnimacion: true });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    expect(r.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(r.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(r.srcdoc).toContain("<svg");
    expect(r.srcdoc).not.toContain("fonts.googleapis.com");
    expect(r.srcdoc).not.toContain("<link");
    expect(r.sandbox.includes("same-origin")).toBe(false);
  });

  it("sin animación no permite scripts ni allow-same-origin", () => {
    const r = prepararDiagrama(LIMPIO, { permitirAnimacion: false });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    expect(r.srcdoc).toContain("default-src 'none'");
    expect(r.srcdoc).not.toContain("script-src");
    expect(r.srcdoc).not.toContain("same-origin");
  });

  it("neutraliza HTML malicioso y elementos de red", () => {
    const malicioso =
      '<!DOCTYPE html><html><head><base href="https://malo.example">' +
      '<meta http-equiv="refresh" content="0;url=https://malo.example">' +
      '<link href="https://malo.example/x.css" rel="stylesheet">' +
      '<style>@import url("https://malo.example/y.css");' +
      '.fondo{background:url(https://malo.example/z.png)}</style></head>' +
      '<body onload="alert(1)">' +
      '<svg onload="alert(2)" viewBox="0 0 10 10"></svg>' +
      '<a href="javascript:alert(3)">x</a>' +
      '<iframe src="https://malo.example"></iframe>' +
      '<object data="https://malo.example"></object>' +
      '<embed src="https://malo.example">' +
      '<form action="https://malo.example"><input></form>' +
      '</body></html>';
    const r = prepararDiagrama(malicioso, { permitirAnimacion: true });

    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    expect(r.motivos.length).toBeGreaterThan(0);
    const doc = r.srcdoc ?? "";
    expect(doc).not.toMatch(/<iframe|<object|<embed|<form|<link|<base/i);
    expect(doc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(doc).not.toContain("javascript:");
    expect(doc).not.toContain("@import");
    expect(doc).not.toContain("malo.example");
    expect(doc).not.toMatch(/[\s/]on[a-z]+\s*=/i);
    expect(doc).toContain("default-src 'none'");
  });

  it("inserta la CSP aunque el documento no traiga <head>", () => {
    const r = prepararDiagrama("<!DOCTYPE html><svg></svg>", { permitirAnimacion: false });
    expect(r.ok).toBe(true);
    expect(r.srcdoc).toContain("<head>");
    expect(r.srcdoc).toContain("Content-Security-Policy");
  });
});
