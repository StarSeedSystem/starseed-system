/**
 * Avatares 3D · CAMBIOS EN TIEMPO REAL (AV1011). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Personalizar es aplicar CAMBIOS pequeños al ADN: el editor, el dictado por voz, un mando MIDI o
 * Astraura producen el mismo `CambioAvatar`. Tres velocidades, para no repetir el disparate de las
 * 25 000 peticiones al día:
 *   · pantalla: cada cambio se ve al instante en tu aparato (sin red);
 *   · otros presentes: se agrupan por clave y se emiten como mucho a 10 Hz (menos con mucha gente) y
 *     NUNCA si no hay nadie más mirando;
 *   · guardado: solo tras 5 s de calma y como mucho uno cada 30 s, o al cerrar el editor.
 * PURO: el reloj se inyecta.
 */
import {
  BASES, EXPRESIONES, MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, VISIBILIDADES,
  acotar01, esColor, esRefInterna, materialPorDefecto, sanearAdn, texto,
  type AdnAvatar, type BaseAvatar, type EstiloMovimiento, type Expresion, type Material, type Morfologia,
  type SlotMaterial, type SlotPieza, type Visibilidad,
} from "./adn";

export type CambioAvatar =
  | { op: "morfologia"; clave: Morfologia; valor: number }
  | { op: "material"; slot: SlotMaterial; campo: keyof Material; valor: string | number }
  | { op: "pieza"; slot: SlotPieza; ref: string | null; tinte?: string }
  | { op: "expresion"; clave: Expresion; valor: number }
  | { op: "aura"; campo: "tono" | "intensidad" | "ligadaEmocion"; valor: number | boolean }
  | { op: "movimiento"; campo: keyof EstiloMovimiento; valor: number }
  | { op: "base"; tipo: BaseAvatar; ref?: string }
  | { op: "nombre"; valor: string }
  | { op: "visibilidad"; valor: Visibilidad };

const CAMPOS_MATERIAL = ["color", "metal", "rugosidad", "emisivo"] as const;
const CAMPOS_MOV = ["energia", "amplitud", "ritmo", "postura"] as const;
const en = (l: readonly string[], v: unknown): boolean => typeof v === "string" && l.includes(v);
const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Un cambio que llega de fuera (red, voz, MIDI) → cambio válido o `null`. */
export function sanearCambio(v: unknown): CambioAvatar | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  switch (c.op) {
    case "morfologia": return en(MORFOLOGIA, c.clave) && esNum(c.valor) ? { op: "morfologia", clave: c.clave as Morfologia, valor: acotar01(c.valor) } : null;
    case "expresion": return en(EXPRESIONES, c.clave) && esNum(c.valor) ? { op: "expresion", clave: c.clave as Expresion, valor: acotar01(c.valor) } : null;
    case "material": {
      if (!en(SLOTS_MATERIAL, c.slot) || !en(CAMPOS_MATERIAL, c.campo)) return null;
      const slot = c.slot as SlotMaterial, campo = c.campo as keyof Material;
      if (campo === "color") return esColor(c.valor) ? { op: "material", slot, campo, valor: c.valor.toLowerCase() } : null;
      return esNum(c.valor) ? { op: "material", slot, campo, valor: acotar01(c.valor) } : null;
    }
    case "pieza": {
      if (!en(SLOTS_PIEZA, c.slot) || (c.ref !== null && !esRefInterna(c.ref))) return null;
      const out: CambioAvatar = { op: "pieza", slot: c.slot as SlotPieza, ref: c.ref as string | null };
      if (c.ref !== null && esColor(c.tinte)) out.tinte = c.tinte.toLowerCase();
      return out;
    }
    case "aura":
      if (c.campo === "ligadaEmocion") return typeof c.valor === "boolean" ? { op: "aura", campo: "ligadaEmocion", valor: c.valor } : null;
      if (c.campo === "tono") return esNum(c.valor) ? { op: "aura", campo: "tono", valor: ((Math.round(c.valor) % 360) + 360) % 360 } : null;
      return c.campo === "intensidad" && esNum(c.valor) ? { op: "aura", campo: "intensidad", valor: acotar01(c.valor) } : null;
    case "movimiento": return en(CAMPOS_MOV, c.campo) && esNum(c.valor) ? { op: "movimiento", campo: c.campo as keyof EstiloMovimiento, valor: acotar01(c.valor) } : null;
    case "base":
      if (!en(BASES, c.tipo)) return null;
      if (c.tipo === "vrm" || c.tipo === "glb-rig") return esRefInterna(c.ref) ? { op: "base", tipo: c.tipo, ref: c.ref } : null;
      return { op: "base", tipo: c.tipo as BaseAvatar };
    case "nombre": { const t = texto(c.valor, 40); return t ? { op: "nombre", valor: t } : null; }
    case "visibilidad": return en(VISIBILIDADES, c.valor) ? { op: "visibilidad", valor: c.valor as Visibilidad } : null;
    default: return null;
  }
}

