import { describe, it, expect } from "vitest";
import { comoAbrir, modosDe, AppEjecutable } from "../modos-app";
import { OfertaNeurona } from "../oferta";
import { ResultadoPlanificacion } from "../bolsa";

const baseOferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ["imagen", "voz"] },
  almacen: { prestaMb: 1024, volumenes: ["v1"] },
  apps: [{ id: "app", version: "1" }],
  enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: {} },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
  t: Date.now(),
  ...o,
});

const planConPartes = (
  partes: ResultadoPlanificacion["porParte"]
): ResultadoPlanificacion => ({ porParte: partes });

describe("modosDe", () => {
  it("sin campo devuelto ejecucion = ['local'] (como hoy)", () => {
    const app: AppEjecutable = { id: "a1" };
    expect(modosDe(app)).toEqual(["local"]);
  });
});

describe("comoAbrir", () => {
  it("sin campo ejecucion ni requisitos abre en local (comportamiento de hoy)", () => {
    const res = comoAbrir({ id: "a1" }, baseOferta());
    expect(res.modo).toBe("local");
    expect(res.destino).toBe("local");
  });

  it("local si la neurona cubre los requisitos", () => {
    const app: AppEjecutable = { id: "a2", ejecucion: ["local"], requisitos: { ramMb: 1024, gpu: true, motores: ["imagen"] } };
    const res = comoAbrir(app, baseOferta());
    expect(res.modo).toBe("local");
    expect(res.destino).toBe("local");
  });

  it("por-bandas si falta local y hay volumen, con destino del plan", () => {
    const app: AppEjecutable = { id: "a3", ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 8192, volumen: "v-wasm" } };
    const plan = planConPartes({ bytes: [{ destino: "n7", motivo: "bandas" }] });
    const res = comoAbrir(app, baseOferta(), plan);
    expect(res.modo).toBe("por-bandas");
    expect(res.destino).toBe("n7");
  });

  it("por-bandas sin plan usa la propia neurona como destino", () => {
    const app: AppEjecutable = { id: "a4", ejecucion: ["por-bandas"], requisitos: { volumen: "v-wasm" } };
    const res = comoAbrir(app, baseOferta({ nodoId: "n3" }));
    expect(res.modo).toBe("por-bandas");
    expect(res.destino).toBe("n3");
  });

  it("transmitida si otra neurona tiene una ventana prestada", () => {
    const app: AppEjecutable = { id: "a5", ejecucion: ["transmitida", "local"], requisitos: { ramMb: 8192 } };
    const plan = planConPartes({ ventana: [{ destino: "a1-remota", motivo: "prestada" }] });
    const res = comoAbrir(app, baseOferta(), plan);
    expect(res.modo).toBe("transmitida");
    expect(res.destino).toBe("a1-remota");
  });

  it("ramificada si solo falta cálculo y el plan lo presta de otra neurona", () => {
    const app: AppEjecutable = { id: "a6", ejecucion: ["local", "ramificada"], requisitos: { ramMb: 8192 } };
    const plan = planConPartes({ computo: [{ destino: "n9", motivo: "sirve el cálculo" }] });
    const res = comoAbrir(app, baseOferta(), plan);
    expect(res.modo).toBe("ramificada");
    expect(res.destino).toBe("local");
    expect(res.motivo).toContain("n9");
  });

  it("montada si es app nativa con volumen y nada más vale", () => {
    const app: AppEjecutable = { id: "a7", ejecucion: ["montada"], requisitos: { volumen: "v-app-nativa" } };
    const res = comoAbrir(app, baseOferta());
    expect(res.modo).toBe("montada");
    expect(res.destino).toBe("volumen:v-app-nativa");
  });

  it("suelo: abre en local y dice qué falta", () => {
    const app: AppEjecutable = { id: "a8", ejecucion: ["local"], requisitos: { ramMb: 8192, gpu: true, motores: ["palabra"] } };
    const res = comoAbrir(app, baseOferta({ computo: { nucleos: 1, ramLibreMb: 512, gpu: false, motores: ["voz"] } }));
    expect(res.modo).toBe("local");
    expect(res.destino).toBe("local");
    expect(res.motivo).toContain("falta");
    expect(res.motivo).toContain("RAM");
    expect(res.motivo).toContain("GPU");
    expect(res.motivo).toContain("palabra");
  });

  it("suelo sin faltas dice que la red no presta un modo alternativo", () => {
    const app: AppEjecutable = { id: "a9", ejecucion: ["transmitida"] };
    const res = comoAbrir(app, baseOferta());
    expect(res.modo).toBe("local");
    expect(res.motivo).toContain("no presta");
  });

  it("por-bandas gana a transmitida cuando ambas valen (orden del §5)", () => {
    const app: AppEjecutable = { id: "a10", ejecucion: ["por-bandas", "transmitida"], requisitos: { ramMb: 8192, volumen: "v1" } };
    const plan = planConPartes({
      bytes: [{ destino: "n7", motivo: "bandas" }],
      ventana: [{ destino: "a1-remota", motivo: "prestada" }],
    });
    const res = comoAbrir(app, baseOferta(), plan);
    expect(res.modo).toBe("por-bandas");
  });

  it("la app sin ejecucion ('local' sola) no elige bandas aunque plan las halla", () => {
    const app: AppEjecutable = { id: "a11", requisitos: { ramMb: 8192, volumen: "v1" } };
    const plan = planConPartes({ bytes: [{ destino: "n7", motivo: "bandas" }] });
    const res = comoAbrir(app, baseOferta(), plan);
    expect(res.modo).toBe("local");
  });
});
