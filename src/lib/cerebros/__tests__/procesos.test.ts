import { describe, expect, it } from "vitest";
import {
  avisosHardware,
  ETIQUETA_TIPO,
  hardwareDesdeMac,
  hardwareDesdeNeurona,
  hardwareDesdeNodo,
  porcentaje,
  UMBRALES_POR_DEFECTO,
  type HardwareServidor,
} from "../procesos";

const base: HardwareServidor = {
  id: "a",
  nombre: "Servidor A",
  tipo: "mac",
  cpuPct: null,
  nucleos: null,
  carga: null,
  ramUsadaMb: null,
  ramTotalMb: null,
  gpuPct: null,
  gpuNombre: null,
  discoLibreGb: null,
  discoTotalGb: null,
  bateriaPct: null,
  cargando: null,
  medidoEn: null,
  fuente: "prueba",
};

describe("ETIQUETA_TIPO", () => {
  it("cubre los nueve tipos en español", () => {
    expect(Object.keys(ETIQUETA_TIPO)).toHaveLength(9);
    expect(ETIQUETA_TIPO["app-fondo"]).toBe("Apps en segundo plano");
    expect(ETIQUETA_TIPO.imaginacion).toBe("Imaginación");
  });
});

describe("porcentaje", () => {
  it("redondea a 1 decimal", () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(50, 100)).toBe(50);
  });
  it("null si falta algo o el total no sirve", () => {
    expect(porcentaje(null, 100)).toBeNull();
    expect(porcentaje(10, null)).toBeNull();
    expect(porcentaje(10, 0)).toBeNull();
    expect(porcentaje(10, -5)).toBeNull();
  });
});

describe("avisosHardware", () => {
  it("avisa cpu, ram y disco por encima del umbral", () => {
    const h = { ...base, cpuPct: 90, ramUsadaMb: 95, ramTotalMb: 100, discoLibreGb: 5, discoTotalGb: 100 };
    const a = avisosHardware([h], UMBRALES_POR_DEFECTO);
    expect(a.map((x) => x.medida).sort()).toEqual(["cpu", "disco", "ram"]);
    expect(a.find((x) => x.medida === "disco")?.valor).toBe(95);
  });
  it("batería avisa por debajo solo sin cargar; null nunca avisa", () => {
    const cargando = { ...base, bateriaPct: 10, cargando: true };
    const sinCarga = { ...base, bateriaPct: 10, cargando: false };
    const sinMedida = { ...base };
    expect(avisosHardware([cargando], UMBRALES_POR_DEFECTO)).toEqual([]);
    expect(avisosHardware([sinCarga], UMBRALES_POR_DEFECTO)).toHaveLength(1);
    expect(avisosHardware([sinMedida], UMBRALES_POR_DEFECTO)).toEqual([]);
  });
});

describe("hardwareDesdeMac", () => {
  it("lee campos y pone medidoEn por defecto", () => {
    const h = hardwareDesdeMac({ cpuPct: 42, ramUsadaMb: 6000, ramTotalMb: 8192, cargando: false, bateriaPct: 55 }, 1000);
    expect(h?.cpuPct).toBe(42);
    expect(h?.medidoEn).toBe(1000);
    expect(h?.tipo).toBe("mac");
    expect(h?.gpuPct).toBeNull();
  });
  it("entrada inválida → null; basura en campos → null, nunca 0", () => {
    expect(hardwareDesdeMac(null, 1)).toBeNull();
    const h = hardwareDesdeMac({ cpuPct: "mucho" }, 1);
    expect(h?.cpuPct).toBeNull();
  });
});

describe("hardwareDesdeNodo", () => {
  it("RAM usada = total − libre solo si hay total", () => {
    const h = hardwareDesdeNodo({ nodo: "a1", ram_libre_mb: 100, ram_total_mb: 400, cpu_pct: 12 }, 7);
    expect(h?.ramUsadaMb).toBe(300);
    const sinTotal = hardwareDesdeNodo({ nodo: "a1", ram_libre_mb: 100 }, 7);
    expect(sinTotal?.ramUsadaMb).toBeNull();
  });
  it("sin nombre de nodo → null", () => {
    expect(hardwareDesdeNodo({ ram_libre_mb: 1 }, 0)).toBeNull();
  });
});

describe("hardwareDesdeNeurona", () => {
  it("lee batería y cuota; cpu y gpu sin medida", () => {
    const h = hardwareDesdeNeurona(
      { id: "n1", nombre: "Móvil", capabilities: { battery: { level: 33, charging: false }, quota: { total_gb: 64, free_gb: 10 } } },
      5,
    );
    expect(h?.bateriaPct).toBe(33);
    expect(h?.cargando).toBe(false);
    expect(h?.discoTotalGb).toBe(64);
    expect(h?.discoLibreGb).toBe(10);
    expect(h?.cpuPct).toBeNull();
    expect(h?.gpuPct).toBeNull();
  });
  it("sin capabilities no inventa números", () => {
    const h = hardwareDesdeNeurona({ id: "n2" }, 5);
    expect(h?.bateriaPct).toBeNull();
    expect(h?.discoTotalGb).toBeNull();
    expect(h?.id).toBe("n2");
  });
});
