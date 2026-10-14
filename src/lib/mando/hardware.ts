import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { cpus, totalmem, loadavg } from 'node:os';
import { compartirCalculo } from './calculo-compartido';

/**
 * Resultado de la medición de hardware en la Mac.
 */
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

/**
 * Analiza la salida de `vm_stat` para obtener la memoria usada en MB.
 * @param texto Salida completa del comando `vm_stat`
 * @param totalBytes Memoria total del sistema en bytes
 * @return Memoria usada en MB o null si no se puede analizar
 */
export function analizarVmStat(texto: string, totalBytes: number): number | null {
  let pageSize = 0;
  let active = 0;
  let wired = 0;
  let compressed = 0;

  // Extract page size from anywhere in the text
  const pageSizeMatch = texto.match(/page size of (\d+) bytes/);
  if (pageSizeMatch) {
    pageSize = parseInt(pageSizeMatch[1], 10);
  } else {
    return null; // Cannot determine page size
  }

  // Look for the memory statistics lines
  const activeMatch = texto.match(/Pages active:\s*(\d+)\./);
  if (activeMatch) {
    active = parseInt(activeMatch[1], 10);
  }
  const wiredMatch = texto.match(/Pages wired down:\s*(\d+)\./);
  if (wiredMatch) {
    wired = parseInt(wiredMatch[1], 10);
  }
  // Look for compressed memory: could be "Pages occupied by compressor:" or "Pages compressed:"
  const compressedMatch = texto.match(/Pages (?:occupied by compressor|compressed):\s*(\d+)\./);
  if (compressedMatch) {
    compressed = parseInt(compressedMatch[1], 10);
  }

  // If we didn't get any of the essential values, return null
  if (pageSize === 0 || active === 0 || wired === 0 || compressed === 0) {
    // Note: it's possible that the values are actually zero, but in practice on a real system they are not zero.
    // We'll assume that if any of these is zero, we failed to parse.
    return null;
  }

  const usedPages = active + wired + compressed;
  const usedBytes = usedPages * pageSize;
  const usedMb = usedBytes / (1024 * 1024);

  return usedMb;
}

/**
 * Analiza la salida de `ioreg` para obtener el uso de GPU y el nombre del modelo.
 * @param texto Salida completa del comando `ioreg -r -d 1 -c IOAccelerator`
 * @return Objeto con gpuPct y gpuNombre o null si no se puede analizar
 */
export function analizarIoreg(texto: string): { gpuPct: number | null; gpuNombre: string | null } {
  let gpuPct: number | null = null;
  let gpuNombre: string | null = null;

  const lines = texto.split('\n');
  for (const line of lines) {
    // Look for "Device Utilization %" = N
    if (gpuPct === null) {
      const utilMatch = line.match(/"Device Utilization %"\s*=\s*(\d+)/);
      if (utilMatch) {
        gpuPct = parseInt(utilMatch[1], 10);
      }
    }
    // Look for "model" = "<name>"
    if (gpuNombre === null) {
      const modelMatch = line.match(/"model"\s*=\s*"([^"]*)"/);
      if (modelMatch) {
        gpuNombre = modelMatch[1];
      }
    }
    // Break early if we found both
    if (gpuPct !== null && gpuNombre !== null) {
      break;
    }
  }

  return { gpuPct, gpuNombre };
}

/**
 * Analiza la salida de `pmset -g batt` para obtener el porcentaje de batería y si está cargando.
 * @param texto Salida completa del comando `pmset -g batt`
 * @return Objeto con bateriaPct y cargando o null si no se puede analizar
 */
export function analizarPmset(texto: string): { bateriaPct: number | null; cargando: boolean | null } {
  let bateriaPct: number | null = null;
  let cargando: boolean | null = null;

  // Look for the percentage: NN%
  const pctMatch = texto.match(/(\d+)%/);
  if (pctMatch) {
    bateriaPct = parseInt(pctMatch[1], 10);
  }

  // Look for the state: charging, discharging, charged, AC attached
  // We'll look for these keywords after the percentage
  const stateMatch = texto.match(/%;\s*(charging|discharging|charged|AC attached)/);
  if (stateMatch) {
    const state = stateMatch[1];
    if (state === 'charging' || state === 'AC attached') {
      cargando = true;
    } else if (state === 'discharging' || state === 'charged') {
      cargando = false;
    }
    // If state is something else, we leave cargando as null
  }

  return { bateriaPct, cargando };
}

/**
 * Calcula el porcentaje de CPU a partir de dos muestras de `os.cpus()`.
 * @param antes Primera muestra de `os.cpus()`
 * @param despues Segunda muestra tomada 400 ms después
 * @return Porcentaje de CPU usado (0-100) o null si no se puede calcular
 */
