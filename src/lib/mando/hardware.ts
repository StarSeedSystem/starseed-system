import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { totalmem, cpus, loadavg } from 'node:os';
import { compartirCalculo } from './calculo-compartido';
import { promisify } from 'node:util';
const execFilePromise = promisify(execFile);
export interface HardwareMac { cpuPct: number | null; nucleos: number | null; carga: number | null; ramUsadaMb: number | null; ramTotalMb: number | null; gpuPct: number | null; gpuNombre: string | null; discoLibreGb: number | null; discoTotalGb: number | null; bateriaPct: number | null; cargando: boolean | null; medidoEn: number; }
export function analizarVmStat(t: string, b: number): number | null { if (!t || b <= 0) return null; const ls = t.split('\n'); const p: Record<string, number> = {}; let tp = 0; for (const l of ls) { const m = l.match(/^\s*(\w+(?:\s+\w+)*)[::]?\s*[\.]*\s*(\d+)/); if (!m) continue; const k = m[1].toLowerCase().replace(/\s/g, '_'); const v = parseInt(m[2], 10); if (!isNaN(v)) { p[k] = v; tp += v; } } if (tp === 0) return null; const ps = b / tp; const a = p['pages_active'] ?? 0; const w = p['pages_wired_down'] ?? 0; const c = p['pages_occupied_by_compressor'] ?? 0; return Math.round(((a + w + c) * ps) / (1024 * 1024) * 10) / 10; }
export function analizarIoreg(t: string): { gpuPct: number | null; gpuNombre: string | null } { if (!t) return { gpuPct: null, gpuNombre: null }; const gpuPctM = t.match(/\"Device Utilization \%\"\=(\d+)/); const gpuNombreM = t.match(/\"model\"\=\"([^\"]+)\"/); return { gpuPct: gpuPctM ? parseInt(gpuPctM[1], 10) : null, gpuNombre: gpuNombreM ? gpuNombreM[1] : null }; }
export function analizarPmset(t: string): { bateriaPct: number | null; cargando: boolean | null } { if (!t) return { bateriaPct: null, cargando: null }; const pctM = t.match(/(\d+)%/); const bateriaPct = pctM ? parseInt(pctM[1], 10) : null; const l = t.toLowerCase(); let c: boolean | null = null; if (l.includes('charging') || l.includes('ac attached')) c = true; else if (l.includes('discharging') || l.includes('charged')) c = false; return { bateriaPct, cargando: c }; }
export function cpuEntre(a: ReturnType<typeof cpus>, d: ReturnType<typeof cpus>): number { let ta = 0, td = 0, ia = 0, id = 0; for (const c of a) { ta += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq; ia += c.times.idle; } for (const c of d) { td += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq; id += c.times.idle; } const dt = td - ta; const di = id - ia; return dt <= 0 ? 0 : Math.round(100 * (dt - di) / dt); }
export const medirHardware: () => Promise<HardwareMac> = compartirCalculo(async () => {
  const medidoEn = Date.now();
  const antes = cpus();
  await new Promise(r => setTimeout(r, 400));
  const despues = cpus();
  const cpuPct = cpuEntre(antes, despues);
  const nucleos = antes.length;
  const totalBytes = totalmem();
  let ramUsadaMb: number | null = null;
  try { const { stdout: vmstat } = await execFilePromise('vm_stat', [], { encoding: 'utf8', timeout: 3000 }); ramUsadaMb = analizarVmStat(vmstat, totalBytes); } catch (_) {}
  const ramTotalMb = Math.round(totalBytes / (1024 * 1024));
  let gpuPct: number | null = null;
  let gpuNombre: string | null = null;
  try { const { stdout: ioreg } = await execFilePromise('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8', timeout: 3000 }); const r = analizarIoreg(ioreg); gpuPct = r.gpuPct; gpuNombre = r.gpuNombre; } catch (_) {}
  let discoLibreGb: number | null = null;
  let discoTotalGb: number | null = null;
  try { const fs = await statfs(process.cwd()); const bsize = fs.bsize; const free = fs.bfree; const total = fs.blocks; discoLibreGb = Math.round((free * bsize) / (1024 ** 3) * 10) / 10; discoTotalGb = Math.round((total * bsize) / (1024 ** 3) * 10) / 10; } catch (_) {}
  let bateriaPct: number | null = null;
  let cargando: boolean | null = null;
  try { const { stdout: pmset } = await execFilePromise('pmset', ['-g', 'batt'], { encoding: 'utf8', timeout: 3000 }); const r = analizarPmset(pmset); bateriaPct = r.bateriaPct; cargando = r.cargando; } catch (_) {}
  const carga = loadavg()[0];
  return { cpuPct, nucleos, carga, ramUsadaMb, ramTotalMb, gpuPct, gpuNombre, discoLibreGb, discoTotalGb, bateriaPct, cargando, medidoEn };
}, 3000);