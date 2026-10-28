import { describe, it, expect } from "vitest";
import { faltasDe, modosDe, comoAbrir } from "../modos-app";
import type { OfertaNeurona } from "../oferta";
import type { ResultadoPlanificacion } from "../bolsa";

const vivaz: OfertaNeurona = {
  nodoId: "nodo-rincon",
  cuentaId: "cuenta-uno",
  medio: "escritorio",
  computo: { nucleos: 8, ramLibreMb: 6144, gpu: true, vramMb: 4096, motores: ["imagen", "voz"] },
  almacen: { prestaMb: 4096, volumenes: ["biblioteca"] },
  apps: [{ id: "lienzo", version: "1.0" }],
  enlaces: { latenciaMs: { "nodo-torre": 30 } },
  energia: { bateriaPct: 100, cargando: true, enUso: false },
  presta: {
    cuenta: true, grupos: [], publico: false,
    topes: { cpuPct: 100, ramMb: 4096, discoMb: 2048, soloCargando: false },
  },
  t: 0,
};

const planVacio: ResultadoPlanificacion = { porParte: {} };

function plan(
  partes: Partial<ResultadoPlanificacion["porParte"]>,
): ResultadoPlanificacion {
  return { porParte: { computo: [], bytes: [], ventana: [], relevo: [], ...partes } };
}

describe("modos-app.ts", () => {
  describe("modosDe", () => {
    it("sin campo ejecución solo tiene local", () => {
      expect(modosDe({ id: "lienzo" })).toEqual(["local"]);
    });

    it("con campo devuelve la lista tal cual", () => {
      expect(modosDe({ id: "x", ejecucion: ["local", "transmitida"] })).toEqual([
        "local",
        "transmitida",
      ]);
    });
  });

  describe("faltasDe", () => {
    it("sin requisitos no faltan nada", () => {
      expect(faltasDe(undefined, vivaz)).toEqual([]);
    });

    it("cuenta RAM, GPU, motores y volumen que faltan", () => {
      const faltas = faltasDe(
        { ramMb: 9999, gpu: true, motores: ["oído", "voz"], volumen: "publicaciones" },
        vivaz,
      );
      expect(faltas).toContain("RAM 9999 MB");
      expect(faltas).toContain("GPU");
      expect(faltas).toContain("motor oído");
      expect(faltas).toContain("volumen publicaciones");
      expect(faltas).not.toContain("motor voz");
    });

    it("cuando la neurona cubre todo, no faltan nada", () => {
      expect(faltasDe({ ramMb: 4096, motores: ["voz"], volumen: "biblioteca" }, vivaz)).toEqual([]);
    });
  });

  describe("comoAbrir", () => {
    it("app sin requisitos ni ejecución: local en la neurona", () => {
      const d = comoAbrir({ id: "lienzo" }, vivaz, planVacio);
      expect(d.modo).toBe("local");
      expect(d.destino).toBe("nodo-rincon");
      expect(d.motivo).toContain("requisitos");
    });

    it("cabe en la neurona aunque declare requisitos exigentes", () => {
      const d = comoAbrir(
        { id: "lienzo", ejecucion: ["local", "por-bandas"], requisitos: { ramMb: 4096, gpu: true, volumen: "biblioteca" } },
        vivaz,
        planVacio,
      );
      expect(d.modo).toBe("local");
      expect(d.destino).toBe("nodo-rincon");
    });

    it("falta solo el volumen y admite por-bandas: baja por bandas la fuente del plan", () => {
      const d = comoAbrir(
        { id: "biblio", ejecucion: ["local", "por-bandas"], requisitos: { volumen: "publicaciones" } },
        vivaz,
        plan({ bytes: [{ destino: "nodo-torre", motivo: "cubre bytes" }] }),
      );
      expect(d.modo).toBe("por-bandas");
      expect(d.destino).toBe("nodo-torre");
      expect(d.motivo).toContain("bandas");
    });

    it("otra neurona la presta y la latencia sirve: transmitida", () => {
      const d = comoAbrir(
        { id: "estudio", ejecucion: ["transmitida"], requisitos: { ramMb: 9999 } },
        vivaz,
        plan({ ventana: [{ destino: "nodo-a1", motivo: "tiene la app" }] }),
      );
      expect(d.modo).toBe("transmitida");
      expect(d.destino).toBe("nodo-a1");
      expect(d.motivo).toContain("nodo-a1");
    });

    it("solo falta cálculo y admite ramificada: interfaz local, cálculo lejos", () => {
      const d = comoAbrir(
        { id: "lienzo", ejecucion: ["local", "ramificada"], requisitos: { ramMb: 9999 } },
        vivaz,
        plan({ computo: [{ destino: "nodo-torre", motivo: "cubre cómputo" }] }),
      );
      expect(d.modo).toBe("ramificada");
      expect(d.destino).toBe("nodo-torre");
      expect(d.motivo).toContain("nodo-rincon");
      expect(d.motivo).toContain("nodo-torre");
    });

    it("nada del plano sirve: suelo local con lo que falta avisado", () => {
      const d = comoAbrir(
        { id: "estudio", requisitos: { ramMb: 9999, gpu: true } },
        vivaz,
        planVacio,
      );
      expect(d.modo).toBe("local");
      expect(d.destino).toBe("nodo-rincon");
      expect(d.motivo).toContain("Suelo");
      expect(d.motivo).toContain("RAM 9999 MB");
      expect(d.motivo).toContain("GPU");
    });

    it("prefiere por-bandas antes que transmitida cuando solo falta el volumen", () => {
      const d = comoAbrir(
        { id: "biblio", ejecucion: ["por-bandas", "transmitida"], requisitos: { volumen: "publicaciones" } },
        vivaz,
        plan({ bytes: [{ destino: "nodo-torre", motivo: "cubre" }], ventana: [{ destino: "nodo-a1", motivo: "tiene" }] }),
      );
      expect(d.modo).toBe("por-bandas");
      expect(d.destino).toBe("nodo-torre");
    });

    it("montada con volumen por bandas disponible; modo y motivo correctos", () => {
      const d = comoAbrir(
        { id: "editor", ejecucion: ["montada"], requisitos: { volumen: "cuerpo" } },
        vivaz,
        plan({ bytes: [{ destino: "nube-propia", motivo: "cubre" }] }),
      );
      expect(d.modo).toBe("montada");
      expect(d.destino).toBe("nube-propia");
      expect(d.motivo).toContain("pasarela");
    });
  });
});