/** Aplica un cambio sin mutar el original. Pasa por `sanearAdn`: lo que no cabe se rechaza (devuelve el mismo ADN). */
export function aplicarCambio(adn: AdnAvatar, cambio: CambioAvatar): AdnAvatar {
  const c = sanearCambio(cambio);
  if (!c) return adn;
  const n: AdnAvatar = structuredClone(adn);
  switch (c.op) {
    case "morfologia": n.morfologia[c.clave] = c.valor; break;
    case "expresion": n.expresionBase[c.clave] = c.valor; break;
    case "material": {
      const m = n.materiales[c.slot] ?? materialPorDefecto();
      n.materiales[c.slot] = { ...m, [c.campo]: c.valor };
      break;
    }
    case "pieza":
      n.piezas = n.piezas.filter((p) => p.slot !== c.slot);
      if (c.ref) n.piezas.push(c.tinte ? { slot: c.slot, ref: c.ref, tinte: c.tinte } : { slot: c.slot, ref: c.ref });
      break;
    case "aura": (n.aura as Record<string, number | boolean>)[c.campo] = c.valor; break;
    case "movimiento": n.movimiento[c.campo] = c.valor; break;
    case "base":
      n.base = c.ref ? { tipo: c.tipo, ref: c.ref } : { tipo: c.tipo };
      if (c.tipo === "vrm") n.esqueleto = { tipo: "vrm-humanoide", articulaciones: 55 };
      if (c.tipo === "orbe" || c.tipo === "procedural") n.esqueleto = { tipo: "ninguno", articulaciones: 0 };
      break;
    case "nombre": n.nombre = c.valor; break;
    case "visibilidad": n.visibilidad = c.valor; break;
  }
  n.rev = adn.rev + 1;
  return sanearAdn(n) ?? adn;
}

export const aplicarCambios = (adn: AdnAvatar, cs: readonly CambioAvatar[]): AdnAvatar => cs.reduce(aplicarCambio, adn);

/** Clave para agrupar: dos cambios con la misma clave se pisan (solo viaja el último). */
export function claveCambio(c: CambioAvatar): string {
  switch (c.op) {
    case "morfologia": case "expresion": return `${c.op}.${c.clave}`;
    case "material": return `material.${c.slot}.${c.campo}`;
    case "pieza": return `pieza.${c.slot}`;
    case "aura": case "movimiento": return `${c.op}.${c.campo}`;
    default: return c.op;
  }
}

