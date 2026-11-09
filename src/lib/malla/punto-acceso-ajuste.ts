/**
 * punto-acceso-ajuste — «Permitir red directa por punto de acceso (la Mac deja su Wi‑Fi mientras dure)» (WFA1109A).
 * Por aparato, APAGADO por defecto, con migración (regla de actualización: un cambio de defecto revisa lo ya
 * guardado). Contrato: architecture/wifi-directo.md §6. La lógica pura (plan de migración, textos) está en `wifi-p2p.ts`.
 */

import { CLAVE_MARCA_PUNTO_ACCESO, CLAVE_PUNTO_ACCESO, leerPuntoAcceso, planMigracionPuntoAcceso } from "./wifi-p2p";

let memoria: boolean | null = null;
let migrado = false;
const oyentes = new Set<() => void>();

function almacen(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Aplica la migración una vez por carga de la página (idempotente: la marca queda escrita). */
export function migrarPuntoAcceso(a: Pick<Storage, "getItem" | "setItem"> | null = almacen()): void {
  if (!a) return;
  try {
    const plan = planMigracionPuntoAcceso(a.getItem(CLAVE_MARCA_PUNTO_ACCESO), a.getItem(CLAVE_PUNTO_ACCESO));
    if (plan.valor !== null) a.setItem(CLAVE_PUNTO_ACCESO, plan.valor);
    if (plan.marca !== null) a.setItem(CLAVE_MARCA_PUNTO_ACCESO, plan.marca);
  } catch {
    /* sin almacenamiento: vale el defecto (apagado) */
  }
}

/** ¿Permitió la persona la red directa por punto de acceso? Apagado si nunca lo tocó. */
export function puntoAccesoPermitido(): boolean {
  if (memoria !== null) return memoria;
  const a = almacen();
  if (!migrado) {
    migrado = true;
    migrarPuntoAcceso(a);
  }
  try {
    return leerPuntoAcceso(a?.getItem(CLAVE_PUNTO_ACCESO));
  } catch {
    return false;
  }
}

export function fijarPuntoAcceso(v: boolean): void {
  memoria = v;
  const a = almacen();
  try {
    migrarPuntoAcceso(a); // la marca al día antes de guardar: esta elección no la pisa la migración
    a?.setItem(CLAVE_PUNTO_ACCESO, v ? "1" : "0");
  } catch {
    /* vale esta sesión */
  }
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
}

export function suscribirPuntoAcceso(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** Solo para pruebas. */
export function reiniciarPuntoAccesoParaPruebas(): void {
  memoria = null;
  migrado = false;
}
