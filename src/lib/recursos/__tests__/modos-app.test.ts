import { describe, it, expect } from "vitest";
import { comoAbrir, AppApertura, ModoApertura } from "../modos-app";
import { OfertaNeurona } from "../oferta";
import { ResultadoPlanificacion } from "../bolsa";

const baseOferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1",
  cuentaId: "cuentaA",
  medio: "wifi",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ["imagen"] },
  almacen: { prestaMb: 1024, volumenes: ["v1"] }, apps: [{ id: "app", version: "1" }],
  enlaces: { subidaKbps: 100, bajadaKbps: 200, latenciaMs: { n3: 20 } }, energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, soloCargando: false } },
  t: Date.parse("2026-10-30T12:00:00Z"),
  ...o,
});

const abrir = (app: AppApertura, ofertas: Partial<OfertaNeurona> = {}, porParte: ResultadoPlanificacion["porParte"] = {}): ModoApertura =>
  comoAbrir(app, baseOferta(ofertas), { porParte });
const APP: AppApertura = { id: "app" };

describe("comoAbrir", () => {
  it("sin campo ejecucion abre local aunque la bolsa ofrezca otras vías", () => {
    const res = abrir(APP, {}, { ventana: [{ destino: "n3", motivo: "disponible" }] });
    expect(res.modo).toBe("local");
    expect(res.destino).toBe("n1");
  });

  it("con requisitos cumplidos abre local y lo dice en el motivo", () => {
    const res = abrir(
      { ...APP, ejecucion: ["local", "transmitida"], requisitos: { ramMb: 512, gpu: true, motores: ["imagen"] } },
      {},
      { ventana: [{ destino: "n3", motivo: "disponible" }] }
    );
    expect(res.modo).toBe("local");
    expect(res.motivo).toContain("Cabe");
  });

  it("web/WASM con volumen ausente y plan de bytes: por-bandas", () => {
    const res = abrir(
      { ...APP, ejecucion: ["local", "por-bandas"], requisitos: { volumen: "v-wasm" } },
      {},
      { bytes: [{ destino: "n2", motivo: "bandas listas" }] }
    );
    expect(res.modo).toBe("por-bandas");
    expect(res.destino).toBe("n2");
    expect(res.motivo).toContain("bandas");
  });

  it("falta cálculo y otra neurona lo tiene prestado: transmitida", () => {
    const res = abrir(
      { ...APP, ejecucion: ["local", "transmitida"], requisitos: { ramMb: 4096 } },
      {},
      { ventana: [{ destino: "n3", motivo: "App prestada por la neurona n3" }] }
    );
    expect(res.modo).toBe("transmitida");
    expect(res.destino).toBe("n3");
    expect(res.motivo).toContain("WebRTC");
  });

  it("falta solo cálculo y el plan trae cómputo: ramificada", () => {
    const res = abrir(
      { ...APP, ejecucion: ["local", "ramificada"], requisitos: { ramMb: 4096 } },
      {},
      { computo: [{ destino: "n4", motivo: "cálculo disponible en n4" }] }
    );
    expect(res.modo).toBe("ramificada");
    expect(res.destino).toBe("n4");
    expect(res.motivo).toContain("cálculo");
  });

  it("suelo en los tres caminos sin alternativa posible, con su aviso", () => {
    const sinBandas = abrir({ ...APP, ejecucion: ["local", "por-bandas"], requisitos: { volumen: "v-wasm" } });
    expect(sinBandas.motivo).toContain("volumen v-wasm");
    const sinVentana = abrir({ ...APP, ejecucion: ["local"], requisitos: { ramMb: 4096 } });
    expect(sinVentana.modo).toBe("local");
    expect(sinVentana.destino).toBe("n1");
    expect(sinVentana.motivo).toContain("Suelo");
    expect(sinVentana.motivo).toContain("RAM 4096 MB");
    const noRamificada = abrir(
      { ...APP, ejecucion: ["local", "ramificada"], requisitos: { ramMb: 4096, volumen: "v-wasm" } },
      {},
      { computo: [{ destino: "n4", motivo: "cálculo disponible en n4" }] }
    );
    expect(noRamificada.motivo).toContain("Suelo");
  });

  it("nativa: montada por la pasarela, con volumen ajeno o ya presente", () => {
    const res = abrir(
      { ...APP, ejecucion: ["montada"], requisitos: { volumen: "v-app" } },
      {},
      { bytes: [{ destino: "n2", motivo: "bandas del volumen en n2" }] }
    );
    expect(res.modo).toBe("montada");
    expect(res.destino).toBe("pasarela-local");
    expect(res.motivo).toContain("pasarela");
    const presente = abrir({ ...APP, ejecucion: ["montada"], requisitos: { volumen: "v1" } });
    expect(presente.modo).toBe("montada");
    expect(presente.motivo).toContain("ya está");
  });

  it("prioridad: con volumen ausente se prefiere por-bandas a transmitida", () => {
    const res = abrir(
      { ...APP, ejecucion: ["por-bandas", "transmitida"], requisitos: { volumen: "v-wasm" } },
      {},
      {
        bytes: [{ destino: "n2", motivo: "bandas listas" }],
        ventana: [{ destino: "n3", motivo: "App prestada por n3" }],
      }
    );
    expect(res.modo).toBe("por-bandas");
    expect(res.destino).toBe("n2");
  });

  it("GPU que la neurona no presta entra en el aviso del suelo", () => {
    const res = abrir({ ...APP, requisitos: { gpu: true } }, { computo: { nucleos: 1, ramLibreMb: 2048, gpu: false, motores: [] } });
    expect(res.modo).toBe("local");
    expect(res.motivo).toContain("GPU");
  });
});
