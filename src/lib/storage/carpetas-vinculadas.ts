"use client";

/**
 * CARPETAS VINCULADAS (Adenda 193) — el antiguo permiso «Archivos», ahora real.
 * ----------------------------------------------------------------------------
 * «Archivos» pedía UNA carpeta y no dejaba rastro: no se podía añadir otra, ni
 * conectar un almacenamiento externo, ni enlazarlas con los cerebros. Este
 * módulo es la fuente única de verdad de las carpetas de conocimiento de esta
 * neurona:
 *   · carpetas del DISPOSITIVO (File System Access, varias, con nombre real),
 *   · almacenamientos de SERVICIOS externos (Google Drive, Dropbox, OneDrive,
 *     Nextcloud/WebDAV, S3…), declarados aquí y autenticados en Integraciones.
 *
 * Lo que se guarda es METADATO (id, nombre, tipo, servicio, fecha): los
 * `FileSystemDirectoryHandle` viven en memoria de la sesión — el navegador NO
 * permite persistirlos en localStorage, y decirlo es más honesto que fingir un
 * acceso permanente. Al reabrir, la carpeta sigue LISTADA y basta un clic para
 * volver a concederla (`reconectarCarpeta`).
 *
 * Quien las consume: el paso de Permisos del rito (alta), el paso de Cerebros
 * (las vincula solas al cerebro principal) y la pestaña de Agentes (permisos
 * de lectura por agente). SSR-safe y fail-open: sin navegador, lista vacía.
 */

export type TipoCarpeta = "dispositivo" | "servicio";

export type ServicioAlmacenamiento =
  | "google-drive" | "dropbox" | "onedrive" | "nextcloud" | "s3" | "otro";

export interface CarpetaVinculada {
  id: string;
  nombre: string;
  tipo: TipoCarpeta;
  /** Solo si tipo === "servicio". */
  servicio?: ServicioAlmacenamiento;
  /** Pista de ruta/carpeta remota (informativa; el acceso real lo da el handle o la integración). */
  ruta?: string;
  /** ¿Hay handle vivo en ESTA sesión? (solo carpetas de dispositivo). */
  vivo?: boolean;
  agregadaEn: number;
}

export const SERVICIOS: { id: ServicioAlmacenamiento; label: string; nota: string }[] = [
  { id: "google-drive", label: "Google Drive", nota: "Se autoriza en Integraciones; aquí queda declarada y lista para vincular." },
  { id: "dropbox", label: "Dropbox", nota: "Se autoriza en Integraciones." },
  { id: "onedrive", label: "OneDrive", nota: "Se autoriza en Integraciones." },
  { id: "nextcloud", label: "Nextcloud / WebDAV", nota: "Servidor propio: URL y credenciales en Integraciones." },
  { id: "s3", label: "S3 / compatible", nota: "Bucket propio: credenciales en la bóveda." },
  { id: "otro", label: "Otro almacenamiento", nota: "Cualquier servicio con API; se conecta en Integraciones." },
];

const LS_KEY = "starseed.carpetas.v1";
export const CARPETAS_EVENT = "starseed:carpetas";

/** Handles vivos de la sesión (no serializables: el navegador no los persiste). */
const handles = new Map<string, unknown>();

function leer(): CarpetaVinculada[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.id === "string" && typeof c.nombre === "string")
      .map((c) => ({ ...c, vivo: handles.has(c.id) })) as CarpetaVinculada[];
  } catch {
    return [];
  }
}

function escribir(lista: CarpetaVinculada[]): void {
  if (typeof window === "undefined") return;
  try {
    // `vivo` es estado de sesión: no se persiste.
    const limpio = lista.map(({ vivo: _v, ...resto }) => resto);
    window.localStorage.setItem(LS_KEY, JSON.stringify(limpio));
    window.dispatchEvent(new CustomEvent(CARPETAS_EVENT, { detail: lista }));
  } catch { /* cuota o modo privado: la sesión sigue funcionando en memoria */ }
}

/** Todas las carpetas vinculadas de esta neurona. */
export function listarCarpetas(): CarpetaVinculada[] {
  return leer();
}

