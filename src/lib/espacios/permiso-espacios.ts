/**
 * PERMISO DE LOS SPACES PÚBLICOS DE HUGGING FACE (ESP1011B).
 * Contratos: architecture/astraura-avatares-3d.md §11.2 y architecture/astraura-imagenes.md §3.
 * Vive por cuenta en `starseed.astraura.intelligence.v1` (ya sincronizada, sin migraciones):
 * apagado por defecto, se pregunta UNA vez, la administración del OS lo tiene encendido por
 * la decisión de Alex del 2026-10-11 y las fotos de personas piden consentimiento por imagen.
 */
import { CLAVE_INTELIGENCIA } from "@/lib/astraura/capas-conciencia";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import { safeGet, safeSet } from "@/lib/safe-storage";
/** Campo dentro de las preferencias sincronizadas de Astraura. */
export const CAMPO_PERMISO_ESPACIOS = "espaciosHf";
/** `permitido`: aceptó salir a un Space. `preguntado`: ya respondió (no se repite). */
export interface PreferenciaEspaciosHf { permitido: boolean; preguntado: boolean }

export type OrigenPermiso = "guardado" | "administracion" | "defecto";

export interface PermisoEspaciosResuelto extends PreferenciaEspaciosHf {
  preguntarAhora: boolean;
  origen: OrigenPermiso;
}

/** `esCuentaDeAdministracion`: dueña de MetaGenesis, como la identifica el OS. */
export interface ContextoPermisoEspacios { guardada?: unknown; esCuentaDeAdministracion?: boolean }

/** Spaces públicos de 3D que decidió Alex en §11.2. */
export const ESPACIOS_3D = [
  { id: "TencentARC/Pixal3D", nombre: "Pixal3D", uso: "modelos 3D con textura (primera opción)" },
  { id: "microsoft/TRELLIS.2", nombre: "TRELLIS.2", uso: "modelos 3D de respaldo" },
] as const;

export interface AlmacenPreferencias {
  get(clave: string): string | null;
  set(clave: string, valor: string): boolean;
}

export const almacenDePreferencias: AlmacenPreferencias = { get: safeGet, set: safeSet };
/** Normaliza lo guardado (objeto actual o booleano heredado). `null` = nunca se preguntó. */
export function normalizarPreferenciaEspacios(valor: unknown): PreferenciaEspaciosHf | null {
  if (typeof valor === "boolean") return { permitido: valor, preguntado: true };
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const o = valor as Record<string, unknown>;
  if (typeof o.permitido !== "boolean") return null;
  return { permitido: o.permitido, preguntado: o.preguntado !== false };
}
/** Lo guardado manda; sin nada, la administración está encendida y las demás cuentas, no. */
export function resolverPermisoEspacios(c: ContextoPermisoEspacios = {}): PermisoEspaciosResuelto {
  const guardada = normalizarPreferenciaEspacios(c.guardada);
  if (guardada) return { ...guardada, preguntado: true, preguntarAhora: false, origen: "guardado" };
  if (c.esCuentaDeAdministracion === true) {
    return { permitido: true, preguntado: true, preguntarAhora: false, origen: "administracion" };
  }
  return { permitido: false, preguntado: false, preguntarAhora: true, origen: "defecto" };
}

/** El booleano que come `capacidadesDe` (`Hierro.permiteEspacioHf`). */
export function permiteEspacioHf(p: Pick<PermisoEspaciosResuelto, "permitido"> | boolean | null | undefined): boolean {
  return typeof p === "boolean" ? p : p?.permitido === true;
}

/** Lista `espacios` de `planImagen`: ids del catálogo (no ids del Space) con Space verificado. */
export function espaciosParaPlan(
  p: Pick<PermisoEspaciosResuelto, "permitido"> | boolean | null | undefined,
  catalogo: readonly { id: string; espacio?: string }[] = MODELOS_IMAGEN,
): string[] {
  if (!permiteEspacioHf(p)) return [];
  return catalogo.filter((m) => !!m.espacio).map((m) => m.id);
}

/** Una foto de personas sale solo con el permiso de la cuenta Y el de esa imagen. */
export function permiteFotoDePersonas(
  p: Pick<PermisoEspaciosResuelto, "permitido"> | boolean | null | undefined,
  consentimientoPorImagen: boolean,
): boolean {
  return permiteEspacioHf(p) && consentimientoPorImagen === true;
}

/** Lee lo guardado en las preferencias sincronizadas (nunca lanza). */
export function leerPreferenciaEspacios(almacen: AlmacenPreferencias = almacenDePreferencias): PreferenciaEspaciosHf | null {
  try {
    const crudo = almacen.get(CLAVE_INTELIGENCIA);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as unknown;
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
    return normalizarPreferenciaEspacios((datos as Record<string, unknown>)[CAMPO_PERMISO_ESPACIOS]);
  } catch {
    return null;
  }
}

/** Guarda la respuesta sin pisar el resto de preferencias y avisa a la sincronización. */
export function guardarPreferenciaEspacios(
  pref: Pick<PreferenciaEspaciosHf, "permitido">,
  almacen: AlmacenPreferencias = almacenDePreferencias,
): boolean {
  let datos: Record<string, unknown> = {};
  try {
    const crudo = almacen.get(CLAVE_INTELIGENCIA);
    const leido = crudo ? (JSON.parse(crudo) as unknown) : null;
    if (leido && typeof leido === "object" && !Array.isArray(leido)) datos = { ...(leido as Record<string, unknown>) };
  } catch {
    datos = {};
  }
  datos[CAMPO_PERMISO_ESPACIOS] = { permitido: pref.permitido === true, preguntado: true };
  const ok = almacen.set(CLAVE_INTELIGENCIA, JSON.stringify(datos));
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("starseed:astraura-intelligence"));
  } catch {
    // sin ventana (pruebas de servidor): el dato ya está guardado
  }
  return ok;
}

/** Resuelve el permiso leyendo el aparato; la administración la dice quien llama. */
export function resolverPermisoEspaciosGuardado(
  esCuentaDeAdministracion = false,
  almacen: AlmacenPreferencias = almacenDePreferencias,
): PermisoEspaciosResuelto {
  return resolverPermisoEspacios({ guardada: leerPreferenciaEspacios(almacen), esCuentaDeAdministracion });
}
