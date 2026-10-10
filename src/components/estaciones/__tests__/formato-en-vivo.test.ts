/** Textos del reloj común y de la duración: salen de lo medido y nunca inventan un número. */
import { describe, expect, it } from "vitest";
import { formatearMs, textoReloj } from "../en-vivo/formato-en-vivo";

describe("formato-en-vivo", () => {
  it("duraciones", () => {
    expect(formatearMs(0)).toBe("0:00");
    expect(formatearMs(75_400)).toBe("1:15");
    expect(formatearMs(3_723_000)).toBe("1:02:03");
    expect(formatearMs(-5)).toBe("0:00");
  });

  it("reloj sincronizado: precisión y cota medidas", () => {
    const t = textoReloj({ modo: "sincronizado", desfaseMs: 12, derivaPpm: 0, precisionMs: 0.4, cotaMs: 6.5, retardoMinMs: 12.3, muestras: 9, ultimaMuestra: 1 });
    expect(t.principal).toBe("Sincronizado ± 0,4 ms");
    expect(t.detalle).toContain("± 6,5 ms");
    expect(t.detalle).toContain("9 medidas");
    expect(t.corto).toBe("± 0,4 ms");
    expect(t.detalle).not.toContain("deriva");
    const d = textoReloj({ modo: "sincronizado", desfaseMs: 12, derivaPpm: -23.46, precisionMs: 0.4, cotaMs: 6.5, retardoMinMs: 12.3, muestras: 9, ultimaMuestra: 1 });
    expect(d.detalle).toContain("deriva de este reloj -23,5 ppm (compensada)");
  });

  it("sin referencia no enseña ningún ± inventado", () => {
    const t = textoReloj({ modo: "sin-referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: null, cotaMs: null, retardoMinMs: null, muestras: 0, ultimaMuestra: null });
    expect(t.principal).not.toMatch(/±/);
    expect(t.corto).toBe("sin medir");
  });

  it("referencia", () => {
    expect(textoReloj({ modo: "referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: 0, cotaMs: 0, retardoMinMs: 0, muestras: 0, ultimaMuestra: null }).principal).toMatch(/marca la hora común/);
  });
});
