import { promises as fs } from 'node:fs'; import path from 'node:path'; import os from 'node:os';
export interface VentanaCredito { id: string; etiqueta: string; usado_pct: number; reinicia: string | null }
export interface Saldo { valor: number; unidad: string }
export interface MedidorCredito {
  id: string; proveedor: string; nombre?: string; tipo: string; plan?: string | null;
  ventanas?: unknown; saldo: Saldo | null; extras?: Record<string, unknown>;
  fuente?: string; leido?: string; ok?: boolean; obsoleto?: boolean; error?: string | null; enlace?: string;
}
export interface DocCreditos { version: number; t: string; medidores: Record<string, MedidorCredito>; historial?: unknown }
export async function leerCreditosPago(ruta = path.join(os.homedir(), '.starseed', 'medidores-credito.json')): Promise<DocCreditos | null> {
  try { const d = await fs.readFile(ruta, 'utf8'); return JSON.parse(d) as DocCreditos } catch { return null }
}
type Tono = 'peligro' | 'aviso' | 'ok'; const tonoDePorcentaje = (p: number): Tono => p >= 90 ? 'peligro' : p >= 70 ? 'aviso' : 'ok';
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es', o).format(d);
export interface VentanaEstado { id: string; etiqueta: string; usado_pct: number; reinicia: string | null; tono: Tono; queda: number; reiniciada: boolean; minutosParaReinicio: number | null }
export interface MedidorEstado { id: string; nombre: string; proveedor: string; plan?: string | null; tono: Tono; haceMin: number | null; obsoleto: boolean; resumen: string; textoExtras: string[]; ventanas: VentanaEstado[]; saldo: Saldo | null; ok?: boolean }

function ventanasNormalizadas(m: MedidorCredito): VentanaCredito[] {
  if (!Array.isArray(m.ventanas)) return [];
  return m.ventanas.map((v: unknown) => {
    const vv = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { id: typeof vv.id === 'string' ? vv.id : '', etiqueta: typeof vv.etiqueta === 'string' ? vv.etiqueta : '', usado_pct: typeof vv.usado_pct === 'number' ? vv.usado_pct : 0, reinicia: typeof vv.reinicia === 'string' ? vv.reinicia : null };
  });
}

export function estadoCreditos(doc: DocCreditos | null, ahora: number): MedidorEstado[] {
  if (!doc || !doc.medidores) return [];
  const orden = [...Object.values(doc.medidores)].sort((a, b) => {
    const prio = (id: string) => id === 'claude' ? 0 : id === 'codex' ? 1 : 2;
    return prio(a.id) !== prio(b.id) ? prio(a.id) - prio(b.id) : (a.nombre ?? a.id).localeCompare(b.nombre ?? b.id);
  });
  return orden.map((m) => estadoMedidor(m, ahora));
}

function estadoMedidor(m: MedidorCredito, ahora: number): MedidorEstado {
  const leidoMs = m.leido ? Date.parse(m.leido) : NaN;
  const haceMin = Number.isFinite(leidoMs) ? Math.floor((ahora - leidoMs) / 60000) : null;
  const obsoleto = Boolean(m.obsoleto) || (haceMin !== null && haceMin > 45);
  const ventanasCrudas = ventanasNormalizadas(m);
  const ventanas = ventanasCrudas.map((v) => {
    const reiniciaMs = v.reinicia ? Date.parse(v.reinicia) : NaN;
    const esFechaValida = Number.isFinite(reiniciaMs);
    const reiniciada = esFechaValida && reiniciaMs <= ahora;
    const usado = reiniciada ? 0 : v.usado_pct;
    return { id: v.id, etiqueta: v.etiqueta, usado_pct: usado, reinicia: v.reinicia, tono: tonoDePorcentaje(usado), queda: Math.max(0, 100 - usado), reiniciada, minutosParaReinicio: esFechaValida ? Math.max(0, Math.floor((reiniciaMs - ahora) / 60000)) : null };
  });
  let tono: Tono = ventanas.reduce<Tono>((a, v) => v.tono === 'peligro' ? 'peligro' : v.tono === 'aviso' && a !== 'peligro' ? 'aviso' : a, 'ok');
  if (ventanas.length === 0 && m.ok === false) tono = 'aviso';
  if (obsoleto && tono === 'ok') tono = 'aviso';
  const nombre = m.nombre ?? m.id;
  return { id: m.id, nombre, proveedor: m.proveedor, plan: m.plan ?? null, tono, haceMin, obsoleto, resumen: resumenCredito(m, ahora), textoExtras: textoExtras(m), ventanas, saldo: m.saldo, ok: m.ok };
}

export function resumenCredito(m: MedidorCredito, ahora?: number): string {
  const ventanas = ventanasNormalizadas(m);
  const ordenadas = [...ventanas].sort((a, b) => {
    const aMs = ahora !== undefined ? (a.reinicia ? Date.parse(a.reinicia) : NaN) : NaN;
    const bMs = ahora !== undefined ? (b.reinicia ? Date.parse(b.reinicia) : NaN) : NaN;
    const usadoA = (Number.isFinite(aMs) && aMs <= (ahora ?? -Infinity)) ? 0 : a.usado_pct;
    const usadoB = (Number.isFinite(bMs) && bMs <= (ahora ?? -Infinity)) ? 0 : b.usado_pct;
    return usadoB - usadoA;
  });
  if (!ordenadas.length) {
    if (m.saldo) { const val = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m.saldo.valor); return `saldo ${val} ${m.saldo.unidad}`; }
    return 'sin lectura';
  }
  const v = ordenadas[0];
  const reiniciaMs = v.reinicia ? Date.parse(v.reinicia) : NaN;
  const aVal = ahora !== undefined ? (ahora ?? 0) : -Infinity;
  const reiniciada = Number.isFinite(reiniciaMs) && reiniciaMs <= aVal;
  const usado = reiniciada ? 0 : v.usado_pct;
  if (v.reinicia && Number.isFinite(reiniciaMs)) {
    const f = new Date(reiniciaMs);
    const dia = fmt(f, { weekday: 'short' }); const hora = fmt(f, { hour: 'numeric', minute: '2-digit', hour12: false });
    return `${usado} % ${v.id} · reinicia ${dia} ${hora}`;
  }
  return `${usado} % ${v.id}`;
}

export function textoExtras(m: MedidorCredito): string[] {
  const e = m.extras ?? {}, out: string[] = [];
  if (m.error && typeof m.error === 'string') out.push(`error: ${m.error}`);
  const r = typeof e.reinicios_gratis === 'number' ? (e.reinicios_gratis as number) : 0;
  const v = typeof e.reinicio_gratis_vence === 'string' ? (e.reinicio_gratis_vence as string) : '';
  if (r > 0 && v) { const f = new Date(v); const dia = fmt(f, { day: 'numeric', month: 'short' }).replace(/\.$/, ''); out.push(`${r} reinicio${r > 1 ? 's' : ''} gratis hasta el ${dia}`); }
  if (typeof e.bloqueado === 'string') out.push(`bloqueado: ${e.bloqueado}`);
  if (e.uso_normal === false) out.push('uso normal cortado');
  return out;
}
