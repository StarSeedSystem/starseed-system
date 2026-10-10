/**
 * Hallazgos: qué hay NUEVO para cada neurona (contrato §3).
 * ══════════════════════════════════════════════════════════
 * Cruza lo instalado en la neurona con la última versión de cada fuente (sondeo) y con el
 * encaje del detector. Solo devuelve lo que importa: versiones nuevas de lo que ya usas,
 * sistemas mejores que caben, mejoras que NO caben aquí (con la neurona donde sí) y lo que
 * llega con el OS. Lo que no aporta (un sistema peor que el tuyo, o que no cabe y no mejora
 * nada) no se lista.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { evaluarEncaje, mejorNeuronaPara, type Alternativa, type Encaje } from "./detector";
import type { FamiliaSistema, HuellaAparato, SistemaMejorable, VersionInstalada, VersionRemota } from "./tipos";

export type ComparacionVersion = "igual" | "nueva" | "anterior" | "desconocida";

const RE_SHA = /^[0-9a-f]{7,40}$/i;
const RE_NUMERICA = /^\d+(?:[.-]\d+)*(?:[-+][0-9a-z.]+)?$/i;

function limpia(v: string): string {
  return v.trim().replace(/^v(?=\d)/i, "");
}

function segmentos(v: string): number[] {
  const nucleo = v.split("+")[0].replace(/-[a-z].*$/i, "");
  return nucleo.split(/[.-]/).map((x) => Number(x));
}

/**
 * Compara la versión instalada con la remota sin inventar orden:
 *  · iguales (también «v1.2» = «1.2») → igual;
 *  · dos sha → igual si uno es prefijo del otro; si no, «nueva» (la fuente da siempre la última);
 *  · numéricas (semver, fechas AAAA-MM-DD) → por segmentos; una preversión cuenta como anterior;
 *  · formatos que no casan → desconocida.
 */
export function compararVersionLibre(instalada: string | null | undefined, remota: string | null | undefined): ComparacionVersion {
  if (!instalada || !remota) return "desconocida";
  const a = limpia(instalada);
  const b = limpia(remota);
  if (!a || !b) return "desconocida";
  if (a.toLowerCase() === b.toLowerCase()) return "igual";
  if (RE_SHA.test(a) && RE_SHA.test(b) && !RE_NUMERICA.test(a) && !RE_NUMERICA.test(b)) {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x.startsWith(y) || y.startsWith(x) ? "igual" : "nueva";
  }
  if (!RE_NUMERICA.test(a) || !RE_NUMERICA.test(b)) return "desconocida";
  const sa = segmentos(a);
  const sb = segmentos(b);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i] ?? 0;
    const y = sb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return "desconocida";
    if (y > x) return "nueva";
    if (y < x) return "anterior";
  }
  // Mismo núcleo: la que lleva preversión («-rc1») es la anterior.
  const preA = /-[a-z]/i.test(a);
  const preB = /-[a-z]/i.test(b);
  if (preA && !preB) return "nueva";
  if (!preA && preB) return "anterior";
  return "desconocida";
}

export type EstadoHallazgo = "nueva-version" | "al-dia" | "instalable-nuevo" | "no-cabe" | "sin-dato" | "con-el-os";

export interface Hallazgo {
  sistema: SistemaMejorable;
  estado: EstadoHallazgo;
  encaje: Encaje;
  instalada: string | null;
  disponible: string | null;
  fecha: string | null;
  verificable: boolean;
  /** Si no cabe aquí: la neurona tuya donde sí. */
  alternativa: Alternativa | null;
  /** Por qué no hay dato de versión (fuente caída, límite de GitHub…). */
  errorFuente: string | null;
}

export interface EntradaHallazgos {
  registro: readonly SistemaMejorable[];
  huella: HuellaAparato;
  instaladas: Readonly<Record<string, VersionInstalada | undefined>>;
  remotas: Readonly<Record<string, VersionRemota | undefined>>;
  /** Las demás neuronas de la cuenta (para «mejor en otra neurona tuya»). */
  otras?: readonly HuellaAparato[];
}

/** La preferencia más alta de lo que la neurona ya tiene en cada familia. */
function mejorInstaladaPorFamilia(registro: readonly SistemaMejorable[], instaladas: EntradaHallazgos["instaladas"]): Map<FamiliaSistema, number> {
  const out = new Map<FamiliaSistema, number>();
  for (const s of registro) if (instaladas[s.id]?.version) out.set(s.familia, Math.max(out.get(s.familia) ?? 0, s.preferencia));
  return out;
}

const ORDEN: Record<EstadoHallazgo, number> = { "nueva-version": 0, "instalable-nuevo": 1, "no-cabe": 2, "sin-dato": 3, "con-el-os": 4, "al-dia": 5 };

/** Los hallazgos de UNA neurona, ordenados por lo que más importa. */
export function detectarMejoras(e: EntradaHallazgos): Hallazgo[] {
  const mejores = mejorInstaladaPorFamilia(e.registro, e.instaladas);
  const out: Hallazgo[] = [];
  for (const s of e.registro) {
    const inst = e.instaladas[s.id];
    const rem = e.remotas[s.id];
    const encaje = evaluarEncaje(s, e.huella);
    const base = {
      sistema: s,
      encaje,
      instalada: inst?.version || null,
      disponible: rem?.version || null,
      fecha: rem?.fecha || null,
      verificable: rem?.verificable === true,
      alternativa: null as Alternativa | null,
      errorFuente: rem?.error || (rem ? null : "Sin sondeo de esta fuente todavía."),
    };
    if (s.canal === "con-el-os") {
      out.push({ ...base, estado: "con-el-os" });
      continue;
    }
    if (inst?.version) {
      const c = compararVersionLibre(inst.version, rem?.version);
      out.push({ ...base, estado: c === "nueva" ? "nueva-version" : c === "desconocida" ? "sin-dato" : "al-dia" });
      continue;
    }
    // No instalado: solo interesa si mejora lo que la neurona ya usa en su familia.
    if (s.preferencia <= (mejores.get(s.familia) ?? 0)) continue;
    if (encaje.veredicto === "instalable") out.push({ ...base, estado: "instalable-nuevo" });
    else if (encaje.veredicto === "no-cabe" || encaje.veredicto === "sin-medio")
      out.push({ ...base, estado: "no-cabe", alternativa: mejorNeuronaPara(s, e.otras ?? [], e.huella.neuronaId) });
    else out.push({ ...base, estado: "sin-dato" });
  }
  return out.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.sistema.preferencia - a.sistema.preferencia || a.sistema.id.localeCompare(b.sistema.id));
}
