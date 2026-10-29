import { describe, it, expect } from "vitest";
import { propuestasDesdeFondo, pedidoParaIA } from "../rediseno-desde-fondo";
import type { EntradaRediseno } from "../rediseno-desde-fondo";
import type { ThemeTokens } from "../theme-engine";
import { luminanciaDe } from "../paleta-fondo";

const TEMA: ThemeTokens = {
  vars: { "background-hsl": "210 40% 8%", "primary-hsl": "200 100% 50%", "accent-hsl": "45 100% 50%" },
  materialClass: "ss-crystal",
  background: "spline",
  fontFamily: "Inter",
  motion: 1,
};
const PALETA = [
  { color: "#0a0e27", peso: 0.5 },
  { color: "#ff206e", peso: 0.3 },
  { color: "#41ead4", peso: 0.2 },
];
const ENTRADA: EntradaRediseno = {
  paleta: PALETA,
  temaActual: TEMA,
  modo: "oscuro",
  adn: { identidad: "Astraura", registroMovimiento: "sobrio" },
};

function hslAHex(hsl: string): string {
  const [h, s, l] = hsl.split(" ").map((v) => Number.parseFloat(v));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return (l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255;
  };
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
function ratio(a: string, b: string): number {
  const x = luminanciaDe(a), y = luminanciaDe(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("rediseno-desde-fondo", () => {
  it("devuelve las tres propuestas en orden, con motivo y contraste AA", () => {
    const props = propuestasDesdeFondo(ENTRADA);
    expect(props.map((p) => p.nombre)).toEqual(["sobria", "armonica", "atrevida"]);
    for (const p of props) {
      expect(p.motivo).toContain("cristal al");
      expect(p.motivo).toContain("escala φ");
      expect(p.contraste.texto).toBeGreaterThanOrEqual(4.5);
      expect(p.contraste.textoSuave).toBeGreaterThanOrEqual(4.5);
    }
  });
});
