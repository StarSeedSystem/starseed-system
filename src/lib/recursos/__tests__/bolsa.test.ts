import { describe, it, expect } from "vitest";
import { planificar, type Parte, type Peticion } from "../bolsa";
import type { OfertaNeurona } from "../oferta";

const AHORA = new Date(2026, 9, 20, 12, 0, 0).getTime();
const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "nodo-a", cuentaId: "cuenta-1", medio: "wifi",
  computo: { nucleos: 8, ramLibreMb: 4096, gpu: true, vramMb: 8192, motores: ["imagen"] },
  almacen: { prestaMb: 2048, volumenes: ["app-1"] },
  apps: [{ id: "editor", version: "1.0" }],
  enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 8 } },
  energia: { bateriaPct: 90, cargando: true, enUso: false },
  presta: { cuenta: true, grupos: ["grupo-1"], publico: false, topes: { cpuPct: 50, ramMb: 2048, discoMb: 1024, soloCargando: false } },
  t: AHORA, ...o,
});
const presta = (extra: Partial<OfertaNeurona["presta"]> = {}): OfertaNeurona["presta"] => ({ ...oferta().presta, ...extra });
const publica = (nodoId: string, extra: Partial<OfertaNeurona> = {}): OfertaNeurona =>
  oferta({ nodoId, cuentaId: "cuenta-2", presta: presta({ cuenta: false, grupos: [], publico: true }), ...extra });
const peticion = (partes: Parte[], privado = false): Peticion =>
  ({ id: "p-1", contexto: { tipo: "cuenta", id: "cuenta-1", privado }, partes });

describe("regla 1 · permisos y privacidad", () => {
  it("lo privado usa la cuenta propia y descarta públicos y nube compartida", () => {
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 512 } }], true), [
      publica("nodo-publico"),
      oferta({ nodoId: "nodo-nube", medio: "nube-compartida", presta: presta({ cuenta: false, grupos: [], publico: false }) }),
      oferta({ nodoId: "nodo-propio" }),
    ]);
    expect(plan.partes[0].destino).toBe("nodo-propio");
    expect(plan.partes[0].motivo).toContain("cuenta propia");
  });
  it("acepta servidores del cerebro en lo privado", () => {
    const cerebro = oferta({ nodoId: "nodo-cerebro", cuentaId: "c9", medio: "servidor-cerebro", presta: presta({ cuenta: false, grupos: [], publico: false }) });
    expect(planificar(peticion([{ clase: "computo", necesita: { ramMb: 512 } }], true), [cerebro]).partes[0].destino).toBe("nodo-cerebro");
  });
  it("un grupo privado solo usa lo que prestan sus miembros", () => {
    const grupo: Peticion = { id: "p-g", contexto: { tipo: "grupo", id: "grupo-1", privado: true }, partes: [{ clase: "computo", necesita: { ramMb: 512 } }] };
    const miembro = oferta({ nodoId: "nodo-miembro", cuentaId: "cuenta-2", presta: presta({ cuenta: false, grupos: ["grupo-1"], publico: false }) });
    const ajeno = oferta({ nodoId: "nodo-ajeno", cuentaId: "cuenta-3", presta: presta({ cuenta: false, grupos: ["otro"], publico: false }) });
    expect(planificar(grupo, [ajeno, miembro]).partes[0].destino).toBe("nodo-miembro");
  });
});

describe("regla 2 · latencia", () => {
  it("descarta enlaces lentos y dice la latencia que falta", () => {
    const plan = planificar(peticion([{ clase: "ventana", necesita: { appId: "editor" }, latenciaMaxMs: 30 }]), [
      publica("nodo-lejos", { medio: "wan", enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 120 } } }),
    ]);
    expect(plan.partes[0].destino).toBe("nube");
    expect(plan.partes[0].motivo).toContain("30 ms");
    expect(plan.suelo?.falta).toContain("latencia ≤ 30 ms");
  });
  it("la red local no necesita latencia medida", () => {
    const plan = planificar(peticion([{ clase: "ventana", necesita: { appId: "editor" }, latenciaMaxMs: 30 }]), [
      oferta({ enlaces: { subidaKbps: 4000, bajadaKbps: 4000, latenciaMs: { "nodo-x": 500 } } }),
    ]);
    expect(plan.partes[0].destino).toBe("nodo-a");
  });
});

