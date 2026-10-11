import { describe, expect, it } from "vitest";
import { MAX_REGISTRO, avanzar, bucleInicial, indicadorVisible, type EstadoBucle } from "../bucle";
import type { Decision } from "../permisos";

const SI: Decision = { permitido: true, requiere: "nada", motivo: "ok", indicador: true };
const CONFIRMAR: Decision = { permitido: false, requiere: "confirmacion", motivo: "confirma", indicador: false };
const NUNCA: Decision = { permitido: false, requiere: "nunca", motivo: "no", indicador: false };
const NAV = { tipo: "navegar" as const, args: { ruta: "/hub" } };

describe("sentidos", () => {
  it("un sentido solo se enciende con permiso y el indicador sigue encendido mientras dure", () => {
    let e = bucleInicial("b1");
    e = avanzar(e, { tipo: "observar", sentido: "camara", decision: NUNCA, at: 1 });
    expect(indicadorVisible(e)).toBe(false);
    expect(e.registro.at(-1)?.tipo).toBe("sentido-denegado");
    e = avanzar(e, { tipo: "observar", sentido: "pantalla", decision: SI, at: 2 });
    expect(indicadorVisible(e) && e.fase === "observando").toBe(true);
    e = avanzar(e, { tipo: "soltar", sentido: "pantalla", at: 3 });
    expect(indicadorVisible(e)).toBe(false);
    expect(e.fase).toBe("reposo");
  });
});

describe("proponer → actuar", () => {
  it("lo que pide confirmación espera a una persona y luego se aplica con su deshacer", () => {
    let e: EstadoBucle = avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: CONFIRMAR, at: 1 });
    expect(e.fase).toBe("esperando");
    expect(avanzar(e, { tipo: "aplicada", previo: { ruta: "/" }, at: 2 })).toBe(e); // no se aplica sin confirmar
    e = avanzar(e, { tipo: "confirmar", quien: "cuenta-A", at: 3 });
    expect(e.fase).toBe("actuando");
    e = avanzar(e, { tipo: "aplicada", previo: { ruta: "/inicio" }, at: 4 });
    expect(e.fase).toBe("hecho");
    expect(e.ultimaAplicada?.deshacer).toEqual({ accion: { tipo: "navegar", args: { ruta: "/inicio" } } });
    expect(e.registro.map((r) => r.tipo)).toEqual(["propuesta", "confirmada", "aplicada"]);
    expect(e.registro[1].quien).toBe("cuenta-A");
  });
  it("lo permitido actúa sin esperar; lo prohibido se rechaza y queda anotado", () => {
    expect(avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: SI, at: 1 }).fase).toBe("actuando");
    const r = avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: NUNCA, at: 1 });
    expect(r.fase).toBe("rechazado");
    expect(r.pendiente).toBeUndefined();
    expect(r.registro.map((x) => x.tipo)).toEqual(["propuesta", "rechazada"]);
  });
  it("una propuesta a la vez", () => {
    const e = avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: CONFIRMAR, at: 1 });
    expect(avanzar(e, { tipo: "proponer", accion: NAV, decision: SI, at: 2 })).toBe(e);
  });
  it("un fallo vuelve a reposo y se anota", () => {
    let e = avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: SI, at: 1 });
    e = avanzar(e, { tipo: "fallo", motivo: "sin red", at: 2 });
    expect(e.fase).toBe("reposo");
    expect(e.registro.at(-1)).toMatchObject({ tipo: "fallo", motivo: "sin red" });
  });
  it("deshacer usa lo guardado y lo anota con quién lo pidió", () => {
    let e = avanzar(bucleInicial("b1"), { tipo: "proponer", accion: NAV, decision: SI, at: 1 });
    e = avanzar(e, { tipo: "aplicada", previo: { ruta: "/a" }, at: 2 });
    e = avanzar(e, { tipo: "deshacer", quien: "cuenta-A", at: 3 });
    expect(e.ultimaAplicada).toBeUndefined();
    expect(e.registro.at(-1)).toMatchObject({ tipo: "deshecha", quien: "cuenta-A" });
  });
});

describe("pausa y registro", () => {
  it("pausar apaga todos los sentidos y suelta lo pendiente", () => {
    let e = avanzar(bucleInicial("b1"), { tipo: "observar", sentido: "microfono", decision: SI, at: 1 });
    e = avanzar(e, { tipo: "proponer", accion: NAV, decision: CONFIRMAR, at: 2 });
    e = avanzar(e, { tipo: "pausar", quien: "cuenta-A", at: 3 });
    expect(indicadorVisible(e)).toBe(false);
    expect(e.pendiente).toBeUndefined();
    expect(e.fase).toBe("reposo");
  });
  it("el registro no crece sin límite", () => {
    let e = bucleInicial("b1");
    for (let i = 0; i < MAX_REGISTRO + 20; i++) e = avanzar(e, { tipo: "observar", sentido: "camara", decision: NUNCA, at: i });
    expect(e.registro.length).toBe(MAX_REGISTRO);
    expect(e.registro[0].at).toBe(20);
  });
});
