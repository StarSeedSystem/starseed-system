import { describe, expect, it } from "vitest";
import { dibujarCampo, RADIO_MINIMO_PX } from "../capa-alcance";

function ctxFalso() {
  const llamadas: string[] = [];
  const arcos: number[] = [];
  const g = { addColorStop: () => undefined };
  const ctx: any = new Proxy({ lineDash: [] as number[] }, {
    get: (t: any, k: string) => {
      if (k === "createRadialGradient") return () => g;
      if (k === "arc") return (_x: number, _y: number, r: number) => { arcos.push(r); llamadas.push("arc"); };
      if (k === "setLineDash") return (d: number[]) => { t.lineDash = d; llamadas.push(`dash:${d.length}`); };
      if (k in t) return t[k];
      return (..._a: unknown[]) => { llamadas.push(k); };
    },
    set: (t: any, k: string, v: unknown) => { t[k] = v; return true; },
  });
  return { ctx, llamadas, arcos };
}

describe("dibujarCampo: el alcance estimado se ve rayado y con borde discontinuo", () => {
  it("rellena, raya dentro del círculo (clip) y cierra con un borde discontinuo", () => {
    const { ctx, llamadas, arcos } = ctxFalso();
    dibujarCampo(ctx, 100, 100, 60, "#3b82f6", 400, 300);
    expect(llamadas).toContain("fill");
    expect(llamadas).toContain("clip");
    expect(llamadas.filter((l) => l === "lineTo").length).toBeGreaterThan(5);
    expect(llamadas).toContain("dash:2");
    expect(arcos.every((r) => r === 60)).toBe(true);
  });
  it("un alcance diminuto no desaparece: queda un mínimo visible; uno enorme no recorre rayas fuera de pantalla", () => {
    const a = ctxFalso();
    dibujarCampo(a.ctx, 10, 10, 0.2, "#14b8a6", 400, 300);
    expect(a.arcos[0]).toBe(RADIO_MINIMO_PX);
    const b = ctxFalso();
    dibujarCampo(b.ctx, 200, 150, 1_000_000, "#f59e0b", 400, 300);
    expect(b.llamadas.filter((l) => l === "lineTo").length).toBeLessThan(200);
  });
});
