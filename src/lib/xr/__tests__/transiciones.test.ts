import { describe, expect, it } from "vitest";
import { DURACION_TOTAL_MAX_MS, MAX_DESPLAZAMIENTO_M, MAX_VELOCIDAD_MS, desplazamientoMax, ease, evaluar, planTransicion, retardoDeHermano, type EventoTransicion, type EstiloTransicion } from "../transiciones";

const EVENTOS: EventoTransicion[] = ["entrada", "foco", "desfoco", "despliegue", "pliegue", "cambio-capa", "salida", "confirmar"];
const ESTILOS: EstiloTransicion[] = ["minimas", "normales", "ricas"];

describe("curvas", () => {
  it("todas empiezan en 0 y acaban en 1", () => {
    for (const e of ["lineal", "salida-cubica", "entrada-salida", "resorte"] as const) {
      expect(ease(e, 0)).toBeCloseTo(0, 5);
      expect(ease(e, 1)).toBeCloseTo(1, 5);
    }
  });
  it("fuera de rango se acota y el resorte pasa de 1 y vuelve", () => {
    expect(ease("lineal", -3)).toBe(0);
    expect(ease("lineal", 9)).toBe(1);
    const maximo = Math.max(...Array.from({ length: 101 }, (_, i) => ease("resorte", i / 100)));
    expect(maximo).toBeGreaterThan(1.05);
  });
});

describe("planes", () => {
  it("cada evento en cada estilo empieza donde dice «desde» y acaba en «hasta»", () => {
    for (const ev of EVENTOS) for (const est of ESTILOS) {
      const p = planTransicion(ev, est);
      expect(evaluar(p, 0).opacidad).toBeCloseTo(p.desde.opacidad, 5);
      const fin = evaluar(p, p.ms);
      expect(fin.opacidad).toBeCloseTo(p.hasta.opacidad, 5);
      expect(fin.esc).toBeCloseTo(p.hasta.esc, 5);
      expect(fin.pos[2]).toBeCloseTo(p.hasta.pos[2], 3);
    }
  });
  it("las ricas duran más que las normales y éstas más que las mínimas", () => {
    for (const ev of EVENTOS) {
      const [m, n, r] = ESTILOS.map((e) => planTransicion(ev, e).ms);
      expect(m).toBeLessThan(n);
      expect(n).toBeLessThan(r);
    }
  });
  it("confort: nada se desplaza más de 25 cm ni a más de 1,5 m/s de media", () => {
    for (const ev of EVENTOS) for (const est of ESTILOS) {
      const p = planTransicion(ev, est);
      const d = Math.hypot(p.desde.pos[0] - p.hasta.pos[0], p.desde.pos[1] - p.hasta.pos[1], p.desde.pos[2] - p.hasta.pos[2]);
      expect(d).toBeLessThanOrEqual(MAX_DESPLAZAMIENTO_M + 1e-9);
      expect(d / (p.ms / 1000)).toBeLessThanOrEqual(MAX_VELOCIDAD_MS + 1e-6);
      expect(desplazamientoMax(p)).toBeLessThanOrEqual(MAX_DESPLAZAMIENTO_M + 1e-9);
    }
  });
  it("movimiento reducido: sólo se desvanece (sin desplazamiento ni escala) y en ≤ 120 ms", () => {
    for (const ev of EVENTOS) for (const est of ESTILOS) {
      const p = planTransicion(ev, est, { movimientoReducido: true });
      expect(p.ms).toBeLessThanOrEqual(120);
      expect(p.desde.pos).toEqual([0, 0, 0]);
      expect(p.hasta.pos).toEqual([0, 0, 0]);
      expect(p.desde.esc).toBe(1);
      expect(p.hasta.esc).toBe(1);
      expect(p.escalonMs).toBe(0);
    }
  });
  it("la entrada no se queda a medias: opacidad creciente de 0 a 1", () => {
    const p = planTransicion("entrada", "normales");
    const o = Array.from({ length: 11 }, (_, i) => evaluar(p, (p.ms * i) / 10).opacidad);
    expect(o[0]).toBe(0);
    expect(o[10]).toBe(1);
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThanOrEqual(o[i - 1] - 1e-9);
  });
  it("el foco adelanta el panel 2 cm y lo ilumina; el desfoco lo devuelve", () => {
    const f = planTransicion("foco", "normales");
    expect(f.hasta.pos[2]).toBeCloseTo(0.02, 3);
    expect(f.hasta.brillo).toBe(1);
    expect(planTransicion("desfoco", "normales").hasta.brillo).toBe(0);
  });
  it("la escala de distancia reduce el recorrido (paneles pequeños, menos movimiento)", () => {
    const grande = planTransicion("entrada", "normales");
    const chico = planTransicion("entrada", "normales", { escalaDistancia: 0.5 });
    expect(desplazamientoMax(chico)).toBeLessThan(desplazamientoMax(grande));
  });
});

describe("escalonado de hermanos", () => {
  it("el último hermano de una lista larga nunca pasa del tope total de 700 ms", () => {
    for (const est of ESTILOS) {
      const p = planTransicion("entrada", est);
      for (const n of [1, 2, 6, 12, 40]) expect(retardoDeHermano(p, n - 1, n) + p.ms).toBeLessThanOrEqual(DURACION_TOTAL_MAX_MS);
    }
  });
  it("sin escalonado (mínimas) todos entran a la vez", () => {
    expect(retardoDeHermano(planTransicion("entrada", "minimas"), 5, 6)).toBe(0);
  });
  it("el orden se respeta: cada hermano entra después o a la vez que el anterior", () => {
    const p = planTransicion("despliegue", "normales");
    const r = Array.from({ length: 8 }, (_, i) => retardoDeHermano(p, i, 8));
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });
});
