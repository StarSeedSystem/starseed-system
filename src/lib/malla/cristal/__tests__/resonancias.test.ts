import { describe, it, expect } from "vitest";
import { CONFIANZA_INICIAL, actualizarConfianza, decisionPorResonancia } from "../resonancias";

describe("CONFIANZA_INICIAL", () => {
  it("es 0.5", () => expect(CONFIANZA_INICIAL).toBe(0.5));
});

describe("actualizarConfianza", () => {
  const casos: Array<[string, number, number]> = [
    ["firma-ok", 0.5, 0.52], ["firma-ok", 0.99, 1],
    ["firma-mala", 0.5, 0.2], ["trama-corrupta", 0.5, 0.35],
    ["veredicto-confirmado", 0.5, 0.55], ["veredicto-desmentido", 0.5, 0.3],
  ];
  casos.forEach(([ev, c, r]) => it(ev, () => expect(actualizarConfianza(c, ev as 'firma-ok' | 'firma-mala' | 'trama-corrupta' | 'veredicto-confirmado' | 'veredicto-desmentido')).toBe(r)));
  it("recorta a 0", () => expect(actualizarConfianza(0.1, "firma-mala")).toBe(0));
  it("recorta a 1", () => expect(actualizarConfianza(0.99, "veredicto-confirmado")).toBe(1));
});

describe("decisionPorResonancia", () => {
  const v = (items: Array<{hash:string;nivel:'limpio'|'sospechoso'|'peligroso';nodo:string;cuenta:string;firmaOk:boolean;t:number}>) =>
    items.map(i => ({hash:i.hash, nivel:i.nivel, nodo:i.nodo, cuenta:i.cuenta, firmaOk:i.firmaOk, t:i.t}));
  const conf = { n1:0.8, n2:0.9 };
  it("cuarentena >=2 cuentas peligroso", () => {
    const res = v([{hash:"h1",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h1",nivel:"peligroso",nodo:"n2",cuenta:"cB",firmaOk:true,t:2}]);
    const d = decisionPorResonancia("h1", res, conf);
    expect(d.decision).toBe("cuarentena"); expect(d.cuentas).toBe(2); expect(d.motivo).toContain("Cuarentena");
  });
  it("aviso 1 cuenta peligroso", () => {
    const res = v([{hash:"h2",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1}]);
    const d = decisionPorResonancia("h2", res, conf);
    expect(d.decision).toBe("aviso"); expect(d.motivo).toContain("1 cuenta");
  });
  it("aviso >=2 cuentas sospechoso", () => {
    const res = v([{hash:"h3",nivel:"sospechoso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h3",nivel:"sospechoso",nodo:"n2",cuenta:"cB",firmaOk:true,t:2}]);
    const d = decisionPorResonancia("h3", res, conf);
    expect(d.decision).toBe("aviso"); expect(d.motivo).toContain("2 cuentas");
  });
  it("limpio >=2 cuentas limpio", () => {
    const res = v([{hash:"h4",nivel:"limpio",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h4",nivel:"limpio",nodo:"n2",cuenta:"cB",firmaOk:true,t:1}]);
    const d = decisionPorResonancia("h4", res, conf);
    expect(d.decision).toBe("limpio"); expect(d.motivo).toContain("Limpio");
  });
  it("sin-datos vacío", () => {
    const d = decisionPorResonancia("h5", [], conf);
    expect(d.decision).toBe("sin-datos"); expect(d.cuentas).toBe(0);
  });
  it("ignora otro hash", () => {
    const res = v([{hash:"otro",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1}]);
    expect(decisionPorResonancia("h5", res, conf).decision).toBe("sin-datos");
  });
  it("ignora sin firmaOk", () => {
    const res = v([{hash:"h6",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:false,t:1}]);
    expect(decisionPorResonancia("h6", res, conf).decision).toBe("sin-datos");
  });
  it("ignora confianza baja", () => {
    const res = v([{hash:"h7",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1}]);
    expect(decisionPorResonancia("h7", res, {n1:0.1}).decision).toBe("sin-datos");
  });
  it("una cuenta 10 nodos no es cuarentena", () => {
    const res = v([{hash:"h8",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h8",nivel:"peligroso",nodo:"n2",cuenta:"cA",firmaOk:true,t:2},{hash:"h8",nivel:"peligroso",nodo:"n3",cuenta:"cA",firmaOk:true,t:3}]);
    const d = decisionPorResonancia("h8", res, conf);
    expect(d.decision).toBe("aviso"); expect(d.cuentas).toBe(1);
  });
  it("más reciente por nodo", () => {
    const res = v([{hash:"h9",nivel:"limpio",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h9",nivel:"peligroso",nodo:"n1",cuenta:"cA",firmaOk:true,t:2}]);
    expect(decisionPorResonancia("h9", res, conf).decision).toBe("aviso");
  });
  it("un voto por cuenta toma más reciente", () => {
    const res = v([{hash:"h10",nivel:"limpio",nodo:"n1",cuenta:"cA",firmaOk:true,t:1},{hash:"h10",nivel:"peligroso",nodo:"n2",cuenta:"cA",firmaOk:true,t:2}]);
    expect(decisionPorResonancia("h10", res, conf).decision).toBe("aviso");
  });
});