describe("regla 3 · energía", () => {
  it("no usa una neurona en uso ni con batería baja sin cargador", () => {
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 512 } }]), [
      oferta({ nodoId: "nodo-uso", energia: { bateriaPct: 90, cargando: true, enUso: true } }),
      oferta({ nodoId: "nodo-bateria", energia: { bateriaPct: 5, cargando: false, enUso: false } }),
    ]);
    expect(plan.partes[0].destino).toBe("nube");
    expect(plan.suelo).toBeDefined();
  });
});

describe("regla 4 · capacidad prestable", () => {
  it("mide lo que presta y no lo que tiene la neurona", () => {
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 1024 } }]), [
      oferta({ presta: presta({ topes: { cpuPct: 100, ramMb: 512, discoMb: 1024, soloCargando: false } }) }),
    ]);
    expect(plan.partes[0].destino).toBe("nube");
    expect(plan.suelo?.falta).toContain("1024 MB de RAM");
  });
});

describe("regla 5 · coste y determinismo", () => {
  it("prefiere lo propio y desempata por latencia y nodoId", () => {
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 512 } }]), [
      publica("nodo-z"), oferta({ nodoId: "nodo-zz-propio" }), publica("nodo-a"),
    ]);
    expect(plan.partes[0].destino).toBe("nodo-zz-propio");
    expect(plan.partes[0].respaldo).toBe("nodo-a");
  });
  it("mismas ofertas en otro orden dan el mismo plan", () => {
    const p = peticion([{ clase: "computo", necesita: { ramMb: 512 } }]);
    const a = oferta({ nodoId: "nodo-a" }), b = oferta({ nodoId: "nodo-b" });
    expect(planificar(p, [a, b])).toEqual(planificar(p, [b, a]));
    expect(planificar(p, [b, a]).partes[0].destino).toBe("nodo-a");
  });
});

describe("regla 6 · reparto", () => {
  const media = (nodoId: string) => oferta({ nodoId, presta: presta({ topes: { cpuPct: 100, ramMb: 512, discoMb: 1024, soloCargando: false } }) });
  it("ramifica el cálculo que ninguna neurona cubre sola", () => {
    const plan = planificar(peticion([{ clase: "computo", necesita: { ramMb: 1024 } }]), [media("nodo-b"), media("nodo-a")]);
    expect(plan.partes[0].fuentes).toEqual(["nodo-a", "nodo-b"]);
    expect(plan.partes[0].motivo).toContain("Reparto");
    expect(plan.suelo).toBeUndefined();
  });
  it("trae las bandas de un volumen desde varias fuentes", () => {
    const banda = (nodoId: string) => oferta({ nodoId, almacen: { prestaMb: 300, volumenes: ["app-1"] }, presta: presta({ topes: { cpuPct: 50, ramMb: 1024, discoMb: 300, soloCargando: false } }) });
    const plan = planificar(peticion([{ clase: "bytes", necesita: { volumen: 500, appId: "app-1" } }]), [banda("nodo-b"), banda("nodo-a")]);
    expect(plan.partes[0].fuentes).toEqual(["nodo-a", "nodo-b"]);
    expect(plan.partes[0].enlace).toBe("wifi");
  });
});

describe("regla 7 · suelo", () => {
  it("un móvil sin recursos abre la app pesada en local y dice qué falta", () => {
    const movil: Peticion = { id: "p-movil", contexto: { tipo: "cuenta", id: "cuenta-movil", privado: true }, partes: [{ clase: "computo", necesita: { ramMb: 4096, appId: "editor" } }] };
    const plan = planificar(movil, []);
    expect(plan.suelo?.destino).toBe("local");
    expect(plan.suelo?.falta).toEqual(["4096 MB de RAM", "app editor"]);
    expect(plan.partes[0].motivo).toContain("local o en la web");
  });
  it("nunca deja el suelo vacío", () => {
    expect(planificar(peticion([{ clase: "computo", necesita: {} }]), []).suelo?.falta).toEqual(["recursos de computo"]);
  });
});
