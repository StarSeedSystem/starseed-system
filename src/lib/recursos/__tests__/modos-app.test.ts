import { describe, it, expect } from "vitest";
import type { OfertaNeurona } from "../oferta";
import { comoAbrir, modosAdmitidos, TOPE_LATENCIA_TRANSMITIDA_MS } from "../modos-app";
import type { AppConModos, PlanApertura } from "../modos-app";

const base = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "nodo1",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, motores: ["imagen", "voz"] },
  almacen: { prestaMb: 1024, volumenes: ["vol-biblioteca"] },
  apps: [{ id: "app1", version: "1.0" }],
  enlaces: { latenciaMs: { nodo2: 12 } },
  energia: { enUso: false },
  presta: {
    cuenta: true,
    grupos: [],
    publico: false,
    topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false },
  },
  t: 0,
  ...o,
});

const vacio: PlanApertura = {};
const appSimple = {}; // sin ejecucion ni requisitos, como casi todas del catálogo
const appGpu: AppConModos = { ejecucion: ["local", "transmitida", "ramificada"], requisitos: { gpu: true } };

describe("modosAdmitidos", () => {
  it("sin campo ejecucución devuelve solo local", () => {
    expect(modosAdmitidos({})).toEqual(["local"]);
  });
  it("una lista vacía también cae a local", () => {
    expect(modosAdmitidos({ ejecucion: [] })).toEqual(["local"]);
  });
  it("respeta los modos declarados", () => {
    expect(modosAdmitidos({ ejecucion: ["montada", "por-bandas"] })).toEqual([
      "montada",
      "por-bandas",
    ]);
  });
});

describe("comoAbrir · app sencilla", () => {
  it("una app sin requisitos se abre en local en esta neurona", () => {
    const d = comoAbrir(appSimple, base(), vacio);
    expect(d.modo).toBe("local");
    expect(d.destino).toBe("nodo1");
    expect(d.motivo).toContain("cabe");
  });
});

describe("comoAbrir · volumen por bandas (§7)", () => {
  const appVolumen: AppConModos = { ejecucion: ["por-bandas", "montada"], requisitos: { volumen: "vol-biblioteca" } };
  it("con pasarela local prefiere montada y nombra la fuente", () => {
    const d = comoAbrir(appVolumen, base(), { fuentesVolumen: ["vecino7"], pasarelaLocal: true });
    expect(d.modo).toBe("montada");
    expect(d.destino).toBe("vecino7");
    expect(d.motivo).toContain("pasarela");
  });
  it("sin pasarela local cae a por-bandas", () => {
    const d = comoAbrir(appVolumen, base(), { fuentesVolumen: ["vecino7"] });
    expect(d.modo).toBe("por-bandas");
    expect(d.motivo).toContain("bandas");
  });
  it("si la neurona ya guarda el volumen basta con ella", () => {
    const d = comoAbrir(appVolumen, base(), vacio);
    expect(d.modo).toBe("por-bandas");
    expect(d.destino).toBe("nodo1");
  });
  it("volumen sin ninguna fuente: suelo con aviso de lo que falta", () => {
    const d = comoAbrir(appVolumen, base({ almacen: { prestaMb: 0, volumenes: [] } }), vacio);
    expect(d.modo).toBe("por-bandas");
    expect(d.motivo).toContain("sin fuente");
  });
});

describe("comoAbrir · falta cálculo (transmitida y ramificada)", () => {
  it("otra neurona la tiene y la latencia sirve: ventana transmitida", () => {
    const d = comoAbrir(appGpu, base({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } }), {
      otraConLaApp: { nodoId: "nodo2", latenciaMs: 20 },
    });
    expect(d.modo).toBe("transmitida");
    expect(d.destino).toBe("nodo2");
    expect(d.motivo).toContain("GPU");
  });
  it("latencia por encima del tope no sirve la ventana", () => {
    const sinNadie: PlanApertura = {};
    const d = comoAbrir(appGpu, base({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } }), {
      otraConLaApp: { nodoId: "nodo2", latenciaMs: TOPE_LATENCIA_TRANSMITIDA_MS + 1 },
      ...sinNadie,
    });
    expect(d.modo).not.toBe("transmitida");
  });
  it("con cálculo remoto que cubre la GPU: ramificada", () => {
    const d = comoAbrir(appGpu, base({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } }), {
      calculoRemoto: { nodoId: "nodo3", ramMb: 2048, gpu: true, motores: [] },
    });
    expect(d.modo).toBe("ramificada");
    expect(d.destino).toBe("nodo3");
    expect(d.motivo).toContain("interfaz va en local");
  });
  it("cálculo remoto que no cubre el requisito: suelo", () => {
    const d = comoAbrir(appGpu, base({ computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: [] } }), {
      calculoRemoto: { nodoId: "nodo3", ramMb: 128, gpu: false, motores: [] },
    });
    expect(d.modo).toBe("local");
    expect(d.motivo).toContain("falta");
  });
  it("también decide por motores: los transmite si otro los presta", () => {
    const appVoz: AppConModos = { ejecucion: ["transmitida"], requisitos: { motores: ["voz"] } };
    const d = comoAbrir(appVoz, base({ computo: { nucleos: 2, ramLibreMb: 1024, gpu: false, motores: ["imagen"] } }), {
      otraConLaApp: { nodoId: "nodo4", latenciaMs: 30 },
    });
    expect(d.modo).toBe("transmitida");
    expect(d.destino).toBe("nodo4");
  });
});

describe("comoAbrir · suelo honesto (§4 regla 7)", () => {
  it("si nada cabe, abre en local y dice qué falta, sin modo prohibido", () => {
    const d = comoAbrir(appGpu, base({ computo: { nucleos: 1, ramLibreMb: 128, gpu: false, motores: [] } }), vacio);
    expect(d.modo).toBe("local");
    expect(d.motivo).toContain("GPU");
  });
  it("si local no está entre los modos, cae al primero declarado", () => {
    const dll: AppConModos = { ejecucion: ["por-bandas"], requisitos: { volumen: "otro" } };
    const d = comoAbrir(dll, base({ almacen: { prestaMb: 0, volumenes: [] } }), vacio);
    expect(d.modo).toBe("por-bandas");
    expect(d.motivo).toContain("sin fuente");
  });
});
