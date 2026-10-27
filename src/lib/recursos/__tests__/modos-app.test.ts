import { describe, it, expect } from "vitest";
import { Globe } from "lucide-react";
import type { StarseedApp } from "../../../components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "../oferta";
import { comoAbrir, modosDe } from "../modos-app";

const app = (extra: Partial<StarseedApp> = {}): StarseedApp => ({
  id: "app1",
  name: "App de prueba",
  description: "App de prueba",
  icon: Globe,
  accent: "#00F0FF",
  category: "starseed",
  open: { primary: "route", allowed: ["route"], route: "/app1" },
  ...extra,
});

const nodo = (extra: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "nodo-local",
  cuentaId: "cuenta",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 4096, gpu: false, motores: [] },
  almacen: { prestaMb: 2048, volumenes: ["vol-app"] },
  apps: [],
  enlaces: { latenciaMs: { "nodo-otra": 20 } },
  energia: { bateriaPct: 80, cargando: true, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 2048, discoMb: 1024, soloCargando: false } },
  t: 1_700_000_000_000,
  ...extra,
});

const otra = (extra: Partial<OfertaNeurona> = {}) =>
  nodo({ nodoId: "nodo-otra", apps: [{ id: "app1", version: "1.0" }], ...extra });

describe("modosDe", () => {
  it("sin campo = solo local", () => {
    expect(modosDe(app())).toEqual(["local"]);
  });

  it("respeta los modos declarados", () => {
    expect(modosDe(app({ ejecucion: ["local", "por-bandas"] }))).toEqual(["local", "por-bandas"]);
  });
});

describe("comoAbrir", () => {
  it("local si cabe, sin requisitos", () => {
    expect(comoAbrir(app(), nodo())).toMatchObject({ modo: "local", destino: "/app1" });
  });

  it("local si los requisitos caben", () => {
    const a = app({ requisitos: { ramMb: 2048, gpu: false, motores: [], volumen: "vol-app" } });
    expect(comoAbrir(a, nodo()).modo).toBe("local");
  });

  it("por bandas si no cabe y la app es un volumen web/WASM", () => {
    const a = app({ ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 8192, volumen: "vol-app" } });
    expect(comoAbrir(a, nodo())).toMatchObject({ modo: "por-bandas", destino: "vol-app" });
  });

  it("montada si la app nativa vive fuera del disco", () => {
    const a = app({ ejecucion: ["local", "montada"], requisitos: { ramMb: 8192, volumen: "vol-app" } });
    expect(comoAbrir(a, nodo())).toMatchObject({ modo: "montada", destino: "vol-app" });
  });

  it("transmitida si otra neurona la tiene y la latencia sirve", () => {
    const a = app({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 8192 } });
    expect(comoAbrir(a, nodo(), { candidatas: [otra()], latenciaMaxMs: 50 }))
      .toMatchObject({ modo: "transmitida", destino: "nodo-otra" });
  });

  it("no transmite si la latencia no sirve; cae al suelo local con aviso", () => {
    const a = app({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 8192 } });
    const r = comoAbrir(a, nodo(), { candidatas: [otra()], latenciaMaxMs: 10 });
    expect(r.modo).toBe("local");
    expect(r.motivo).toContain("RAM");
  });

  it("no transmite sin latencia medida cuando hay tope", () => {
    const a = app({ ejecucion: ["local", "transmitida"], requisitos: { ramMb: 8192 } });
    const sinMedir = otra({ enlaces: {} });
    const r = comoAbrir(a, nodo({ enlaces: {} }), { candidatas: [sinMedir], latenciaMaxMs: 50 });
    expect(r.modo).toBe("local");
  });

  it("ramificada si solo falta cálculo", () => {
    const a = app({ ejecucion: ["local", "ramificada"], requisitos: { ramMb: 8192 } });
    expect(comoAbrir(a, nodo())).toMatchObject({ modo: "ramificada", destino: "/app1" });
  });

  it("no ramifica si además falta el volumen", () => {
    const a = app({ ejecucion: ["local", "ramificada"], requisitos: { ramMb: 8192, volumen: "vol-otro" } });
    const r = comoAbrir(a, nodo());
    expect(r.modo).toBe("local");
    expect(r.motivo).toContain("volumen");
  });

  it("suelo: local con aviso de lo que falta", () => {
    const a = app({ requisitos: { ramMb: 8192, gpu: true, motores: ["imagen"] } });
    const r = comoAbrir(a, nodo());
    expect(r.modo).toBe("local");
    expect(r.motivo).toContain("RAM");
    expect(r.motivo).toContain("GPU");
    expect(r.motivo).toContain("imagen");
  });
});
