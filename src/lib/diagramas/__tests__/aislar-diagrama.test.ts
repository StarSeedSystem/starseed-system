// Pruebas puras del aislamiento de diagramas (entrada → salida; sin red y
// sin navegador real). Cubren el contrato de architecture/diagramas.md §3 y
// las plantillas MIT de vendor/habilidades/diagram-design/assets/.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepararDiagrama } from "../aislar-diagrama";

function plantillaDeVendor(nombre: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../vendor/habilidades/diagram-design/assets/${nombre}`, import.meta.url)),
    "utf8",
  );
}

describe("prepararDiagrama", () => {
  it("exige un solo documento HTML con <svg>", () => {
    const sinSvg = prepararDiagrama("<!DOCTYPE html><html><body>hola</body></html>");
    expect(sinSvg.ok).toBe(false);
    expect(sinSvg.motivos).toContain("falta etiqueta <svg>");
    expect(sinSvg.srcdoc).toBeUndefined();

    const sinDoctype = prepararDiagrama("<html><body><svg></svg></body></html>");
    expect(sinDoctype.ok).toBe(false);
    expect(sinDoctype.motivos.some((m) => m.includes("espera exactamente"))).toBe(true);

    const dosDocumentos = prepararDiagrama("<!DOCTYPE html><!DOCTYPE html><html><svg></svg></html>");
    expect(dosDocumentos.ok).toBe(false);
    expect(dosDocumentos.motivos.some((m) => m.includes("espera exactamente"))).toBe(true);
  });

  it("quita iframe, object, embed, form, on*= y javascript:", () => {
    const html =
      '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://malo.example"></head><body onload="alert(1)">' +
      '<svg/onload=alert(2) xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<iframe src="https://malo.example"></iframe>' +
      '<object data="malo.swf"></object><embed src="malo.swf">' +
      '<form action="javascript:alert(3)"><input name="x"></form>' +
      '<a href="javascript:alert(4)">enlace</a></body></html>';
    const r = prepararDiagrama(html);
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    expect(r.srcdoc).toBeDefined();
    const salida = r.srcdoc || "";
    for (const prohibido of ["<iframe", "<object", "<embed", "<form", "onload", "javascript:", 'http-equiv="refresh"']) {
      expect(salida.toLowerCase()).not.toContain(prohibido);
    }
    expect(r.motivos.length).toBeGreaterThan(0);
  });

  it("quita <link>, @import y url(http…) remotos", () => {
    const html =
      '<!DOCTYPE html><html><head>' +
      '<link href="https://fonts.googleapis.com/css2?family=Geist" rel="stylesheet">' +
      '<style>@import url("https://fonts.googleapis.com/css2?family=Geist");</style>' +
      '</head><body><svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect style="fill:url(https://ejemplo.com/textura.png)" width="1" height="1" />' +
      "</svg></body></html>";
    const r = prepararDiagrama(html);
    expect(r.ok).toBe(true);
    const salida = r.srcdoc || "";
    expect(salida).not.toContain("fonts.googleapis.com");
    expect(salida).not.toContain("@import");
    expect(salida).not.toContain("url(http");
    expect(salida).not.toContain("<link");
    expect(r.motivos.some((m) => m.includes("<link>"))).toBe(true);
  });

  it("inserta la CSP y concede allow-scripts solo con animación", () => {
    const html = '<!DOCTYPE html><html><head></head><body><svg></svg></body></html>';
    const conAnimacion = prepararDiagrama(html, { permitirAnimacion: true });
    expect(conAnimacion.ok).toBe(true);
    expect(conAnimacion.sandbox).toBe("allow-scripts");
    expect(conAnimacion.srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(conAnimacion.srcdoc).toContain("default-src 'none'");
    expect(conAnimacion.srcdoc).toContain("style-src 'unsafe-inline'");
    expect(conAnimacion.srcdoc).toContain("img-src data:");
    expect(conAnimacion.srcdoc).toContain("font-src data:");
    expect(conAnimacion.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(conAnimacion.sandbox).not.toContain("allow-same-origin");

    const sinAnimacion = prepararDiagrama(html, { permitirAnimacion: false });
    expect(sinAnimacion.ok).toBe(true);
    expect(sinAnimacion.sandbox).toBe("");
    expect(sinAnimacion.srcdoc).not.toContain("script-src");
    expect(sinAnimacion.sandbox).not.toContain("allow-same-origin");
  });

  it("rescata 39711481854 · un HTML con script queda inerte sin animación y activo con ella", () => {
    // El contrato de main no arranca la etiqueta <script>: la vuelve inerte con
    // sandbox opaco ("") y sin script-src en la CSP (default-src 'none' también
    // la bloquea). Se comprueba eso, no la ausencia de la etiqueta.
    const animado =
      '<!DOCTYPE html><html><head></head><body>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" /></svg>' +
      '<script>document.body.querySelectorAll("circle").forEach(() => {});</script>' +
      "</body></html>";

    const con = prepararDiagrama(animado, { permitirAnimacion: true });
    expect(con.ok).toBe(true);
    expect(con.sandbox).toBe("allow-scripts");
    expect(con.srcdoc).toContain("script-src 'unsafe-inline'");
    // El script de animación llega intacto (no hay recursos remotos que quitar).
    expect(con.srcdoc).toContain("querySelector");

    const sin = prepararDiagrama(animado, { permitirAnimacion: false });
    expect(sin.ok).toBe(true);
    expect(sin.sandbox).toBe("");
    expect(sin.srcdoc).not.toContain("script-src");
    // Nunca se concede el origen mismo del documento, con o sin animación.
    expect(sin.srcdoc).not.toContain("allow-same-origin");
  });

  it("rechaza HTML mayor de 2 MB", () => {
    const grande = "<!DOCTYPE html><html><body><svg></svg>" + "x".repeat(3 * 1024 * 1024) + "</body></html>";
    const r = prepararDiagrama(grande);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("excede el límite de 2 MB");
    expect(r.srcdoc).toBeUndefined();
  });

  it("prepara una plantilla de vendor con fuentes del OS", () => {
    const plantilla = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Geist&display=swap" rel="stylesheet">
<style>
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif");
body { background: url(https://ejemplo.com/fondo.png); }
</style>
</head>
<body>
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" /></svg>
<script>document.title = "listo";</script>
</body>
</html>`;
    const r = prepararDiagrama(plantilla, { permitirAnimacion: true });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    const salida = r.srcdoc || "";
    expect(salida).toContain("Content-Security-Policy");
    expect(salida).toContain("script-src 'unsafe-inline'");
    expect(salida).not.toContain("<link");
    expect(salida).not.toContain("@import");
    expect(salida).not.toContain("fonts.googleapis.com");
    expect(salida).not.toContain("url(http");
    expect(salida).toContain("<circle");
  });

  it("acepta la plantilla real del vendor sin animación y sin red", () => {
    const r = prepararDiagrama(plantillaDeVendor("template.html"));
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    const salida = r.srcdoc || "";
    expect(salida).toContain("Content-Security-Policy");
    expect(salida).not.toContain("script-src");
    expect(salida).not.toContain("fonts.googleapis.com");
    expect(salida).not.toContain("<link");
    expect(salida).toContain("<svg");
  });

  it("acepta la plantilla animada del vendor con allow-scripts y sin red", () => {
    const html = plantillaDeVendor("template-motion.html");
    const r = prepararDiagrama(html, { permitirAnimacion: true });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    const salida = r.srcdoc || "";
    expect(salida).toContain("script-src 'unsafe-inline'");
    expect(salida).not.toContain("fonts.googleapis.com");
    expect(salida).not.toContain("<link");
    expect(salida).toContain("<script");
  });
});
