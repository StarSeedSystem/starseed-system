import { describe, expect, it } from "vitest";
import { planificar, type ContextoPeticion, type PartePeticion, type Peticion } from "../bolsa";
import type { OfertaNeurona } from "../oferta";

const T = new Date(2026, 9, 27, 12, 0, 0).getTime();
const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1", cuentaId: "cuentaA", medio: "local",
  computo: { nucleos: 8, ramLibreMb: 8192, gpu: true, vramMb: 4096, motores: ["imagen"] },
  almacen: { prestaMb: 4096, volumenes: ["v1"] },
  apps: [{ id: "editor", version: "1" }],
  enlaces: { subidaKbps: 1000, bajadaKbps: 1000, latenciaMs: { n1: 3 } },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 8192, discoMb: 4096, soloCargando: false } },
  t: T, ...o,
});
const tope = (t: Partial<OfertaNeurona["presta"]["topes"]>) => ({ ...oferta().presta.topes, ...t });
const presta = (p: Partial<OfertaNeurona["presta"]>) => ({ ...oferta().presta, ...p });
const pide = (contexto: ContextoPeticion, parte: PartePeticion): Peticion => ({ id: "p", contexto, partes: [parte] });
const ctx = (privado: boolean, tipo: ContextoPeticion["tipo"] = "cuenta", id = "cuentaA"): ContextoPeticion => ({ tipo, id, privado });