/** Suscripción a cambios (alta/baja/reconexión). Devuelve el des-suscriptor. */
export function suscribirCarpetas(cb: (lista: CarpetaVinculada[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb(leer());
  window.addEventListener(CARPETAS_EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(CARPETAS_EVENT, h);
    window.removeEventListener("storage", h);
  };
}

function nuevoId(): string {
  try { return crypto.randomUUID(); } catch { return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
}

/** ¿Este navegador puede abrir carpetas del dispositivo (File System Access)? */
export function soportaCarpetasDispositivo(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Abre el selector de carpetas del sistema y AÑADE la elegida (no reemplaza:
 * se pueden vincular varias). Devuelve la carpeta o null si se canceló.
 */
export async function agregarCarpetaDispositivo(): Promise<CarpetaVinculada | null> {
  if (!soportaCarpetasDispositivo()) return null;
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<{ name: string }> }).showDirectoryPicker;
    const handle = await picker({ mode: "readwrite" });
    const lista = leer();
    // Misma carpeta por nombre: se reconecta en vez de duplicar.
    const ya = lista.find((c) => c.tipo === "dispositivo" && c.nombre === handle.name);
    if (ya) {
      handles.set(ya.id, handle);
      escribir(lista);
      return { ...ya, vivo: true };
    }
    const carpeta: CarpetaVinculada = {
      id: nuevoId(), nombre: handle.name, tipo: "dispositivo", vivo: true, agregadaEn: Date.now(),
    };
    handles.set(carpeta.id, handle);
    escribir([...lista, carpeta]);
    return carpeta;
  } catch {
    return null; // cancelado por el usuario o permiso denegado
  }
}

/** Vuelve a pedir el acceso a una carpeta ya listada (tras reabrir el OS). */
export async function reconectarCarpeta(id: string): Promise<boolean> {
  const c = leer().find((x) => x.id === id);
  if (!c || c.tipo !== "dispositivo") return false;
  const nueva = await agregarCarpetaDispositivo();
  return !!nueva;
}

/** Declara un almacenamiento de servicio externo (se autentica en Integraciones). */
export function agregarCarpetaServicio(servicio: ServicioAlmacenamiento, ruta?: string): CarpetaVinculada {
  const meta = SERVICIOS.find((s) => s.id === servicio);
  const carpeta: CarpetaVinculada = {
    id: nuevoId(),
    nombre: ruta?.trim() || meta?.label || "Almacenamiento externo",
    tipo: "servicio", servicio, ruta: ruta?.trim() || undefined, agregadaEn: Date.now(),
  };
  escribir([...leer(), carpeta]);
  return carpeta;
}

/** Quita una carpeta de la lista (no borra NADA en el disco ni en el servicio). */
export function quitarCarpeta(id: string): void {
  handles.delete(id);
  escribir(leer().filter((c) => c.id !== id));
}

/** Handle vivo de esta sesión, si lo hay (para leer/escribir de verdad). */
export function handleDeCarpeta(id: string): unknown | null {
  return handles.get(id) ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Puente con los CEREBROS: cada carpeta vinculada es un «servidor» del cerebro
 * (kind `local` para el dispositivo, `service` para un almacenamiento externo).
 * El paso de Cerebros del rito llama a `serversDeCarpetas` para que TODO lo que
 * el usuario eligió en Permisos aparezca ya enlazado al cerebro principal.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ServidorCerebroCarpeta {
  id: string;
  kind: string;
  name: string;
  notes?: string;
  /** Marca de origen: así se reconocen (y actualizan) sin pisar otros servidores. */
  carpetaId: string;
  /** Compatibilidad con `BrainServer` (admite campos extra por tipo). */
  [k: string]: unknown;
}

/** Convierte las carpetas vinculadas en servidores para `Brain.servers`. */
export function serversDeCarpetas(lista?: CarpetaVinculada[]): ServidorCerebroCarpeta[] {
  return (lista ?? leer()).map((c) => ({
    id: `carpeta:${c.id}`,
    kind: c.tipo === "dispositivo" ? "local" : "service",
    name: c.nombre,
    notes: c.tipo === "dispositivo"
      ? "Carpeta de este dispositivo vinculada en la configuración inicial."
      : `Almacenamiento externo (${c.servicio ?? "servicio"}) vinculado en la configuración inicial.`,
    carpetaId: c.id,
  }));
}

/**
 * Mezcla las carpetas en los servidores de un cerebro SIN duplicar ni borrar
 * los que el usuario haya añadido a mano (solo se recalculan los `carpeta:*`).
 */
export function mezclarCarpetasEnServidores(
  servidores: { id: string; [k: string]: unknown }[] | undefined | null,
  lista?: CarpetaVinculada[],
): { id: string; [k: string]: unknown }[] {
  const otros = (servidores ?? []).filter((s) => !String(s.id).startsWith("carpeta:"));
  return [...otros, ...serversDeCarpetas(lista)];
}
