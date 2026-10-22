import { describe, it, expect } from "vitest";
import { LIMITE_DIAGRAMA_BYTES, prepararDiagrama } from "../aislar-diagrama";

// Recorte de una plantilla real de diagram-design (MIT,
// vendor/habilidades/diagram-design/assets/template.html): incluye la hoja de
// Google Fonts que debe quitarse para que el diagrama no dependa de la red.
const PLANTILLA = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Diagram</title>
<link href="https://fonts.googleapis.com/css2?family=Geist&display=swap" rel="stylesheet">
<style>@import url("https://fonts.googleapis.com/css2?family=Geist"); body { font-family: Geist, system-ui; background: url(https://cdn.example.com/fondo.png); }</style>
</head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg></body></html>`;

const PLANTILLA_MOTION = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Motion</title>
<style>.item{opacity:0}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg"><rect class="item"/></svg>
<script>document.querySelector('.item').style.opacity = 1;</script>
<script src="https://cdn.example.com/motion.js"></script></body></html>`;

const MALICIOSO = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="https://evil.example.com/x.css"></head>
<body onload="alert(1)"><svg><a href="javascript:alert(1)">x</a></svg>
<iframe src="https://evil.example.com"></iframe><object data="x"></object>
<embed src="x"><form action="https://evil.example.com"><input></form></body></html>`;

describe("prepararDiagrama", () => {
  it("exige un documento con <svg>", () => {
    const r = prepararDiagrama("<html></html>");
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("falta etiqueta <svg>");
    expect(r.srcdoc).toBeUndefined();
  });

  it("rechaza sin <!DOCTYPE> o con más de uno", () => {
    expect(prepararDiagrama("<html><svg></svg></html>").ok).toBe(false);
    const doble = prepararDiagrama("<!DOCTYPE html><!DOCTYPE html><html><svg></svg></html>");
    expect(doble.ok).toBe(false);
    expect(doble.motivos.some((m) => m.includes("espera exactamente"))).toBe(true);
  });

  it("acepta una plantilla de diagram-design sin recursos remotos", () => {
    const r = prepararDiagrama(PLANTILLA, { permitirAnimacion: false });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    expect(r.srcdoc).not.toContain("<link");
    expect(r.srcdoc).not.toContain("@import");
    expect(r.srcdoc).not.toContain("https://fonts.googleapis.com");
    expect(r.srcdoc).not.toContain("cdn.example.com");
    expect(r.srcdoc).toContain("<svg");
    expect(r.motivos.length).toBeGreaterThan(0);
  });

  it("inserta la CSP sin script cuando no hay animación", () => {
    const r = prepararDiagrama(PLANTILLA, { permitirAnimacion: false });
    expect(r.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(r.srcdoc).toContain("default-src 'none'");
    expect(r.srcdoc).toContain("style-src 'unsafe-inline'");
    expect(r.srcdoc).toContain("img-src data:");
    expect(r.srcdoc).toContain("font-src data:");
    expect(r.srcdoc).not.toContain("script-src");
  });

  it("conserva el script inline solo con animación permitida", () => {
    const con = prepararDiagrama(PLANTILLA_MOTION, { permitirAnimacion: true });
    expect(con.ok).toBe(true);
    expect(con.sandbox).toBe("allow-scripts");
    expect(con.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(con.srcdoc).toContain("querySelector");
    expect(con.srcdoc).not.toContain("cdn.example.com");

    const sin = prepararDiagrama(PLANTILLA_MOTION, { permitirAnimacion: false });
    expect(sin.ok).toBe(true);
    expect(sin.sandbox).toBe("");
    expect(sin.srcdoc).not.toContain("<script");
    expect(sin.srcdoc).not.toContain("querySelector");
    expect(sin.srcdoc).not.toContain("script-src");
  });

  it("neutraliza HTML malicioso en lugar de mostrarlo", () => {
    const r = prepararDiagrama(MALICIOSO, { permitirAnimacion: true });
    expect(r.ok).toBe(true);
    const doc = r.srcdoc ?? "";
    expect(doc).not.toContain("<iframe");
    expect(doc).not.toContain("<object");
    expect(doc).not.toContain("<embed");
    expect(doc).not.toContain("<form");
    expect(doc).not.toContain("<link");
    expect(doc).not.toMatch(/\son[a-z]+\s*=/i);
    expect(doc).not.toContain("javascript:");
    expect(doc).toContain("<svg");
    expect(doc).toContain("Content-Security-Policy");
  });

  it("nunca usa allow-same-origin", () => {
    for (const permitirAnimacion of [true, false]) {
      const r = prepararDiagrama(PLANTILLA, { permitirAnimacion });
      expect(r.sandbox).not.toContain("allow-same-origin");
      expect(r.srcdoc).not.toContain("allow-same-origin");
    }
    expect(prepararDiagrama(PLANTILLA, { permitirAnimacion: true }).sandbox).toBe("allow-scripts");
    expect(prepararDiagrama(PLANTILLA, { permitirAnimacion: false }).sandbox).toBe("");
  });

  it("rechaza HTML mayor a 2 MB", () => {
    const grande = "<!DOCTYPE html><html><body><svg></svg>" + "x".repeat(LIMITE_DIAGRAMA_BYTES) + "</body></html>";
    const r = prepararDiagrama(grande);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("excede el límite de 2 MB");
  });
});
