import { describe, it, expect } from "vitest";
import { prepararDiagrama } from "../aislar-diagrama";

describe("prepararDiagrama", () => {
  it("exige un documento con <svg>", () => {
    const r = prepararDiagrama("<html></html>");
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("falta etiqueta <svg>");
  });

  it("rechaza sin <!DOCTYPE>", () => {
    const r = prepararDiagrama("<html><svg></svg></html>");
    expect(r.ok).toBe(false);
    expect(r.motivos.some((m) => m.includes("espera exactamente"))).toBe(true);
  });

  it("rechaza con <iframe>", () => {
    const html = '<!DOCTYPE html><html><body><svg></svg><iframe src="x"></iframe></body></html>';
    const r = prepararDiagrama(html);
    expect(r.ok).toBe(false);
    expect(r.motivos.some((m) => m.includes("iframe"))).toBe(true);
  });

  it("rechaza manejador onload= y javascript:", () => {
    const html = '<!DOCTYPE html><html><body onload="alert(1)"><svg></svg><a href="javascript:alert(1)">x</a></body></html>';
    const r = prepararDiagrama(html);
    expect(r.ok).toBe(false);
    expect(r.motivos.some((m) => m.includes("manejador"))).toBe(true);
    expect(r.motivos.some((m) => m.includes("javascript"))).toBe(true);
  });

  it("rechaza url(http…) remoto", () => {
    const html = '<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2"></link></head><body><svg></svg><style>body{background:url(http://ejemplo.com/img.png)}</style></body></html>';
    const r = prepararDiagrama(html);
    expect(r.ok).toBe(false);
    expect(r.motivos.some((m) => m.includes("url(http") || m.includes("<link>"))).toBe(true);
  });

  it("acepta plantilla limpia con animación permitida", () => {
    const plantilla = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>';
    const r = prepararDiagrama(plantilla, { permitirAnimacion: true });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    expect(r.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(r.srcdoc).toContain("script-src 'unsafe-inline';");
  });

  it("acepta plantilla limpia sin animación", () => {
    const plantilla = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>';
    const r = prepararDiagrama(plantilla, { permitirAnimacion: false });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    expect(r.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(r.srcdoc).not.toContain("script-src");
  });

  it("rechaza HTML mayor a 2 MB", () => {
    const grande = "<!DOCTYPE html><html><body><svg></svg>" + "x".repeat(3 * 1024 * 1024) + "</body></html>";
    const r = prepararDiagrama(grande);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain("excede el límite de 2 MB");
  });
});