export function cpuEntre(antes: ReturnType<typeof cpus>, despues: ReturnType<typeof cpus>): number | null {
  if (antes.length === 0 || despues.length === 0 || antes.length !== despues.length) {
    return null;
  }

  let totalIdle = 0;
  let totalTotal = 0;

  for (let i = 0; i < antes.length; i++) {
    const a = antes[i];
    const d = despues[i];

    const idleBefore = a.times.idle;
    const idleAfter = d.times.idle;

    const totalBefore = a.times.user + a.times.nice + a.times.sys + a.times.irq + a.times.idle;
    const totalAfter = d.times.user + d.times.nice + d.times.sys + d.times.irq + d.times.idle;

    const idleDelta = idleAfter - idleBefore;
    const totalDelta = totalAfter - totalBefore;

    if (totalDelta <= 0) {
      // Avoid division by zero or negative delta
      continue;
    }

    totalIdle += idleDelta;
    totalTotal += totalDelta;
  }

  if (totalTotal <= 0) {
    return null;
  }

  // CPU usage = 1 - (totalIdle / totalTotal)
  const usage = 1 - totalIdle / totalTotal;
  return Math.max(0, Math.min(100, usage * 100)); // Clamp between 0 and 100
}

/**
 * Mide el hardware de la Mac y devuelve una promesa con los resultados.
 * Utiliza caché de 3 segundos mediante `compartirCalculo`.
 */
export const medirHardware: () => Promise<HardwareMac> = compartirCalculo(async () => {
  const medidoEn = Date.now();
  let cpuPct: number | null = null;
  let nucleos: number | null = null;
  let carga: number | null = null;
  let ramUsadaMb: number | null = null;
  let ramTotalMb: number | null = null;
  let gpuPct: number | null = null;
  let gpuNombre: string | null = null;
  let discoLibreGb: number | null = null;
  let discoTotalGb: number | null = null;
  let bateriaPct: number | null = null;
  let cargando: boolean | null = null;

    try {
      // CPU: two readings of os.cpus() separated by 400 ms
      const antes = cpus();
      // Wait 400 ms
      await new Promise(resolve => setTimeout(resolve, 400));
      const despues = cpus();
      cpuPct = cpuEntre(antes, despues);
      if (cpuPct !== null) {
        nucleos = antes.length;
        // Load average: we can get from loadavg()? The contract says "carga" is the load average?
        // In the interface we have "carga". In the contract for hardware, it doesn't specify what "carga" is.
        // However, in the Interface HardwareServidor in the contract we see:
        //   cpuPct: number | null;
        //   nucleos: number | null;
        //   carga: number | null;
        //   ... 
        // We'll assume "carga" is the system load average (1 minute) from loadavg().
        const cargaAvg = loadavg(); // Returns [1min, 5min, 15min]
        carga = cargaAvg[0]; // 1 minute average
      }
    } catch (e) {
      // CPU measurement failed, leave as null
    }

   try {
     // RAM: total memory and used memory via vm_stat
     ramTotalMb = totalmem() / (1024 * 1024); // Convert bytes to MB
     const { stdout: vmStatOutBuf } = await execFile('vm_stat', [], { maxBuffer: 1024 * 1024 });
     const vmStatOut = vmStatOutBuf !== null ? vmStatOutBuf.toString() : '';
     const ramUsed = analizarVmStat(vmStatOut, totalmem());
     if (ramUsed !== null) {
       ramUsadaMb = ramUsed;
     }
   } catch (e) {
     // RAM measurement failed
   }

   try {
     // GPU: ioreg
     const { stdout: ioregOutBuf } = await execFile('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { maxBuffer: 1024 * 1024 });
     const ioregOut = ioregOutBuf !== null ? ioregOutBuf.toString() : '';
     const gpuInfo = analizarIoreg(ioregOut);
     gpuPct = gpuInfo.gpuPct;
     gpuNombre = gpuInfo.gpuNombre;
   } catch (e) {
     // GPU measurement failed
   }

   try {
     // Disk: statfs of current directory
     const stats = await statfs(process.cwd());
     // bsize: block size in bytes
     // bavail: free blocks available to unprivileged process
     // blocks: total blocks
     const blockSize = stats.bsize;
     const freeBlocks = stats.bavail;
     const totalBlocks = stats.blocks;
     discoLibreGb = (freeBlocks * blockSize) / (1024 * 1024 * 1024); // Convert to GB
     discoTotalGb = (totalBlocks * blockSize) / (1024 * 1024 * 1024); // Convert to GB
   } catch (e) {
     // Disk measurement failed
   }

   try {
     // Battery: pmset -g batt
     const      { stdout: pmsetOutBuf } = await execFile('pmset', ['-g', 'batt'], { maxBuffer: 1024 * 1024 });
     const pmsetOut = pmsetOutBuf !== null ? pmsetOutBuf.toString() : '';
     const batteryInfo = analizarPmset(pmsetOut);
     bateriaPct = batteryInfo.bateriaPct;
     cargando = batteryInfo.cargando;
   } catch (e) {
     // Battery measurement failed
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
}, 3000); // 3 seconds validity
