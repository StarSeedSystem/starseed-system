import { describe, it, expect } from "vitest";
import { planificar, type Peticion } from "../bolsa";
import type { OfertaNeurona } from "../oferta";
const ahora = new Date(2026, 9, 20, 12, 0, 0).getTime();
const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "nodo-a", cuentaId: "cuenta-1", medio: "wifi",
  computo: { nucleos: 8, ramLibreMb: 4096, gpu: true, vramMb: 8192, motores: ["imagen"] },
  almacen: { prestaMb: 2048, volumenes: ["app-1"] },
  apps: [{ id: "editor", version: "1.0" }],
  enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 8 } },
  energia: { bateriaPct: 90, cargando: true, enUso: false },
  presta: { cuenta: true, grupos: ["grupo-1"], publico: false, topes: { cpuPct: 50, ramMb: 2048, discoMb: 1024, soloCargando: false } },
  t: ahora, ...o,
});
const publica = (nodoId: string, extra: Partial<OfertaNeurona> = {}): OfertaNeurona =>
  oferta({ nodoId, cuentaId: "cuenta-2", presta: { ...oferta().presta, cuenta: false, publico: true }, ...extra });
const peticion = (partes: Peticion["partes"], privado = false): Peticion => ({
  id: "p-1", contexto: { tipo: "cuenta", id: "cuenta-1", privado }, partes,
});
describe("planificar · privacidad", () => {
  it("lo privado usa la misma cuenta y descarta vecinos públicos y nube", () => {
    const p = peticion([{ clase: "computo", necesita: { ramMb: 512 } }], true);
    const plan = planificar(p, [publica("nodo-publico"), oferta({ nodoId: "nodo-nube", medio: "nube-compartida" }), oferta({ nodoId: "nodo-propio" })]);
    expect(plan.partes[0].destino).toBe("nodo-propio");
    expect(planificar(p, [oferta({ nodoId: "nodo-cerebro", medio: "cerebro" })]).partes[0].destino).toBe("nodo-cerebro");
  });
  it("un grupo privado solo usa lo que prestan sus miembros", () => {
    const p: Peticion = {
      id: "p-grupo", contexto: { tipo: "grupo", id: "grupo-1", privado: true },
      partes: [{ clase: "computo", necesita: { ramMb: 512 } }],
    };
    const ajeno = oferta({ nodoId: "nodo-ajeno", cuentaId: "cuenta-2", presta: { ...oferta().presta, cuenta: false, grupos: ["otro"] } });
    const miembro = oferta({ nodoId: "nodo-miembro", cuentaId: "cuenta-2", presta: { ...oferta().presta, cuenta: false, grupos: ["grupo-1"] } });
    expect(planificar(p, [ajeno, miembro]).partes[0].destino).toBe("nodo-miembro");
  });
});
describe("planificar · latencia", () => {
  it("descarta enlaces lentos y explica la latencia que falta", () => {
    const p = peticion([{ clase: "ventana", necesita: { appId: "editor" }, latenciaMaxMs: 30 }]);
    const plan = planificar(p, [publica("nodo-lejos", { medio: "wan", enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 120 } } })]);
    expect(plan.partes[0].destino).toBe("nube");
    expect(plan.partes[0].motivo).toContain("30 ms");
    expect(plan.suelo?.falta).toContain("latencia ≤ 30 ms");
  });
  it("la red local no necesita latencia medida", () => {
    const p = peticion([{ clase: "ventana", necesita: { appId: "editor" }, latenciaMaxMs: 30 }]);
    const plan = planificar(p, [oferta({ enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 500 } } })]);
    expect(plan.partes[0].destino).toBe("nodo-a");
  });
});
describe("planificar · energía", () => {
  it("no usa una neurona en uso ni con batería baja sin cargador", () => {
    const p = peticion([{ clase: "bytes", necesita: { volumen: "app-1" } }]);
    const plan = planificar(p, [
      oferta({ nodoId: "nodo-uso", energia: { bateriaPct: 90, cargando: true, enUso: true } }),
      oferta({ nodoId: "nodo-bateria", energia: { bateriaPct: 5, cargando: false, enUso: false } }),
    ]);
    expect(plan.partes[0].destino).toBe("local");
    expect(plan.suelo).toBeDefined();
  });
});
describe("planificar · capacidad", () => {
  it("mide la capacidad prestable, no la que tiene la neurona", () => {
    const p = peticion([{ clase: "computo", necesita: { ramMb: 1024 } }]);
    const plan = planificar(p, [oferta({
      presta: {
        ...oferta().presta,
        topes: { cpuPct: 100, ramMb: 512, discoMb: 1024, soloCargando: false },
      },
    })]);
    expect(plan.partes[0].destino).toBe("nube");
    expect(plan.suelo?.falta).toContain("1024 MB de RAM");
  });
});
describe("planificar · coste", () => {
  it("prefiere la cuenta propia y desempata por nodoId", () => {
    const p = peticion([{ clase: "computo", necesita: { ramMb: 512 } }]);
    const plan = planificar(p, [
      publica("nodo-z"), oferta({ nodoId: "nodo-zz-propio" }), publica("nodo-a"),
    ]);
    expect(plan.partes[0].destino).toBe("nodo-zz-propio");
    expect(plan.partes[0].respaldo).toBe("nodo-a");
  });
});
describe("planificar · reparto", () => {
  it("ramifica una parte de cómputo que ninguna neurona cubre sola", () => {
    const media = (nodoId: string) => oferta({
      nodoId, presta: {
        ...oferta().presta,
        topes: { cpuPct: 100, ramMb: 512, discoMb: 1024, soloCargando: false },
      },
    });
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 1024 } }]), [media("nodo-b"), media("nodo-a")]);
    expect(plan.partes[0].destino).toBe("nodo-a");
    expect(plan.partes[0].fuentes).toEqual(["nodo-a", "nodo-b"]);
    expect(plan.partes[0].motivo).toContain("Reparto");
    expect(plan.suelo).toBeUndefined();
  });
});
describe("planificar · suelo", () => {
  it("un móvil sin recursos abre una app pesada en local o web y dice qué falta", () => {
    const p: Peticion = {
      id: "p-movil", contexto: { tipo: "cuenta", id: "cuenta-1", privado: true },
      partes: [{ clase: "computo", necesita: { ramMb: 4096, appId: "editor" } }],
    };
    const plan = planificar(p, []);
    expect(plan.suelo?.destino).toBe("local");
    expect(plan.suelo?.falta).toEqual(["4096 MB de RAM", "app editor"]);
    expect(plan.partes[0].motivo).toContain("local o en la web");
  });
});
describe("planificar · determinismo", () => {
  it("mismas ofertas en distinto orden dan el mismo plan", () => {
    const p = peticion([{ clase: "computo", necesita: { ramMb: 512 } }]);
    const a = oferta({ nodoId: "nodo-a" }), b = oferta({ nodoId: "nodo-b" });
    expect(planificar(p, [a, b])).toEqual(planificar(p, [b, a]));
    expect(planificar(p, [b, a]).partes[0].destino).toBe("nodo-a");
  });
});
