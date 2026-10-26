import { describe, it, expect } from "vitest";
import {
  cpuEntre,
  analizarVmStat,
  analizarIoreg,
  analizarPmset,
} from "@/lib/mando/hardware";

describe("cpuEntre", () => {
  it("should return null for empty arrays", () => {
    expect(cpuEntre([], [])).toBeNull();
    expect(cpuEntre([{ model: "", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }], [])).toBeNull();
    expect(cpuEntre([], [{ model: "", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }])).toBeNull();
  });

  it("should calculate CPU usage correctly", () => {
    // Example data: two CPUs, user+nice+sys+idle+irq times
    const antes = [
      { model: "Intel i7", speed: 2000, times: { user: 1000, nice: 0, sys: 500, idle: 2000, irq: 0 } },
      { model: "Intel i7", speed: 2000, times: { user: 800, nice: 0, sys: 400, idle: 1800, irq: 0 } },
    ];
    const despues = [
      { model: "Intel i7", speed: 2000, times: { user: 1200, nice: 0, sys: 600, idle: 2100, irq: 0 } },
      { model: "Intel i7", speed: 2000, times: { user: 900, nice: 0, sys: 500, idle: 1900, irq: 0 } },
    ];
    // CPU 0: (user+nice+sys+idle+irq) antes: 3500, despues: 3900 -> diff 400
    // idle: antes 2000, despues 2100 -> diff 100
    // CPU 1: antes: 3000, despues: 3300 -> diff 300
    // idle: antes 1800, despues 1900 -> diff 100
    // Total diff: 400+300 = 700
    // Total idle diff: 100+100 = 200
    // Usage: (700 - 200) / 700 = 500/700 ≈ 0.714 -> 71.4%
    const result = cpuEntre(antes, despues);
    expect(result).toBeCloseTo(71.4, 1);
  });
});

describe("analizarVmStat", () => {
  it("should return null for empty text", () => {
    expect(analizarVmStat("", 1000)).toBeNull();
  });

  it("should extract used memory from vm_stat output", () => {
    const vmstat = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                         12345.
Pages active:                       54321.
Pages inactive:                     67890.
Pages speculative:                  5432.
Pages throttled:                    0.
Pages wired down:                   43210.
Pages purgeable:                    1234.
Pages copied:                       0.
Pages zero filled:                  56789.
Pages reactivated:                  1234.
Pages purged:                       5678.
File-backed pages:                  34567.
Anonymous pages:                    56789.
Pages stored in compressor:         12345.
Pages occupied by compressor:       5432.
Decompressions:                     56789.
Compressions:                       12345.
Pageins:                            0.
Pageouts:                           0.
Swapins:                            0.
Swapouts:                           0.
`;
    const totalBytes = 8 * 1024 * 1024 * 1024; // 8 GB
    // active: 54321, wired: 43210, compressed: 5432
    // sum = 54321 + 43210 + 5432 = 102963 pages
    // page size: 4096 bytes
    // used bytes = 102963 * 4096 = 421,736,448 bytes
    // used MB = 421736448 / (1024*1024) = 402.2 MB -> approx 402
    const result = analizarVmStat(vmstat, totalBytes);
    expect(result).toBeCloseTo(402, 0);
  });

  it("should return null if page size not found", () => {
    const vmstat = "Some text without page size";
    expect(analizarVmStat(vmstat, 1000)).toBeNull();
  });

  it("should return null if active not found", () => {
    const vmstat = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                         12345.
Pages inactive:                     67890.
Pages wired down:                   43210.
`;
    expect(analizarVmStat(vmstat, 1000)).toBeNull();
  });
});

describe("analizarIoreg", () => {
  it("should return null for empty text", () => {
    expect(analizarIoreg("")).toEqual({ uso: null, nombre: null });
  });

  it("should extract GPU usage and model", () => {
    const ioreg = `
      {
        "IOGeneralInterest" = "IOAccelerator"
        "Device Utilization %" = 42
        "model" = "Apple M1 Pro"
      }
    `;
    const result = analizarIoreg(ioreg);
    expect(result.uso).toBe(42);
    expect(result.nombre).toBe("Apple M1 Pro");
  });

  it("should handle missing fields", () => {
    const ioreg = `
      {
        "IOGeneralInterest" = "IOAccelerator"
        "model" = "Apple M1 Pro"
      }
    `;
    const result = analizarIoreg(ioreg);
    expect(result.uso).toBeNull();
    expect(result.nombre).toBe("Apple M1 Pro");
  });

  it("should parse the real ioreg tree", () => {
    // Salida real de `ioreg -r -d 1 -c IOAccelerator`: árbol de clases y no un fragmento plano.
    const ioreg = `
      +-o Root <class IORegistryRoot, id 0x100000100, retain 11>
        +-o AppleGPU <class AppleGPU, id 0x100000200, retain 12>
          {
            "model" = "Apple M1 Pro"
            "Device Utilization %" = 42
          }
    `;
    const result = analizarIoreg(ioreg);
    expect(result.uso).toBe(42);
    expect(result.nombre).toBe("Apple M1 Pro");
  });

  it("should report usage even when the model is missing", () => {
    const result = analizarIoreg(`"Device Utilization %" = 99`);
    expect(result.uso).toBe(99);
    expect(result.nombre).toBeNull();
  });
});

describe("analizarPmset", () => {
  it("should return null for empty text", () => {
    expect(analizarPmset("")).toEqual({ porcentaje: null, cargando: null });
  });

  it("should extract battery percentage and charging state", () => {
    const pmset = "Now drawing from 'AC Power'\n -internalbattery:     90%; charging; 0:00 remaining present: true\n";
    const result = analizarPmset(pmset);
    expect(result.porcentaje).toBe(90);
    expect(result.cargando).toBe(true);
  });

  it("should handle discharging state", () => {
    const pmset = "Now drawing from 'Battery'\n -internalbattery:     50%; discharging; 1:30 remaining present: true\n";
    const result = analizarPmset(pmset);
    expect(result.porcentaje).toBe(50);
    expect(result.cargando).toBe(false);
  });

  it("should handle charged state", () => {
    const pmset = "Now drawing from 'AC Power'\n -internalbattery:     100%; charged; 0:00 remaining present: true\n";
    const result = analizarPmset(pmset);
    expect(result.porcentaje).toBe(100);
    expect(result.cargando).toBe(false);
  });

  it("should report percentage but unknown state when pmset omits it", () => {
    // pmset puede dar el porcentaje y no decir en qué estado está (línea recortada):
    // el porcentaje vale, pero no se inventa si está cargando.
    const pmset = "Now drawing from 'AC Power'\n -internalbattery:     90%";
    const result = analizarPmset(pmset);
    expect(result.porcentaje).toBe(90);
    expect(result.cargando).toBeNull();
  });

  it("should return null if percentage not found", () => {
    const pmset = "Some text without percentage";
    expect(analizarPmset(pmset)).toEqual({ porcentaje: null, cargando: null });
  });

  it("con AC conectado pero sin batería: no hay porcentaje y la carga queda desconocida", () => {
    // `pmset -g batt` de una Mac sin batería: «?%; AC attached» — no hay número que leer.
    const pmset = "Now drawing from 'AC Power'\n -internalbattery     ?%; AC attached; present: true\n";
    expect(analizarPmset(pmset)).toEqual({ porcentaje: null, cargando: null });
  });
});