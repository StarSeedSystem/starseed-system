import { describe, expect, it, vi } from "vitest";
import { dibujarParche, RADIO_PARCHE_PX } from "../capa-parches";

function ctxFalso() {
  const llamadas: string[] = [];
  const g = { addColorStop: vi.fn() };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => (k === "createRadialGradient" ? (...a: number[]) => { llamadas.push(`grad:${a.join(",")}`); return g; } : typeof o[k] !== "undefined" ? o[k] : (...a: unknown[]) => { llamadas.push(k + (k === "arc" ? `:${a[2]}` : "")); }),
    set: (o, k: string, v) => { o[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, llamadas, g };
}

describe("dibujarParche", () => {
  it("relleno: degradado de tamaño fijo en píxeles que se apaga hacia el borde", () => {
    const { ctx, llamadas, g } = ctxFalso();
    dibujarParche(ctx, 10, 20, { color: "#22c55e", estilo: "relleno" });
    expect(llamadas[0]).toBe(`grad:10,20,0,10,20,${RADIO_PARCHE_PX}`);
    expect(g.addColorStop.mock.calls.at(-1)?.[1]).toMatch(/,0\)$/);
    expect(llamadas).toContain("fill");
  });

  it("hueco: contorno discontinuo, sin relleno de color", () => {
    const { ctx, llamadas } = ctxFalso();
    dibujarParche(ctx, 0, 0, { color: "#94a3b8", estilo: "hueco" });
    expect(llamadas).toContain("setLineDash");
    expect(llamadas).toContain("stroke");
    expect(llamadas.some((l) => l.startsWith("grad"))).toBe(false);
  });

  it("anillo: contorno continuo fino", () => {
    const { ctx, llamadas } = ctxFalso();
    dibujarParche(ctx, 0, 0, { color: "#ef4444", estilo: "anillo" });
    expect(llamadas).toContain("stroke");
    expect(llamadas.some((l) => l.startsWith("grad"))).toBe(false);
  });
});
