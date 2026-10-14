import { describe, it, expect } from "vitest";
import { cpuEntre, analizarVmStat, analizarIoreg, analizarPmset } from "../hardware";
import { cpus } from "node:os";

describe("cpuEntre", () => {
  it("should calculate CPU usage correctly", () => {
    const antes: ReturnType<typeof cpus> = [
      {
        model: "CPU 1",
        speed: 2000,
        times: { user: 0, nice: 0, sys: 0, idle: 10000, irq: 0 },
      },
      {
        model: "CPU 2",
        speed: 2000,
        times: { user: 0, nice: 0, sys: 0, idle: 10000, irq: 0 },
      },
    ];
    const despues: ReturnType<typeof cpus> = [
      {
        model: "CPU 1",
        speed: 2000,
        times: { user: 200, nice: 0, sys: 0, idle: 10200, irq: 0 },
      },
      {
        model: "CPU 2",
        speed: 2000,
        times: { user: 300, nice: 0, sys: 0, idle: 10100, irq: 0 },
      },
    ];
    // CPU 1: 50% usage (200 user, 200 idle -> 50% of 400 ms)
    // CPU 2: 25% usage (300 user, 100 idle -> 75% idle? Wait: user increased by 300, idle increased by 100 -> total increase 400, so usage = 300/400 = 75%)
    // Actually, let's recalculate:
    // CPU 1: idleDelta=200, totalDelta=400 -> usage = 1 - 200/400 = 0.5
    // CPU 2: idleDelta=100, totalDelta=400 -> usage = 1 - 100/400 = 0.75
    // Average usage = (0.5 + 0.75) / 2 = 0.625 -> 62.5%
    const result = cpuEntre(antes, despues);
    expect(result).toBeCloseTo(62.5);
  });

  it("should return null for empty arrays", () => {
    const antes: ReturnType<typeof cpus> = [];
    const despues: ReturnType<typeof cpus> = [];
    expect(cpuEntre(antes, despues)).toBeNull();
  });

  it("should return null for mismatched lengths", () => {
    const antes: ReturnType<typeof cpus> = [
      {
        model: "CPU",
        speed: 2000,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ];
    const despues: ReturnType<typeof cpus> = [];
    expect(cpuEntre(antes, despues)).toBeNull();
  });
});

describe("analizarVmStat", () => {
  it("should parse vm_stat output correctly", () => {
    // Example vm_stat output from a Mac
    const vmStatOutput = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free: 12345.
Pages active: 67890.
Pages inactive: 54321.
Pages speculative: 321.
Pages throttled: 0.
Pages wired down: 43210.
Pages purgeable: 123.
Pages copied: 0.
Pages zero filled: 0.
Pages reactivated: 0.
Pageins: 0.
Pageouts: 0.
Pages compressed: 20480.
`;
    const totalBytes = 16 * 1024 * 1024 * 1024; // 16 GB
    const usedMb = analizarVmStat(vmStatOutput, totalBytes);
    // active: 67890 pages
    // wired: 43210 pages
    // compressed: 20480 pages
    // total used pages = 67890 + 43210 + 20480 = 131580 pages
    // page size = 4096 bytes
    // used bytes = 131580 * 4096 = 538,970,880 bytes
    // used MB = 538,970,880 / (1024*1024) = 513.984375 MB
    expect(usedMb).toBeCloseTo(513.984375);
  });

  it("should return null for invalid output", () => {
    expect(analizarVmStat("", 0)).toBeNull();
    expect(analizarVmStat("no match here", 1000)).toBeNull();
  });
});

describe("analizarIoreg", () => {
  it("should parse ioreg output correctly", () => {
    const ioregOutput = `
      +-o Root <class IORegistryRoot, id 0x100000100, retain 11>
        +-o AppleGPU <class AppleGPU, id 0x100000200, retain 12>
          {
            "model" = "Apple M1 Pro"
            "Device Utilization %" = 42
          }
    `;
    const result = analizarIoreg(ioregOutput);
    expect(result.gpuPct).toBe(42);
    expect(result.gpuNombre).toBe("Apple M1 Pro");
  });

  it("should return null for missing fields", () => {
    const outputWithoutUtil = `
      "model" = "Intel HD Graphics"
    `;
    const result1 = analizarIoreg(outputWithoutUtil);
    expect(result1.gpuPct).toBeNull();
    expect(result1.gpuNombre).toBe("Intel HD Graphics");

    const outputWithoutModel = `
      "Device Utilization %" = 99
    `;
    const result2 = analizarIoreg(outputWithoutModel);
    expect(result2.gpuPct).toBe(99);
    expect(result2.gpuNombre).toBeNull();
  });
});

describe("analizarPmset", () => {
  it("should parse pmset output correctly", () => {
    // Example pmset output
    const pmsetOutput = `
Now drawing from 'Battery Power'
 -internalbattery     94%; charging; 0:00 remaining present: true
`;
    const result = analizarPmset(pmsetOutput);
    expect(result.bateriaPct).toBe(94);
    expect(result.cargando).toBe(true);
  });

  it("should handle discharging state", () => {
    const pmsetOutput = `
Now drawing from 'Battery Power'
 -internalbattery     30%; discharging; 1:20 remaining present: true
`;
    const result = analizarPmset(pmsetOutput);
    expect(result.bateriaPct).toBe(30);
    expect(result.cargando).toBe(false);
  });

  it("should handle charged state", () => {
    const pmsetOutput = `
Now drawing from 'AC Power'
 -internalbattery     100%; charged; 0:00 remaining present: true
`;
    const result = analizarPmset(pmsetOutput);
    expect(result.bateriaPct).toBe(100);
    expect(result.cargando).toBe(false); // charged means not charging
  });

  it("should handle AC attached without battery", () => {
    const pmsetOutput = `
Now drawing from 'AC Power'
 -internalbattery     ?%; AC attached; present: true
`;
    const result = analizarPmset(pmsetOutput);
    expect(result.bateriaPct).toBeNull(); // because no percentage
    expect(result.cargando).toBe(true); // AC attached means charging
  });

  it("should return null for invalid output", () => {
    expect(analizarPmset("")).toEqual({ bateriaPct: null, cargando: null });
    expect(analizarPmset("no battery info")).toEqual({ bateriaPct: null, cargando: null });
  });
});