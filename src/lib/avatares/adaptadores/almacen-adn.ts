"use client";

import { useCallback, useEffect, useState } from "react";
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { sanearAdn } from "@/lib/avatares/adn/adn";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

/**
 * Almacén de ADN de AVATAR (AV1011D). Contrato: architecture/astraura-avatares-3d.md §12.
 *
 * Qué es de verdad (basta de ilusiones):
 *  · Cada ADN es una entrada con su visibilidad (privado/grupo/público), guardada en el `localStorage` de ESTE
 *    aparato bajo su id (`biblioteca:<id>`), y solo lo que `sanearAdn` admite llega a escribirse.
 *  · «grupo» y «publico» hoy solo ETIQUETAN: nada se publica ni se comparte con otras personas todavía.
 *  · Se espeja a la cuenta (`user_settings.prefs`) de ida; NO baja a otros aparatos (la clave no está en
 *    SYNCED_KEYS, ver architecture/persistencia-entre-medios.md §6.4). Por eso hay un tope de entradas.
 *  · No hay copia en memoria: cada lectura va al almacén, así nunca se sirve una revisión vieja.
 *  · PENDIENTE (honesto): el almacén es de TODO el aparato, sin separar por cuenta, y el espejo sube el mapa entero.
 *    Si dos cuentas comparten aparato, el ADN «privado» de una acaba en las preferencias de la otra. Antes de la fase
 *    de sincronía hay que filtrar el espejo a los dueños de la cuenta activa (su perfil, sus bots y sus entidades) o
 *    separar la clave por usuario. Contrato: architecture/astraura-avatares-3d.md §12.
 */

export const ADN_AVATAR_KIND = "avatar-adn";
const ADN_STORAGE_KEY = "starseed.avatar.adn.v1";
const ADN_EVENT = "starseed:avatar-adn";

export interface AdnEntry {
  id: string;
  kind: typeof ADN_AVATAR_KIND;
  title: string;
  url?: string;
  origin?: string;
  savedAt: number;
  rev: number;
  visibilidad: "privado" | "grupo" | "publico";
  raw: string; // ADN serializado JSON
}

export interface UseAdnEntry {
  entry: AdnEntry | null;
  loading: boolean;
  loadAdn: (ref: string, rev?: number) => Promise<AdnEntry | null>;
  saveAdn: (adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]) => Promise<void>;
  invalidateCache: (ref: string) => void;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emitAdnChange(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(ADN_EVENT));
  } catch {}
}

/** Leer el storage (localStorage) crudo: JSON serializado { [ref]: AdnEntry }. Lo que no sea una entrada se descarta. */
function readStorage(): Record<string, AdnEntry> {
  if (!isClient()) return {};
  try {
    const raw = localStorage.getItem(ADN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AdnEntry>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, e]) => e && typeof e === "object"));
  } catch {
    return {};
  }
}

/** Escribir de vuelta el storage completo. Devuelve `false` si el aparato no lo dejó escribir (lleno o bloqueado). */
function writeStorage(data: Record<string, AdnEntry>): boolean {
  if (!isClient()) return false;
  try {
    localStorage.setItem(ADN_STORAGE_KEY, JSON.stringify(data));
  } catch {
    return false;
  }
  emitAdnChange();
  return true;
}

/** Espejo de ida a la cuenta (el almacén entero bajo su clave); un fallo de red no rompe el guardado local. */
function espejarACuenta(data: Record<string, AdnEntry>): void {
  void mergeUserPrefs({ [ADN_STORAGE_KEY]: data }).catch(() => {});
}

/** Tope de ADN guardados: viajan en `user_settings.prefs` y esa columna no puede crecer sin freno. */
export const MAX_ADN_GUARDADOS = 24;

/** Clave de un ADN en el almacén: SIEMPRE su id (dos dueños con la misma malla base no se pisan). */
export const refDeAdn = (adn: Pick<AdnAvatar, "id">): string => `biblioteca:${adn.id}`;

