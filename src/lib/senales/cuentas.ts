/**
 * cuentas — a quién pertenece cada señal del mapa, y el ANONIMATO de las ajenas (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Tres clases, sin mezclar:
 *   · propia  — una neurona o enlace que el servidor verificó como de TU cuenta;
 *   · otra    — un faro de otra cuenta. La red NO revela quién es: el mapa tampoco (ni nombre ni
 *               ids en pantalla) SALVO que esa cuenta haya elegido mostrarse en el radar público
 *               («visible», `starseed.publico`): entonces se ve lo que ELLA marcó compartir (nombre,
 *               foto, tipo de aparato) y tú puedes apagar esa vista (`verPublicos`);
 *   · ninguna — no declara cuenta StarSeed (BLE, Wi-Fi, un nodo LoRa ajeno, un puerto serie…).
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { avatarUrlSegura } from "./perfil-centro";
import type { Cuenta, FiltroCuenta } from "./tipos-vivo";

export const ETIQUETA_AJENA = "Neurona de otra cuenta";

export function cuentaDe(s: DetectedSignal): Cuenta {
  if (!s.starseed) return "ninguna";
  return s.starseed.ownAccount ? "propia" : "otra";
}

/** Un enlace directo sin internet lo emparejó la persona a propósito: se enseña lo que declara. */
function esEnlaceDirecto(s: DetectedSignal): boolean {
  return s.starseed?.via === "direct-link";
}

/** Una cuenta ajena que decidió mostrarse en el radar público: sus datos públicos se pueden enseñar. */
export function esPublica(s: DetectedSignal): boolean {
  return cuentaDe(s) === "otra" && s.starseed?.publico === true;
}

/**
 * Las señales de otras cuentas pierden su nombre (y su foto), salvo las que se muestran a propósito en
 * el radar público si `verPublicos`. Sin permiso → anónimas, siempre. Con varias, un sufijo estable («#2») las
 * distingue entre sí sin identificarlas (el orden sale del id, no de la cuenta). Conserva
 * `starseed.sourceId` porque las acciones reales lo necesitan, pero NUNCA se enseña.
 * Devuelve la MISMA referencia para todo lo que no es ajeno.
 */
export function anonimizarAjenas(senales: readonly DetectedSignal[], opciones: { verPublicos?: boolean } = {}): DetectedSignal[] {
  const verPublicos = opciones.verPublicos !== false;
  const aMostrar = (s: DetectedSignal) => verPublicos && esPublica(s);
  const ajenas = senales.filter((s) => cuentaDe(s) === "otra" && !esEnlaceDirecto(s) && !aMostrar(s)).map((s) => s.id).sort();
  const n = ajenas.length;
  return senales.map((s) => {
    if (cuentaDe(s) !== "otra" || esEnlaceDirecto(s) || !s.starseed || aMostrar(s)) return s;
    const idx = ajenas.indexOf(s.id) + 1;
    return {
      ...s,
      label: n > 1 ? `${ETIQUETA_AJENA} #${idx}` : ETIQUETA_AJENA,
      starseed: { ...s.starseed, name: null, neuronId: undefined, avatarUrl: undefined, publico: undefined, deviceKind: undefined },
    };
  });
}

export function contarPorCuenta(senales: readonly DetectedSignal[]): Record<FiltroCuenta, number> {
  const r: Record<FiltroCuenta, number> = { todas: senales.length, propia: 0, otra: 0, ninguna: 0 };
  for (const s of senales) r[cuentaDe(s)]++;
  return r;
}

export function filtrarPorCuenta(senales: readonly DetectedSignal[], filtro: FiltroCuenta): DetectedSignal[] {
  return filtro === "todas" ? [...senales] : senales.filter((s) => cuentaDe(s) === filtro);
}

/**
 * Qué foto lleva una marca. Un aparato o un enlace de TU cuenta lleva la foto de tu perfil (todos tus
 * aparatos son de la misma cuenta); una cuenta ajena solo lleva la suya si decidió mostrarse en el radar
 * público Y compartir la foto, y la dirección pasa el filtro de seguridad. Todo lo demás (BLE, Wi-Fi,
 * LoRa ajeno, ajenas anónimas) va sin foto.
 */
export function avatarDeSenal(s: DetectedSignal, avatarPropio: string | null): string | null {
  const c = cuentaDe(s);
  if (c === "propia") return avatarUrlSegura(avatarPropio);
  if (c === "otra" && esPublica(s)) return avatarUrlSegura(s.starseed?.avatarUrl);
  return null;
}