describe("planificar", () => {
  it("lo privado no usa vecinos públicos ni la nube compartida", () => {
    const res = planificar(pide(ctx(true), { clase: "computo", necesita: { ramMb: 1024 } }), [
      oferta({ nodoId: "vecino", cuentaId: "cuentaB", presta: presta({ cuenta: false, publico: true }) }),
      oferta({ nodoId: "nube", cuentaId: "cuentaB", medio: "nube", presta: presta({ cuenta: false, publico: true }) }),
    ]);
    expect(res.partes[0].destino).toBe("local");
    expect(res.suelo?.destino).toBe("local");
    expect(res.suelo?.falta[0]).toContain("computo");
  });

  it("lo privado sí usa la misma cuenta y los servidores del cerebro", () => {
    const res = planificar(pide(ctx(true), { clase: "computo", necesita: { ramMb: 512 } }), [
      oferta({ nodoId: "a-propia" }),
      oferta({ nodoId: "z-cerebro", cuentaId: "otra", presta: presta({ cuenta: false, publico: false }) }),
    ], { servidoresCerebro: ["z-cerebro"] });
    expect(res.partes[0].destino).toBe("a-propia");
    expect(res.partes[0].respaldo).toBe("z-cerebro");
  });

  it("un grupo privado usa a sus miembros, nunca a un vecino público ajeno", () => {
    const res = planificar(pide(ctx(true, "grupo", "g1"), { clase: "computo", necesita: { ramMb: 512 } }), [
      oferta({ nodoId: "miembro", cuentaId: "cuentaB", presta: presta({ cuenta: false, grupos: ["g1"], publico: false }) }),
      oferta({ nodoId: "ajeno", cuentaId: "cuentaC", presta: presta({ cuenta: false, grupos: [], publico: true }) }),
    ]);
    expect(res.partes[0].destino).toBe("miembro");
  });

  it("la latencia descarta enlaces lentos o sin medir y deja el medido", () => {
    const res = planificar(pide(ctx(false), { clase: "ventana", necesita: { appId: "editor", ramMb: 512 }, latenciaMaxMs: 10 }), [
      oferta({ nodoId: "lento", medio: "wifi", enlaces: { ...oferta().enlaces, latenciaMs: { n1: 40 } } }),
      oferta({ nodoId: "sin-medir", medio: "wifi", enlaces: { ...oferta().enlaces, latenciaMs: {} } }),
      oferta({ nodoId: "rapido", medio: "wifi", enlaces: { ...oferta().enlaces, latenciaMs: { n2: 20, n1: 8 } } }),
    ]);
    expect(res.partes[0].destino).toBe("rapido");
    expect(res.partes[0].enlace).toBe("n1");
  });

  it("la energía descarta batería baja sin cargador", () => {
    const res = planificar(pide(ctx(false), { clase: "computo", necesita: { ramMb: 512 } }), [
      oferta({ nodoId: "bateria", energia: { bateriaPct: 10, cargando: false, enUso: false } }),
      oferta({ nodoId: "enchufada", energia: { bateriaPct: 10, cargando: true, enUso: false } }),
    ]);
    expect(res.partes[0].destino).toBe("enchufada");
  });

  it("la capacidad es lo que se presta, no lo que se tiene", () => {
    const res = planificar(pide(ctx(false), { clase: "computo", necesita: { ramMb: 4096 } }), [
      oferta({ nodoId: "grande", computo: { ...oferta().computo, ramLibreMb: 16384 }, presta: presta({ topes: tope({ ramMb: 512 }) }) }),
    ]);
    expect(res.partes[0].destino).toBe("nube");
    expect(res.suelo?.falta.join(" ")).toContain("4096 MB");
  });

  it("primero lo propio y gratuito; los empates por nodoId", () => {
    const parte = { clase: "computo" as const, necesita: { ramMb: 256 } };
    const publico = (nodoId: string) => oferta({ nodoId, cuentaId: "cuentaB", presta: presta({ cuenta: false, publico: true }) });
    const conPropia = planificar(pide(ctx(false), parte), [publico("a-vecino"), oferta({ nodoId: "propia" }), publico("b-vecino")]);
    expect(conPropia.partes[0].destino).toBe("propia");
    const nube = oferta({ nodoId: "nube", cuentaId: "otra", medio: "nube", presta: presta({ cuenta: false, publico: true }) });
    const sinPropia = planificar(pide(ctx(false), parte), [publico("b-vecino"), nube, publico("a-vecino")]);
    expect(sinPropia.partes[0].destino).toBe("a-vecino");
  });

  it("reparte los bytes entre varias fuentes si una sola no basta", () => {
    const res = planificar(pide(ctx(false), { clase: "bytes", necesita: { volumen: 6000 } }), [oferta({ nodoId: "n1" }), oferta({ nodoId: "n2" })]);
    expect(res.partes[0].fuentes).toEqual(["n1", "n2"]);
    expect(res.partes[0].motivo).toContain("Se reparte");
  });

  it("el relevo exige subida medida y también se reparte", () => {
    const res = planificar(pide(ctx(false), { clase: "relevo", necesita: { kbps: 1500 } }), [
      oferta({ nodoId: "n1", enlaces: { ...oferta().enlaces, subidaKbps: 1000 } }),
      oferta({ nodoId: "n2", enlaces: { ...oferta().enlaces, subidaKbps: 1000 } }),
    ]);
    expect(res.partes[0].fuentes).toEqual(["n1", "n2"]);
  });

  it("un móvil sin recursos abre la app pesada en el suelo", () => {
    const movil = oferta({ nodoId: "movil", cuentaId: "movil", computo: { nucleos: 1, ramLibreMb: 512, gpu: false, vramMb: undefined, motores: [] }, almacen: { prestaMb: 0, volumenes: [] }, presta: presta({ topes: tope({ cpuPct: 10, ramMb: 256, discoMb: 0 }) }) });
    const res = planificar(pide(ctx(true, "cuenta", "movil"), { clase: "ventana", necesita: { appId: "editor", ramMb: 8192 } }), [movil]);
    expect(res.partes[0].destino).toBe("local");
    expect(res.suelo?.destino).toBe("local");
    expect(res.suelo?.falta.join(" ")).toContain("editor");
  });

  it("sin recursos y sin privacidad, el suelo es la web", () => {
    const res = planificar(pide(ctx(false, "publicacion", "pub1"), { clase: "bytes", necesita: { volumen: 10 } }), []);
    expect(res.suelo?.destino).toBe("nube");
  });
});
