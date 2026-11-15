/**
 * ACT1113F · ¿toca cambiar a la build publicada? Decisión pura (sin red, sin DOM).
 * Una sola salida; quien llama aplica «aplicar» o espera según el motivo.
 */

export type DecisionBuild =
  | "al-dia" // la que corre es la publicada (o no se sabe una de las dos: no se adivina)
  | "aplicar"
  | "esperar-llamada" // hay una llamada activa: nunca se cambia durante una llamada
  | "esperar-escritura" // texto sin guardar o un campo con foco
  | "esperar-red" // sin red no se puede traer la nueva: se sigue con lo que hay
  | "tope" // ya se recargó el máximo de veces en la ventana: no se insiste (se recupera solo, ver `recargasEnVentana`)
  // (ACT1114J) La página sale de una copia propia (servidor local de la app, p. ej. dentro de la APK): su /version.json
  // es la copia, recargar devuelve la MISMA build. Solo un relevo nativo o una APK nueva la cambian: aquí no se recarga.
  | "local-sin-relevo";

export interface EntradaDecisionBuild {
  corriendo: string | null;
  publicada: string | null;
  enLlamada: boolean;
  escribiendo: boolean;
  enLinea: boolean;
  recargasEstaSesion: number;
  topeRecargas: number;
  /** (ACT1114J) true si la página se sirve desde 127.0.0.1/localhost: recargar no trae otra build. */
  origenLocal?: boolean;
}

export const TOPE_RECARGAS_SESION = 2;

export function decidirCambioBuild(e: EntradaDecisionBuild): DecisionBuild {
  if (!e.corriendo || !e.publicada || e.corriendo === e.publicada) return "al-dia";
  if (e.origenLocal) return "local-sin-relevo";
  if (!e.enLinea) return "esperar-red";
  if (e.recargasEstaSesion >= e.topeRecargas) return "tope";
  if (e.enLlamada) return "esperar-llamada";
  if (e.escribiendo) return "esperar-escritura";
  return "aplicar";
}

/** Cada cuánto se mira /version.json con la pestaña abierta, y cada cuánto se reintenta si hay que esperar. */
export const MIRAR_CADA_MS = 45 * 1000; // (ACT1114J) antes 5 min: «en menos de un minuto» con la app abierta
export const REINTENTO_ESPERA_MS = 20 * 1000;

/**
 * (ACT1114J) Tope anti-bucle que se recupera solo. Antes era un contador por sesión (`ss:swreloads`, sessionStorage):
 * una app que vive días sin cerrarse (tablet en primer plano) llegaba a 2 y quedaba en «tope» para siempre.
 * Ahora son marcas de tiempo: cuentan las recargas de los últimos `VENTANA_RECARGAS_MS`; pasados 10 min desde la
 * más antigua, el tope se levanta solo. Un bucle real sigue imposible: máximo `TOPE_RECARGAS_SESION` por ventana.
 */
export const VENTANA_RECARGAS_MS = 10 * 60 * 1000;
export const CLAVE_RECARGAS_MARCAS = "ss:recargas-t";

/** PURA: cuántas marcas caen dentro de la ventana. Ignora lo que no sea número. */
export function recargasEnVentana(marcas: unknown, ahora: number, ventana = VENTANA_RECARGAS_MS): number {
  if (!Array.isArray(marcas)) return 0;
  return marcas.filter((m) => typeof m === "number" && Number.isFinite(m) && m <= ahora + 1000 && ahora - m < ventana).length;
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

function leerMarcas(a: Almacen | null): number[] {
  try {
    const v = JSON.parse(a?.getItem(CLAVE_RECARGAS_MARCAS) || "[]");
    return Array.isArray(v) ? v.filter((m) => typeof m === "number") : [];
  } catch { return []; }
}

export function recargasHechasEnVentana(a: Almacen | null, ahora = Date.now()): number {
  return recargasEnVentana(leerMarcas(a), ahora);
}

/** Anota una recarga y devuelve si se puede (false = tope en la ventana: no se recarga). */
export function anotarRecarga(a: Almacen | null, ahora = Date.now(), tope = TOPE_RECARGAS_SESION): boolean {
  const marcas = leerMarcas(a).filter((m) => ahora - m < VENTANA_RECARGAS_MS);
  if (marcas.length >= tope) return false;
  try { a?.setItem(CLAVE_RECARGAS_MARCAS, JSON.stringify([...marcas, ahora])); } catch { /* sin almacén: se recarga igual (una vez por llamada) */ }
  return true;
}

// ── (ACT1114J) Dónde está la build publicada y qué se anota ─────────────────────────────────────────────────
export const ORIGEN_PUBLICADO = "https://starseed-os.vercel.app";

/** PURA: ¿esta página sale de una copia local (servidor propio de la app) y no de la web publicada? */
export function esOrigenLocal(hostname: string | null | undefined): boolean {
  return /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i.test(String(hostname ?? ""));
}

/** PURA: URL de /version.json de lo PUBLICADO. En copia local hay que ir al origen publicado (si no, se lee a sí misma). */
export function urlVersionPublicada(hostname: string | null | undefined): string {
  return esOrigenLocal(hostname) ? `${ORIGEN_PUBLICADO}/version.json` : "/version.json";
}

/** PURA: el texto del registro, una línea por comprobación que decide. */
export function lineaVersionWeb(mia: string | null, publicada: string | null, decision: DecisionBuild | "sin-dato" | "sin-id", origen: "local" | "publicado"): string {
  const t = (x: string | null) => (x && /^[\w/-]{1,80}$/.test(x) ? x : "?");
  return `web-version comprobada mia=${t(mia)} publicada=${t(publicada)} decision=${decision} origen=${origen}`;
}