/** Id nuevo de un ADN: un UUID, único entre aparatos y personas (la hora sola chocaría al llegar a la Biblioteca real). */
export function nuevoIdAdn(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `adn-${crypto.randomUUID()}`;
  } catch {
    // sin crypto: respaldo de abajo
  }
  return `adn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Avisa cuando el almacén cambia: en esta pestaña (evento propio) y en otra del mismo aparato (`storage`).
 * Devuelve la función que deja de escuchar.
 */
export function suscribirCambiosAdn(alCambiar: () => void): () => void {
  if (!isClient()) return () => {};
  const alStorage = (e: StorageEvent) => { if (e.key === null || e.key === ADN_STORAGE_KEY) alCambiar(); };
  window.addEventListener(ADN_EVENT, alCambiar);
  window.addEventListener("storage", alStorage);
  return () => {
    window.removeEventListener(ADN_EVENT, alCambiar);
    window.removeEventListener("storage", alStorage);
  };
}

/** Dueño que consta dentro del ADN guardado, o `null` si la entrada está rota. */
function duenoDeEntrada(e: AdnEntry): AdnAvatar["dueno"] | null {
  try {
    const d = (JSON.parse(e.raw) as { dueno?: { tipo?: unknown; id?: unknown } }).dueno;
    return d && typeof d.tipo === "string" && typeof d.id === "string" ? ({ tipo: d.tipo, id: d.id } as AdnAvatar["dueno"]) : null;
  } catch {
    return null;
  }
}

/** Rechaza, con un motivo que se puede enseñar, pisar una entrada guardada más nueva o que es de otro dueño. */
function comprobarContraGuardada(guardada: AdnEntry, nuevo: AdnAvatar): void {
  if (guardada.rev > nuevo.rev) throw new Error(`Hay una revisión más nueva de este avatar (rev ${guardada.rev}): recarga antes de guardar.`);
  const d = duenoDeEntrada(guardada);
  if (d && (d.tipo !== nuevo.dueno.tipo || d.id !== nuevo.dueno.id)) throw new Error("Ese id de avatar ya pertenece a otro dueño: usa un id nuevo.");
}

/**
 * Guarda el ADN (validado por `sanearAdn`) bajo su id y devuelve su clave. La visibilidad se sella DENTRO del ADN y
 * en la entrada (siempre coinciden). Se rechaza, con un motivo que se puede enseñar: una revisión más vieja que la
 * guardada (gana la más alta, contrato §2), un id que ya es de otro dueño, pasar del tope de avatares y un aparato
 * que no deja escribir (nunca se dice «guardado» si no lo está). Las entradas antiguas del mismo id guardadas bajo
 * otra clave (la malla base) se recolocan, pero pasan por las MISMAS comprobaciones de revisión y dueño.
 */
export async function saveAdnToLibrary(adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]): Promise<string> {
  const cleaned = sanearAdn({ ...adn, visibilidad });
  if (!cleaned) throw new Error("ADN inválido por sanearAdn");
  const refKey = refDeAdn(cleaned);
  const existing = readStorage();
  const previo = existing[refKey];
  const antiguas = Object.keys(existing).filter((k) => k !== refKey && existing[k].id === cleaned.id);
  for (const guardada of [previo, ...antiguas.map((k) => existing[k])]) if (guardada) comprobarContraGuardada(guardada, cleaned);
  for (const k of antiguas) delete existing[k];
  if (!previo && Object.keys(existing).length >= MAX_ADN_GUARDADOS) throw new Error(`Ya tienes ${MAX_ADN_GUARDADOS} avatares guardados: quita alguno antes de guardar otro.`);
  existing[refKey] = {
    id: cleaned.id,
    kind: ADN_AVATAR_KIND,
    title: cleaned.nombre || "Avatar",
    url: refKey,
    origin: "avatar",
    savedAt: Date.now(),
    rev: cleaned.rev,
    visibilidad: cleaned.visibilidad,
    raw: JSON.stringify(cleaned),
  };

  if (!writeStorage(existing)) throw new Error("Este aparato no dejó guardar el avatar (almacenamiento lleno o bloqueado).");
  espejarACuenta(existing);
  return refKey;
}

/** Cargar una entrada por su ref; con `rev`, solo si es exactamente esa revisión. Lee siempre el almacén (sin copia que envejezca). */
export async function loadAdnEntry(ref: string, rev?: number): Promise<AdnEntry | null> {
  const entry = readStorage()[ref];
  if (!entry) return null;
  if (rev !== undefined && entry.rev !== rev) return null;
  return entry;
}

/** Hook reactivo: carga y suscribe un ADN por ref. */
export function useAdnEntry(ref: string, rev?: number): UseAdnEntry {
  const [state, setState] = useState<{ entry: AdnEntry | null; loading: boolean }>({ entry: null, loading: !!ref });

  useEffect(() => {
    let alive = true;
    if (!ref) {
      if (alive) setState({ entry: null, loading: false });
      return;
    }

    const load = async () => {
      try {
        const entry = await loadAdnEntry(ref, rev);
        if (!alive) return;
        setState({ entry, loading: false });
      } catch {
        if (alive) setState({ entry: null, loading: false });
      }
    };

    void load();

    const onChange = () => {
      void load();
    };
    window.addEventListener(ADN_EVENT, onChange);

    return () => {
      alive = false;
      window.removeEventListener(ADN_EVENT, onChange);
    };
  }, [ref, rev]);

  const loadAdn = useCallback(async (r: string, rev?: number) => {
    try {
      const entry = await loadAdnEntry(r, rev);
      setState({ entry, loading: false });
      return entry;
    } catch {
      setState({ entry: null, loading: false });
      return null;
    }
  }, []);

  const saveAdn = useCallback(async (adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]) => {
    const refGuardado = await saveAdnToLibrary(adn, visibilidad);
    await loadAdn(refGuardado, adn.rev);
  }, [loadAdn]);

  /** Vuelve a leer del almacén (ya no hay copia en memoria que invalidar). */
  const invalidateCache = useCallback((r: string) => {
    setState((s) => ({ ...s, loading: true }));
    void loadAdn(r, rev);
  }, [rev, loadAdn]);

  return { ...state, loadAdn, saveAdn, invalidateCache };
}

/** Obtener todas las entradas de ADN guardadas en la Biblioteca (ordenadas por fecha de guardado). */
export function getSavedAdnEntries(): AdnEntry[] {
  const storage = readStorage();
  return Object.values(storage).sort((a, b) => b.savedAt - a.savedAt);
}

/** Eliminar un ADN de la Biblioteca y de su espejo en la cuenta (un avatar quitado no se queda guardado allí). */
export async function removeAdnFromLibrary(ref: string): Promise<void> {
  const storage = readStorage();
  if (!storage[ref]) return;
  delete storage[ref];
  if (writeStorage(storage)) espejarACuenta(storage);
}

/** Parsear el raw JSON a AdnAvatar (validado con sanearAdn). */
export async function parseAdnEntry(entry: AdnEntry): Promise<AdnAvatar | null> {
  try {
    const parsed = JSON.parse(entry.raw) as AdnAvatar;
    const validated = sanearAdn(parsed);
    return validated;
  } catch {
    return null;
  }
}

/** El ADN más reciente de un dueño (perfil, bot, grupo, comunidad o página), o `null` si aún no eligió uno. */
export function adnActualDeDueno(dueno: AdnAvatar["dueno"]): AdnEntry | null {
  for (const e of getSavedAdnEntries()) {
    const d = duenoDeEntrada(e);
    if (d?.tipo === dueno.tipo && d.id === dueno.id) return e;
  }
  return null;
}
