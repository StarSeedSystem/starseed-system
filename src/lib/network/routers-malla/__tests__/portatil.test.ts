import { describe, it, expect } from "vitest";

import type { EntradaTabla } from "../compatibilidad-openwrt";
import {
  TIPOS_PORTATIL,
  coordinacionPortatil,
  factorAmortiguacion,
  compatibilidadPortatil,
  resumenSinSim,
  type RouterPortatil,
} from "../portatil";

function portatil(extra: Partial<RouterPortatil> = {}): RouterPortatil {
  return { id: "t1", tipo: "viaje-openwrt", bateriaPct: null, cargando: false, ...extra };
}

const tabla: EntradaTabla[] = [
  {
    fabricante: "GL.iNet",
    modelo: "Beryl",
    target: "mediatek/filogic",
    perfil: "glinet_gl-mt3000",
    soportado: true,
  },
];

describe("TIPOS_PORTATIL", () => {
  it("contiene los tres tipos del contrato", () => {
    expect(TIPOS_PORTATIL).toEqual(["viaje-openwrt", "viaje-otro", "mifi-operador"]);
  });
});

describe("coordinacionPortatil", () => {
  it("6 si está cargando, aunque la batería sea baja", () => {
    expect(coordinacionPortatil(portatil({ cargando: true, bateriaPct: 5 }))).toBe(6);
  });
  it("6 con batería desconocida (null)", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: null }))).toBe(6);
  });
  it("6 con batería ≥ 50 %, 4 entre 20 y 50 %, 3 por debajo de 20 %", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: 50 }))).toBe(6);
    expect(coordinacionPortatil(portatil({ bateriaPct: 20 }))).toBe(4);
    expect(coordinacionPortatil(portatil({ bateriaPct: 19 }))).toBe(3);
  });
});

describe("factorAmortiguacion", () => {
  it("quieto y estable: máximo 0.6", () => {
    expect(factorAmortiguacion(portatil(), 0)).toBeCloseTo(0.6);
  });
  it("volatilidad 1: 0; la volatilidad se acota a 0–1", () => {
    expect(factorAmortiguacion(portatil(), 1)).toBe(0);
    expect(factorAmortiguacion(portatil(), 5)).toBe(0);
    expect(factorAmortiguacion(portatil(), -1)).toBeCloseTo(0.6);
  });
  it("moviéndose rebate a la mitad y nunca pasa de 0.6", () => {
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0)).toBeCloseTo(0.3);
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0.5)).toBeCloseTo(0.15);
  });
});

describe("compatibilidadPortatil", () => {
  const modelo = (tipo: RouterPortatil["tipo"]) => ({
    fabricante: "GL.iNet",
    modelo: "Beryl",
    tipo,
  });

  it("viaje-openwrt: soportado sin flashear, con sus pasos y aviso", () => {
    const r = compatibilidadPortatil(modelo("viaje-openwrt"), tabla);
    expect(r.estado).toBe("soportado-sin-flashear");
    expect(r.enlace).toBeNull();
    expect(r.pasos).toHaveLength(3);
    expect(r.aviso).toContain("No hace falta flashear");
  });

  it("mifi-operador sin entrada soportada: bloqueado-operador con la alternativa", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Operador", modelo: "MiFi X", tipo: "mifi-operador" },
      tabla,
    );
    expect(r.estado).toBe("bloqueado-operador");
    expect(r.pasos.join(" ")).toContain("Wi‑Fi (modo cliente) o por USB");
  });

  it("viaje-otro delega en la tabla: soportado con enlace cuando consta", () => {
    const r = compatibilidadPortatil(modelo("viaje-otro"), tabla);
    expect(r.estado).toBe("soportado");
    expect(r.enlace).toContain("firmware-selector.openwrt.org");
  });

  it("viaje-otro no listado: desconocido", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Marca", modelo: "Raro", tipo: "viaje-otro" },
      tabla,
    );
    expect(r.estado).toBe("desconocido");
  });
});

describe("resumenSinSim", () => {
  it("explica que sin SIM es un titanio igual (la malla va por Wi‑Fi)", () => {
    const texto = resumenSinSim(portatil({ modem: null }));
    expect(texto).toContain("Sin SIM");
    expect(texto).toContain("Wi‑Fi");
    expect(texto).not.toContain("puerta a internet opcional");
  });

  it("con SIM: la menciona como puerta opcional", () => {
    const texto = resumenSinSim(
      portatil({ modem: { generacion: "4g", conSim: true } }),
    );
    expect(texto).toContain("puerta a internet opcional");
  });
});
