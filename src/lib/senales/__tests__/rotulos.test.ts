import { describe, expect, it } from "vitest";
import { cajaDeRotulo, colocarRotulos, type Rotulo } from "../rotulos";

const r = (id: string, x: number, y: number, texto: string, prioridad = 50, o: Partial<Rotulo> = {}): Rotulo => ({ id, x, y, texto, tam: 2.4, prioridad, ...o });
const ids = (m: Map<string, unknown>) => [...m.keys()].sort();

describe("rótulos del plano sin taparse", () => {
  it("lo que no choca se dibuja entero y en su sitio", () => {
    const m = colocarRotulos([r("a", 20, 20, "Uno"), r("b", 70, 70, "Dos")]);
    expect(ids(m)).toEqual(["a", "b"]);
    expect(m.get("a")).toEqual({ x: 20, y: 20, anclaje: "middle" });
  });

  it("de dos rótulos que se pisan, gana el de mayor prioridad", () => {
    const m = colocarRotulos([r("bajo", 50, 50, "Aparato que se pisa", 10), r("alto", 52, 50.5, "Otro aparato", 70)]);
    expect(ids(m)).toEqual(["alto"]);
  });

  it("a igual prioridad manda el orden recibido (determinista)", () => {
    const a = colocarRotulos([r("a", 50, 50, "Texto largo uno"), r("b", 50, 50, "Texto largo dos")]);
    const b = colocarRotulos([r("a", 50, 50, "Texto largo uno"), r("b", 50, 50, "Texto largo dos")]);
    expect(ids(a)).toEqual(["a"]);
    expect([...b]).toEqual([...a]);
  });

  it("si su sitio natural está ocupado, prueba las alternativas por orden", () => {
    const m = colocarRotulos([
      r("primero", 50, 50, "Ocupa el centro", 90),
      r("segundo", 50, 50, "Otro aparato", 70, { alternativas: [{ x: 50, y: 52, anclaje: "middle" }, { x: 50, y: 80, anclaje: "middle" }] }),
    ]);
    expect(m.get("segundo")).toEqual({ x: 50, y: 80, anclaje: "middle" });
  });

  it("lo elegido o apuntado (prioridad ≥ 100) se dibuja siempre y los demás se apartan", () => {
    const m = colocarRotulos([r("normal", 50, 50, "Aparato", 90), r("elegido", 50, 50, "Elegido", 100)]);
    expect(ids(m)).toEqual(["elegido"]);
  });

  it("una zona reservada aparta el rótulo, salvo que sea forzado", () => {
    const reservada = [{ x0: 40, x1: 60, y0: 44, y1: 54 }];
    expect(colocarRotulos([r("a", 50, 50, "Cerca del centro")], reservada).size).toBe(0);
    expect(colocarRotulos([r("a", 50, 50, "Cerca del centro", 100)], reservada).size).toBe(1);
  });

  it("el anclaje cambia hacia dónde crece la caja", () => {
    const base = { texto: "abcdef", tam: 2.4 };
    expect(cajaDeRotulo(base, { x: 50, y: 50, anclaje: "end" }).x1).toBeLessThanOrEqual(51);
    expect(cajaDeRotulo(base, { x: 50, y: 50, anclaje: "start" }).x0).toBeGreaterThanOrEqual(49);
  });
});
