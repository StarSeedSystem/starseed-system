import { describe, it, expect } from "vitest";
import { Square } from "lucide-react";
import type { StarseedApp, ModoEjecucionApp, RequisitosApp } from "../../components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "../oferta";
import { comoAbrir, faltasLocal, requisitosDe, modosDe } from "../modos-app";

const appBase = (o: Partial<StarseedApp> = {}): StarseedApp => ({
  id: "calculadora",
  name: "Calculadora",
  description: "App de prueba",
  icon: Square,
  accent: "#007FFF",
  category: "utilidad",
  open: { primary: "route", allowed: ["route"], route: "/calculadora" },
  ...o,
});

const neuronaBase = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "neurona-a",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ["imagen", "voz"] },
  almacen: { prestaMb: 1024, volumenes: ["vol-biblioteca"] },
  apps: [{ id: "calculadora", version: "1.0" }],
  enlaces: { subidaKbps: 1000, bajadaKbps: 2000, latenciaMs: { "neurona-b": 10 } },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: {
    cuenta: true,
    grupos: [],
    publico: false,
    topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, horas: undefined, soloCargando: false },
  },
  t: 1760000000000,
  ...o,
});

describe("requisitos y modos declarados", () => {
  it("sin campo en ejecucion solo declara local", () => {
    expect(modosDe(appBase())).toEqual(["local"]);
  });
  it("sin requisitos no exige nada medido", () => {
    const r = requisitosDe(appBase());
    expect(r).toEqual({ ramMb: 0, gpu: false, motores: [], volumen: undefined });
  });
  it("leer los requisitos declarados", () => {
    const requisitos: RequisitosApp = { ramMb: 512, gpu: true, motores: ["voz"], volumen: "vol-biblioteca" };
    const r = requisitosDe(appBase({ requisitos }));
    expect(r).toEqual({ ramMb: 512, gpu: true, motores: ["voz"], volumen: "vol-biblioteca" });
  });
});

describe("faltasLocal", () => {
  it("cabe: nada falta", () => {
    const app = appBase({ requisitos: { ramMb: 1024, gpu: true, motores: ["imagen"] } });
    expect(faltasLocal(app, neuronaBase())).toEqual({ ram: null, gpu: null, motores: null, volumen: null });
  });
  it("marca cada falta medida", () => {
    const app = appBase({ requisitos: { ramMb: 4096, gpu: true, motores: ["oído"], volumen: "otro-vol" } });
    const f = faltasLocal(app, neuronaBase());
    expect(f.ram).not.toBeNull();
    expect(f.gpu).not.toBeNull();
    expect(f.motores).toContain("oído");
    expect(f.volumen).toContain("otro-vol");
  });
});

describe("comoAbrir", () => {
  it("cabe y local declarado: abre en local, destino = ruta del módulo", () => {
    const d = comoAbrir(appBase(), neuronaBase(), {});
    expect(d.modo).toBe("local");
    expect(d.destino).toBe("/calculadora");
    expect(d.motivo).toContain("local");
  });
  it("cabe sin local declarado, native: montada apunta al volumen", () => {
    const app = appBase({ ejecucion: ["montada"] as ModoEjecucionApp[], requisitos: { volumen: "vol-biblioteca" } });
    const d = comoAbrir(app, neuronaBase(), {});
    expect(d.modo).toBe("montada");
    expect(d.destino).toBe("vol-biblioteca");
  });
  it("falta RAM y hay volumen con por-bandas: se baja por bandas", () => {
    const app = appBase({ ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 4096, volumen: "vol-biblioteca" } });
    const d = comoAbrir(app, neuronaBase(), {});
    expect(d.modo).toBe("por-bandas");
    expect(d.destino).toBe("/calculadora");
    expect(d.motivo).toContain("bandas");
  });
  it("otra neurona la tiene y la latencia medida sirve: transmitida", () => {
    const app = appBase({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 4096 } });
    const d = comoAbrir(app, neuronaBase(), { anfitriones: [{ nodoId: "neurona-b", latenciaMs: 35 }] });
    expect(d.modo).toBe("transmitida");
    expect(d.destino).toBe("neurona-b");
    expect(d.motivo).toContain("35 ms");
  });
  it("sin latencia medida o fuera de tope no hay transmitida: suelo", () => {
    const app = appBase({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 4096 } });
    const sinMedida = comoAbrir(app, neuronaBase(), { anfitriones: [{ nodoId: "neurona-b" }] });
    expect(sinMedida.modo).toBe("local");
    const lejano = comoAbrir(app, neuronaBase(), { anfitriones: [{ nodoId: "neurona-b", latenciaMs: 500 }] });
    expect(lejano.modo).toBe("local");
    expect(lejano.motivo).toContain("falta");
  });
  it("solo falta cálculo y hay neurona para el cálculo: ramificada", () => {
    const app = appBase({ ejecucion: ["local", "ramificada"], requisitos: { ramMb: 4096 } });
    const d = comoAbrir(app, neuronaBase(), { calculo: { nodoId: "neurona-c" } });
    expect(d.modo).toBe("ramificada");
    expect(d.destino).toBe("neurona-c");
    expect(d.motivo).toContain("cálculo se presta");
  });
  it("falta el volumen y solo hay montada: se monta por la pasarela local", () => {
    const app = appBase({ ejecucion: ["montada"], requisitos: { volumen: "otro-vol" } });
    const d = comoAbrir(app, neuronaBase(), {});
    expect(d.modo).toBe("montada");
    expect(d.destino).toBe("otro-vol");
    expect(d.motivo).toContain("pasarela");
  });
  it("suelo: nunca nada, local con aviso de lo que falta", () => {
    const app = appBase({ requisitos: { ramMb: 8192, gpu: true } });
    const d = comoAbrir(app, neuronaBase(), {});
    expect(d.modo).toBe("local");
    expect(d.destino).toBe("/calculadora");
    expect(d.motivo).toContain("falta");
    expect(d.motivo).toContain("GPU");
  });
});

