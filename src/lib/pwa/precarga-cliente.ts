/**
 * Precarga sin conexión — lado de la página (SW1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════
 * Habla con el service worker (`public/sw-v8.js`): le pide una pasada de precarga, le pide que olvide
 * lo guardado con datos de la sesión al cerrarla y recibe su estado. Quien decide si toca precargar
 * (datos móviles, ahorro de datos, espacio, servidor local) es el SW, no esto.
 *
 * SSR-safe (nada de `window` al importarse), sin dependencias y NUNCA lanza.
 * Contrato: architecture/apps-autonomas-sin-internet.md §9.1.
 */

/** Lo que el SW cuenta de la precarga (`resumenEstado` de public/sw-logica.js). */
export interface EstadoPrecarga {
  buildId: string | null;
  fase: string | null;
  nivel: string | null;
  completo: boolean;
  guardados: number;
  planificados: number;
  permanentes: number;
  transitorios: number;
  rutas: number;
  rutasTotales: number;
  bytes: number;
  motivo: string | null;
  terminado: number | null;
}

/** Nombre de la caché de respuestas de API del SW (igual que `CACHE_API` de public/sw-logica.js; lo prueba un test). */
export const CACHE_API_SW = "starseed-api-v1";
export const EVENTO_PRECARGA = "starseed:precarga";

interface Destino {
  postMessage(m: unknown): void;
}
export interface NavegadorSW {
  serviceWorker?: {
    controller?: Destino | null;
    ready?: Promise<{ active?: Destino | null }>;
  };
  storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> };
  userAgent?: string;
}

function navegadorPorDefecto(): NavegadorSW | undefined {
  return typeof navigator !== "undefined" ? (navigator as unknown as NavegadorSW) : undefined;
}

/** Manda un mensaje al SW que controla la página (o, si aún no controla, al activo cuando esté listo). */
export function enviarAlSW(mensaje: unknown, nav: NavegadorSW | undefined = navegadorPorDefecto()): boolean {
  try {
    const sw = nav?.serviceWorker;
    if (!sw) return false;
    if (sw.controller) {
      sw.controller.postMessage(mensaje);
      return true;
    }
    if (!sw.ready) return false;
    sw.ready.then((r) => r.active?.postMessage(mensaje)).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Pide una pasada de precarga. `forzar` = aunque haya datos móviles o ahorro de datos (botón «Descargar»). */
export function pedirPrecarga(forzar = false, nav?: NavegadorSW): boolean {
  return enviarAlSW({ tipo: "PRECARGAR", forzar }, nav ?? navegadorPorDefecto());
}

/**
 * Al cerrar sesión: el SW borra las respuestas de API y las páginas con datos de la sesión. La caché de
 * API se borra además desde aquí, por si esta pestaña no tiene SW que la controle.
 */
export async function olvidarSesionSinConexion(nav?: NavegadorSW, almacen?: Pick<CacheStorage, "delete">): Promise<void> {
  enviarAlSW({ tipo: "OLVIDAR_SESION" }, nav ?? navegadorPorDefecto());
  try {
    const c = almacen ?? (typeof caches !== "undefined" ? caches : undefined);
    await c?.delete(CACHE_API_SW);
  } catch {
    /* sin Cache API */
  }
}

/** ¿Es un estado de precarga del SW? (los mensajes del SW se comprueban antes de usarlos). */
export function esEstadoPrecarga(x: unknown): x is EstadoPrecarga {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return typeof e.completo === "boolean" && typeof e.guardados === "number" && typeof e.planificados === "number";
}

/** Saca el estado de un mensaje del SW (`{tipo:"starseed:precarga", estado}`), o null. */
export function estadoDeMensaje(data: unknown): EstadoPrecarga | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { tipo?: unknown; estado?: unknown };
  return d.tipo === EVENTO_PRECARGA && esEstadoPrecarga(d.estado) ? d.estado : null;
}

/**
 * Pide al navegador que no borre lo guardado cuando falte espacio. Solo en la app instalada (PWA o
 * nativa), y nunca en Firefox (allí abre un aviso de permiso; Chrome y Safari deciden sin preguntar).
 */
export async function pedirAlmacenPersistente(instalada: boolean, nav: NavegadorSW | undefined = navegadorPorDefecto()): Promise<boolean> {
  try {
    if (!instalada || !nav?.storage?.persist) return false;
    if (/firefox/i.test(nav.userAgent || "")) return false;
    if (nav.storage.persisted && (await nav.storage.persisted())) return true;
    return await nav.storage.persist();
  } catch {
    return false;
  }
}
