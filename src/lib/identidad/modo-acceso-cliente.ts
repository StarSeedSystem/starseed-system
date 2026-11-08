/**
 * (IDN1108B) Lectura del modo de acceso EN EL CLIENTE para la sesión sin internet (§5.1).
 *
 * `decidirModoAcceso` es pura, pero vive en `modo-sin-internet.ts` y nadie la llamaba desde el
 * navegador: aquí se junta su entrada real (sesión en caché + certificado propio, anclas y
 * revocaciones de ESTA neurona) para el caso «sin red». El servicio de identidad se importa
 * DENTRO de la función para no engordar el layout raíz (CLAUDE.md, trampa 11).
 *
 * Reglas duras: sin `node:*` (lo importa el cliente), nunca lanza: ante cualquier fallo, null.
 * Solo informa del modo y su etiqueta; no redirige ni toca la sesión.
 */

import type { AnclaCuenta } from "./certificado-neurona";
import { decidirModoAcceso, type DecisionAcceso } from "./modo-sin-internet";

/** Lo mínimo que se necesita de `localStorage` para saber si hay sesión guardada. */
export interface AlmacenSesion {
  length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
}

/** Lo mínimo que se usa del servicio de identidad (`servicio.ts`). */
export interface ServicioAcceso {
  certificadoPropio(): Promise<unknown>;
  anclas: { listar(): Promise<readonly AnclaCuenta[]> };
  revocaciones: {
    cargar(): Promise<unknown>;
    estaRevocada(r: { mfp: string; neuronaId: string; huella: string }): boolean;
  };
  estado(): Promise<{ neuronaId: string }>;
}

/** Dependencias inyectables para probar sin navegador, sin IndexedDB y sin reloj real. */
export interface DepsModoAcceso {
  sesionEnCache?: () => boolean | Promise<boolean>;
  servicio?: () => Promise<ServicioAcceso>;
  ahora?: () => number;
}

/** `sb-<proyecto>-auth-token` y sus trozos `.0`, `.1`… (mismo patrón que la cookie de sesión). */
const CLAVE_DE_SESION = /^sb-.+-auth-token(\.\d+)?$/;

export function esClaveDeSesionSupabase(clave: string): boolean {
  return CLAVE_DE_SESION.test(clave);
}

export function haySesionEnCache(almacen: AlmacenSesion | null | undefined): boolean {
  if (!almacen) return false;
  try {
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i);
      if (!clave || !esClaveDeSesionSupabase(clave)) continue;
      const valor = almacen.getItem(clave);
      if (typeof valor === "string" && valor.trim() !== "") return true;
    }
  } catch {
    return false;
  }
  return false;
}

function almacenDelNavegador(): AlmacenSesion | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function servicioDelNavegador(): Promise<ServicioAcceso> {
  const { servicioIdentidad } = await import("./servicio");
  return servicioIdentidad();
}

export async function modoAccesoSinRed(deps: DepsModoAcceso = {}): Promise<DecisionAcceso | null> {
  try {
    const sesionEnCache = deps.sesionEnCache ? await deps.sesionEnCache() : haySesionEnCache(almacenDelNavegador());
    const servicio = await (deps.servicio ? deps.servicio() : servicioDelNavegador());
    const certificado = await servicio.certificadoPropio();
    const anclas = await servicio.anclas.listar();
    await servicio.revocaciones.cargar();
    const neuronaId = (await servicio.estado()).neuronaId;
    return await decidirModoAcceso({
      enLinea: false,
      fallaRed: true,
      sesionVerificada: false,
      sesionEnCache,
      certificado,
      anclas,
      estaRevocada: (r) => servicio.revocaciones.estaRevocada(r),
      esperado: { neuronaId },
      ahora: deps.ahora?.(),
    });
  } catch {
    return null;
  }
}