/** Cambios que llevan de `a` a `b` (propuestas y votaciones: se vota el diff, no el avatar entero). */
export function diffAdn(a: AdnAvatar, b: AdnAvatar): CambioAvatar[] {
  const out: CambioAvatar[] = [];
  if (a.base.tipo !== b.base.tipo || a.base.ref !== b.base.ref) out.push(b.base.ref ? { op: "base", tipo: b.base.tipo, ref: b.base.ref } : { op: "base", tipo: b.base.tipo });
  if (a.nombre !== b.nombre) out.push({ op: "nombre", valor: b.nombre });
  if (a.visibilidad !== b.visibilidad) out.push({ op: "visibilidad", valor: b.visibilidad });
  for (const k of MORFOLOGIA) if ((a.morfologia[k] ?? 0.5) !== (b.morfologia[k] ?? 0.5)) out.push({ op: "morfologia", clave: k, valor: b.morfologia[k] ?? 0.5 });
  for (const k of EXPRESIONES) if ((a.expresionBase[k] ?? 0) !== (b.expresionBase[k] ?? 0)) out.push({ op: "expresion", clave: k, valor: b.expresionBase[k] ?? 0 });
  for (const s of SLOTS_MATERIAL) {
    const ma = a.materiales[s], mb = b.materiales[s];
    if (!mb) continue;
    for (const campo of CAMPOS_MATERIAL) if (ma?.[campo] !== mb[campo]) out.push({ op: "material", slot: s, campo, valor: mb[campo] });
  }
  for (const s of SLOTS_PIEZA) {
    const pa = a.piezas.find((p) => p.slot === s), pb = b.piezas.find((p) => p.slot === s);
    if (pa?.ref !== pb?.ref || pa?.tinte !== pb?.tinte) out.push(pb ? { op: "pieza", slot: s, ref: pb.ref, ...(pb.tinte ? { tinte: pb.tinte } : {}) } : { op: "pieza", slot: s, ref: null });
  }
  for (const campo of ["tono", "intensidad", "ligadaEmocion"] as const) if (a.aura[campo] !== b.aura[campo]) out.push({ op: "aura", campo, valor: b.aura[campo] });
  for (const campo of CAMPOS_MOV) if (a.movimiento[campo] !== b.movimiento[campo]) out.push({ op: "movimiento", campo, valor: b.movimiento[campo] });
  return out;
}

/* ── Envío en vivo y guardado ─────────────────────────────────────────────── */

export interface ColaEnvio { pendientes: Map<string, CambioAvatar>; ultimoEnvio: number }
export const crearColaEnvio = (): ColaEnvio => ({ pendientes: new Map(), ultimoEnvio: -Infinity });
export function encolar(cola: ColaEnvio, c: CambioAvatar): void { cola.pendientes.set(claveCambio(c), c); }

/** Mismo presupuesto que las poses de la escena: 10 Hz; 4–7 más: ~6,7 Hz; 8 o más: 4 Hz; nadie: no se emite. */
export function intervaloEnvioMs(otrosPresentes: number): number {
  if (otrosPresentes <= 0) return Infinity;
  return otrosPresentes >= 8 ? 250 : otrosPresentes >= 4 ? 150 : 100;
}

/** Devuelve el lote a emitir ahora (y vacía la cola) o `null` si toca esperar o no hay nadie. */
export function lote(cola: ColaEnvio, ahora: number, otrosPresentes: number): CambioAvatar[] | null {
  if (cola.pendientes.size === 0) return null;
  if (otrosPresentes <= 0) { cola.pendientes.clear(); return null; }
  if (ahora - cola.ultimoEnvio < intervaloEnvioMs(otrosPresentes)) return null;
  const out = [...cola.pendientes.values()];
  cola.pendientes.clear();
  cola.ultimoEnvio = ahora;
  return out;
}

export const CALMA_GUARDADO_MS = 5_000;
export const ENTRE_GUARDADOS_MS = 30_000;
/** ¿Toca guardar en la Biblioteca? Tras 5 s sin tocar nada y 30 s desde el último guardado, o al cerrar. */
export function debeGuardar(p: { sinGuardar: boolean; ultimoCambio: number; ultimoGuardado: number; ahora: number; cerrando: boolean }): boolean {
  if (!p.sinGuardar) return false;
  if (p.cerrando) return true;
  return p.ahora - p.ultimoCambio >= CALMA_GUARDADO_MS && p.ahora - p.ultimoGuardado >= ENTRE_GUARDADOS_MS;
}
