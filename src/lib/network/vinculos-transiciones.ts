/*
 * vinculos-transiciones — espejo PURO (sin IO) de la máquina de estados de
 * `os_mesh_vinculos` (Ola 370 · «vínculo entre cuentas con consentimiento»).
 * ---------------------------------------------------------------------------
 * Las transiciones REALES las aplican las funciones SECURITY DEFINER de
 * `supabase/migrations/20260926190000_os_mesh_vinculos.sql`
 * (`solicitar_vinculo`/`resolver_vinculo`/`revocar_vinculo`/
 * `enviar_senal_vinculo`) — el servidor manda, siempre. Este módulo NO
 * sustituye esa autoridad: es la MISMA regla escrita en TypeScript puro para
 * que (a) se pueda probar sin una base de datos y (b) la UI decida QUÉ
 * BOTONES mostrar sin adivinar (mismo patrón que `decidirAutovinculo` en
 * `malla-neuronas.ts`). Si algún día diverge de la migración, la migración
 * es la que tiene razón — actualiza este archivo para que coincida, nunca al
 * revés.
 *
 * Reglas (todas cubiertas por test, ver `__tests__/vinculos-transiciones.test.ts`):
 *   1. Solo el RECEPTOR (`a`) puede aceptar/rechazar, y solo si el vínculo
 *      sigue 'pendiente' (una sola vez).
 *   2. CUALQUIERA de los dos lados puede revocar, desde 'pendiente' (cancela
 *      la solicitud) o desde 'aceptado' (corta un vínculo activo). Nunca
 *      desde 'rechazado'/'revocado' (ya está resuelto).
 *   3. 'rechazado' y 'revocado' son terminales: ninguna acción los mueve.
 */

/** Estados posibles de una fila de `os_mesh_vinculos`. */
export type EstadoVinculo = "pendiente" | "aceptado" | "rechazado" | "revocado";

/** Acción que alguien intenta aplicar sobre un vínculo. */
export type AccionVinculo = "aceptar" | "rechazar" | "revocar";

/** Rol de quien invoca la acción, relativo al vínculo: solicitante o receptor. */
export type RolVinculo = "de" | "a";

/**
 * puedeTransicionar — ¿la acción de este rol es válida desde este estado?
 * Pura y determinista; espejo de las cláusulas `where estado = …`/`a_owner =
 * auth.uid()` de las funciones SQL. Nunca lanza.
 */
export function puedeTransicionar(estadoActual: EstadoVinculo, accion: AccionVinculo, rol: RolVinculo): boolean {
  switch (accion) {
    case "aceptar":
    case "rechazar":
      // Espejo de resolver_vinculo: solo el RECEPTOR, solo desde 'pendiente'.
      return rol === "a" && estadoActual === "pendiente";
    case "revocar":
      // Espejo de revocar_vinculo: cualquiera de los dos lados, desde
      // 'pendiente' (cancela) o 'aceptado' (corta). Nunca desde un estado
      // terminal ya resuelto.
      return estadoActual === "pendiente" || estadoActual === "aceptado";
    default:
      return false;
  }
}

/** Estado resultante de aplicar `accion` (o `null` si `puedeTransicionar` sería falso). */
export function siguienteEstado(estadoActual: EstadoVinculo, accion: AccionVinculo, rol: RolVinculo): EstadoVinculo | null {
  if (!puedeTransicionar(estadoActual, accion, rol)) return null;
  if (accion === "aceptar") return "aceptado";
  if (accion === "rechazar") return "rechazado";
  return "revocado";
}

/** ¿Este estado es TERMINAL (ninguna acción lo mueve)? */
export function esEstadoTerminal(estado: EstadoVinculo): boolean {
  return estado === "rechazado" || estado === "revocado";
}

/**
 * rolEnVinculo — de qué lado está `uid` en este vínculo (o `null` si no es
 * parte de ninguno de los dos — no debería mostrarse en su UI en absoluto).
 */
export function rolEnVinculo(v: { deOwner: string; aOwner: string }, uid: string | null | undefined): RolVinculo | null {
  if (!uid) return null;
  if (uid === v.deOwner) return "de";
  if (uid === v.aOwner) return "a";
  return null;
}

/* ------------------------------------------------------------------ */
/* Espejo puro del anti-flood de `solicitar_vinculo` (tope por hora)  */
/* ------------------------------------------------------------------ */

/** Tope de solicitudes por dispositivo emisor y hora (igual que la migración). */
export const LIMITE_SOLICITUDES_POR_HORA = 10;

/** ¿Ya se alcanzó el tope de solicitudes recientes de este dispositivo? */
export function demasiadasSolicitudesRecientes(recientes: number): boolean {
  return recientes >= LIMITE_SOLICITUDES_POR_HORA;
}

/* ------------------------------------------------------------------ */
/* Espejo puro de la comprobación de duplicado de `solicitar_vinculo` */
/* ------------------------------------------------------------------ */

/** Vista mínima de un vínculo existente para la comprobación de duplicado (sin I/O). */
export interface VinculoParaDuplicado {
  deOwner: string;
  aOwner: string;
  deDevice: string;
  aDevice: string;
  estado: EstadoVinculo;
}

/**
 * yaExisteVinculoActivo — ¿ya hay una fila 'pendiente'/'aceptado' para el
 * MISMO par exacto de dispositivos? Espejo del `exists(...)` de
 * `solicitar_vinculo`. Pura: recibe la lista ya conocida (p. ej. de
 * `useVinculos()`), nunca consulta nada por sí misma.
 */
export function yaExisteVinculoActivo(
  vinculos: VinculoParaDuplicado[],
  candidato: { deOwner: string; aOwner: string; deDevice: string; aDevice: string },
): boolean {
  return vinculos.some(
    (v) =>
      v.deOwner === candidato.deOwner &&
      v.aOwner === candidato.aOwner &&
      v.deDevice === candidato.deDevice &&
      v.aDevice === candidato.aDevice &&
      (v.estado === "pendiente" || v.estado === "aceptado"),
  );
}

/* ------------------------------------------------------------------ */
/* Espejo puro de la ventana de frescura del faro que resuelve a_owner */
/* ------------------------------------------------------------------ */

/** Ventana de frescura de un faro (igual que BEACON_FRESH_MS de server-relay.ts). */
export const FRESCURA_FARO_MS = 4 * 60_000;

/** ¿Este faro (visto por última vez en `at`) sigue lo bastante fresco para solicitar vínculo? */
export function faroSuficientementeFresco(at: number, ahora: number = Date.now()): boolean {
  return ahora - at <= FRESCURA_FARO_MS;
}
