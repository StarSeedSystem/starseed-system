import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { totalmem, type CpuInfo } from 'node:os';
import { promisify } from 'node:util';
import { compartirCalculo } from './calculo-compartido';

export interface HardwareMac {
  cpuPct: number | null;
  nucleos: number | null;
  carga: number | null;
  ramUsadaMb: number | null;
  ramTotalMb: number | null;
  gpuPct: number | null;
  gpuNombre: string | null;
  discoLibreGb: number | null;
  discoTotalGb: number | null;
  bateriaPct: number | null;
  cargando: boolean | null;
  medidoEn: number; // timestamp of measurement
}

// Pure analyzers (to be exported and tested)
export function cpuEntre(antes: CpuInfo[], despues: CpuInfo[]): number | null {
  if (!antes || !despues || antes.length === 0 || despues.length === 0) {
    return null;
  }

  let totalAntes = 0;
  let idleAntes = 0;
  let totalDespues = 0;
  let idleDespues = 0;

  for (const cpu of antes) {
    const { user, nice, sys, idle, irq } = cpu.times;
    totalAntes += user + nice + sys + idle + irq;
    idleAntes += idle;
  }

  for (const cpu of despues) {
    const { user, nice, sys, idle, irq } = cpu.times;
    totalDespues += user + nice + sys + idle + irq;
    idleDespues += idle;
  }

  const totalDiff = totalDespues - totalAntes;
  const idleDiff = idleDespues - idleAntes;

  if (totalDiff <= 0) {
    return 0;
  }

  return ((totalDiff - idleDiff) / totalDiff) * 100;
}

export function analizarVmStat(texto: string, totalBytes: number): number | null {
  const paginaMatch = /page size of (\d+)/i.exec(texto);
  if (!paginaMatch) return null;
  const paginaBytes = Number(paginaMatch[1]);

  const getPages = (campo: string): number | null => {
    const m = new RegExp(`${campo}:\\s*([\\d,]+)`).exec(texto);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const active = getPages("Pages active");
  const wired = getPages("Pages wired down");
  const compressed = getPages("Pages occupied by compressor");

  if (active === null || wired === null || compressed === null || paginaBytes === null) {
    return null;
  }

  const usedBytes = (active + wired + compressed) * paginaBytes;
  const usedMb = Math.round(usedBytes / (1024 * 1024));
  return usedMb;
}

export function analizarIoreg(texto: string): { uso: number | null; nombre: string | null } {
  let uso: number | null = null;
  let nombre: string | null = null;

  for (const linea of texto.split("\n")) {
    // Look for Device Utilization %
    const usoMatch = linea.match(/"Device Utilization %"\s*=\s*(\d+)/);
    if (usoMatch) {
      const u = Number(usoMatch[1]);
      if (!isNaN(u)) uso = u;
    }
    // Look for model
    const modelMatch = linea.match(/"model"\s*=\s*"([^"]*)"/);
    if (modelMatch) {
      nombre = modelMatch[1];
    }
  }

  return { uso, nombre };
}

export function analizarPmset(texto: string): { porcentaje: number | null; cargando: boolean | null } {
  const porcentajeMatch = /(\d+)%/.exec(texto);
  if (!porcentajeMatch) {
    return { porcentaje: null, cargando: null };
  }
  const porcentaje = Number(porcentajeMatch[1]);
  if (!Number.isFinite(porcentaje)) {
    return { porcentaje: null, cargando: null };
  }

  // Extract the state after the percentage
  // Example: "90%; charged;"
  const estadoMatch = /%\s*;\s*([^;]+)/.exec(texto);
  let cargando: boolean | null = null;
  if (estadoMatch) {
    const estado = estadoMatch[1].trim();
    cargando = estado === "charging" ? true : false;
    // Note: we treat only "charging" as true; "discharging", "charged", "AC attached" -> false
  }

  return { porcentaje, cargando };
}

// Internal measurement function (not exported)
async function medirHardwareInternal(): Promise<HardwareMac> {
  const medidoEn = Date.now();

  // CPU: two readings of os.cpus() 400ms apart
  let cpuPct: number | null = null;
  let nucleos: number | null = null;
  let carga: number | null = null;
  try {
    const antes = await cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 400));
    const despues = await cpuUsage();
    cpuPct = cpuEntre(antes, despues);
    nucleos = antes.length;
    // Load average: we can use os.loadavg()? The contract doesn't specify, but the HardwareMac has `carga`.
    // Looking at the HardwareMac interface, we have `carga`. In the context, it might be the load average.
    // However, the contract only mentions CPU % from two readings. We'll leave carga as null for now.
    // But note: the contract says the function returns { cpuPct, nucleos, carga, ... }.
    // We'll set carga to null because the contract doesn't specify how to compute it.
    // Alternatively, we can use os.loadavg()[0] for 1-minute load average? But we don't have a specification.
    // We'll set it to null and later if needed we can adjust.
  } catch {
    // ignore
  }

  // RAM
  let ramUsadaMb: number | null = null;
  let ramTotalMb: number | null = null;
  try {
    const totalBytes = totalmem();
    ramTotalMb = Math.round(totalBytes / (1024 * 1024));
    const { stdout } = await promisify(execFile)("vm_stat", [], { timeout: 3000 });
    ramUsadaMb = analizarVmStat(stdout, totalBytes);
  } catch {
    // ignore
  }

  // GPU
  let gpuPct: number | null = null;
  let gpuNombre: string | null = null;
  try {
    const { stdout } = await promisify(execFile)("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], { timeout: 3000 });
    const result = analizarIoreg(stdout);
    gpuPct = result.uso;
    gpuNombre = result.nombre;
  } catch {
    // ignore
  }

  // Disk
  let discoLibreGb: number | null = null;
  let discoTotalGb: number | null = null;
  try {
    const stats = await statfs(process.cwd());
    // stats.bfree = number of free blocks
    // stats.blocks = total number of blocks
    // stats.bsize = block size in bytes
    const libreBytes = stats.bfree * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    discoLibreGb = Number((libreBytes / (1024 * 1024 * 1024)).toFixed(2));
    discoTotalGb = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
  } catch {
    // ignore
  }

  // Battery
  let bateriaPct: number | null = null;
  let cargando: boolean | null = null;
  try {
    const { stdout } = await promisify(execFile)("pmset", ["-g", "batt"], { timeout: 3000 });
    const result = analizarPmset(stdout);
    bateriaPct = result.porcentaje;
    cargando = result.cargando;
  } catch {
    // ignore
  }

  return {
    cpuPct,
    nucleos,
    carga,
    ramUsadaMb,
    ramTotalMb,
    gpuPct,
    gpuNombre,
    discoLibreGb,
    discoTotalGb,
    bateriaPct,
    cargando,
    medidoEn,
  };
}

// Shared calculation with 3 seconds cache
const medirHardwareCompartido = compartirCalculo(medirHardwareInternal, 3000);

export { medirHardwareCompartido as medirHardware };

// Helper to get CPU usage (extracted to avoid re-importing os multiple times)
async function cpuUsage(): Promise<CpuInfo[]> {
  const { cpus } = await import("node:os");
  return cpus();
}