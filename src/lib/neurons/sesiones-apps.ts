/**
 * sesiones-apps — Sesiones de otras apps (Audiomorphic, Omnifrecuencias, apps externas) por aparato (2026-11-27).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Reconoce qué aparato(s) activos están usando cada app externa o del ecosistema, muestra su identidad
 * única (@idUnico, color, estado de sincronización y neurona asociada) y expone las opciones de las
 * neuronas disponibles para dirigir o sincronizar esa sesión.
 *
 * Puro en sus cálculos (sin red ni DOM), con lectura defensiva SSR-safe del entorno local.
 */

import {
  aparatosDe,
  colorAparatoDe,
  estadoSyncAparato,
  idUnicoPorDefecto,
  type EstadoSyncAparato,
} from "@/lib/neurons/aparatos-de-neurona";
import type { Neuron } from "@/lib/neurons/neurons";
import type { PresenciaMedio } from "@/lib/neurons/presencia";

export const CLAVE_SESIONES_APPS = "starseed.neurons.sesiones-apps.v1";
export const EVENTO_SESIONES_APPS = "starseed:sesiones-apps";

export interface SesionAppLocal {
  appId: string;
  nombre: string;
  origen?: string;
  desde: number;
  activa: boolean;
}

export interface AparatoEnApp {
  clave: string;
  appId: string;
  appNombre: string;
  origen?: string;
  neuronaId: string;
  neuronaNombre: string;
  aparatoId: string;
  aparatoIdUnico: string;
  aparatoNombre: string;
  aparatoColor: string;
  syncEstado: EstadoSyncAparato;
  plataforma?: string;
  medio?: string;
  desde: number;
  esEsteAparato: boolean;
}

export interface GrupoAppExterna {
  appId: string;
  nombre: string;
  origen?: string;
  aparatosActivos: AparatoEnApp[];
}

export function normalizarAppId(nombreOId: string): string {
  return nombreOId
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
}

/** Detecta sesiones activas en ESTE aparato leyendo las capas/apps locales sin inventar datos. */
export function detectarAppsLocalesActivas(ahora: number = Date.now()): SesionAppLocal[] {
  if (typeof window === "undefined") return [];
  const mapa = new Map<string, SesionAppLocal>();

  const poner = (s: SesionAppLocal) => {
    const k = normalizarAppId(s.appId || s.nombre);
    const prev = mapa.get(k);
    if (!prev || s.desde < prev.desde) mapa.set(k, { ...s, appId: k });
  };

  try {
    const raw = window.localStorage.getItem(CLAVE_SESIONES_APPS);
    if (raw) {
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const o = item as Partial<SesionAppLocal>;
          if (!o.activa || typeof o.nombre !== "string" || !o.nombre.trim()) continue;
          poner({
            appId: normalizarAppId(o.appId || o.nombre),
            nombre: o.nombre.trim().slice(0, 60),
            origen: typeof o.origen === "string" ? o.origen : undefined,
            desde: typeof o.desde === "number" && Number.isFinite(o.desde) ? o.desde : ahora,
            activa: true,
          });
        }
      }
    }
  } catch { /* almacenamiento no disponible */ }

  // Detectar Audiomorphic si está activo como capa de fondo en apariencia o tema activo
  try {
    const appCfgRaw = window.localStorage.getItem("starseed.appearance.v1") || window.localStorage.getItem("starseed-appearance");
    if (appCfgRaw) {
      const cfg = JSON.parse(appCfgRaw) as {
        osTheme?: string;
        background?: { layers?: Array<{ kind?: string; enabled?: boolean }> };
      };
      const audioLayer = cfg?.background?.layers?.find((l) => l.kind === "audiomorphic" && l.enabled !== false);
      if (audioLayer || cfg?.osTheme === "audiomorphic") {
        poner({
          appId: "audiomorphic",
          nombre: "Audiomorphic",
          origen: "Visualizador / capa audiovisual",
          desde: ahora,
          activa: true,
        });
      }
      if (cfg?.osTheme === "omnifrecuencias") {
        poner({
          appId: "omnifrecuencias",
          nombre: "Omnifrecuencias",
          origen: "Estación / tema sintonizado",
          desde: ahora,
          activa: true,
        });
      }
    }
  } catch { /* silencioso */ }

  // Detectar sesión viva de Omnifrecuencias / Estaciones si está guardada en localStorage
  try {
    const omniRaw = window.localStorage.getItem("starseed.estacion-vivo.activa.v1");
    if (omniRaw) {
      const omni = JSON.parse(omniRaw) as { app?: string; activa?: boolean; desde?: number } | null;
      if (omni?.activa) {
        const nom = (omni.app || "Omnifrecuencias").trim();
        poner({
          appId: normalizarAppId(nom),
          nombre: nom,
          origen: "Estación en vivo",
          desde: typeof omni.desde === "number" ? omni.desde : ahora,
          activa: true,
        });
      }
    }
  } catch { /* silencioso */ }

  return Array.from(mapa.values());
}

export function registrarSesionAppLocal(entrada: { appId?: string; nombre: string; origen?: string; activa?: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    const actual = detectarAppsLocalesActivas();
    const id = normalizarAppId(entrada.appId || entrada.nombre);
    const resto = actual.filter((x) => x.appId !== id);
    const activa = entrada.activa !== false;
    const next: SesionAppLocal[] = activa
      ? [
          ...resto,
          {
            appId: id,
            nombre: entrada.nombre.trim().slice(0, 60) || id,
            origen: entrada.origen,
            desde: Date.now(),
            activa: true,
          },
        ]
      : resto;
    window.localStorage.setItem(CLAVE_SESIONES_APPS, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENTO_SESIONES_APPS));
  } catch { /* silencioso */ }
}

export interface EntradaAgruparSesiones {
  presenciaMedios: readonly PresenciaMedio[];
  neuronas: readonly Neuron[];
  sesionesLocales: readonly SesionAppLocal[];
  neuronaActualId?: string | null;
  aparatoActual?: {
    id: string;
    idUnico: string;
    nombre: string;
    color: string;
    plataforma?: string;
    medio?: string;
  } | null;
}

/** Agrupa sesiones de otras apps (como Audiomorphic) identificando qué aparatos activos las están usando. Pura. */
export function agruparSesionesPorApp(e: EntradaAgruparSesiones): GrupoAppExterna[] {
  const grupos = new Map<string, GrupoAppExterna>();
  const neuronaPorId = new Map(e.neuronas.map((n) => [n.id, n]));

  const agregar = (ap: AparatoEnApp) => {
    const key = normalizarAppId(ap.appId || ap.appNombre);
    let g = grupos.get(key);
    if (!g) {
      g = { appId: key, nombre: ap.appNombre, origen: ap.origen, aparatosActivos: [] };
      grupos.set(key, g);
    }
    if (!g.aparatosActivos.some((x) => x.clave === ap.clave)) {
      g.aparatosActivos.push(ap);
    }
  };

  // 1. Sesiones anunciadas en tiempo real por cada medio conectado en presencia
  for (const m of e.presenciaMedios) {
    const apps = m.apps ?? [];
    if (!apps.length) continue;
    const neu = neuronaPorId.get(m.n);
    const apsNeu = neu ? aparatosDe(neu.capabilities) : [];
    const apMatch = apsNeu.find((a) => (m.ap?.id && a.id === m.ap.id) || (m.sid && a.id === m.sid)) ?? apsNeu[0];
    const aparatoId = m.ap?.id || m.sid || apMatch?.id || m.m;
    const aparatoNombre = m.ap?.nombre || apMatch?.nombre || neu?.name || m.etiqueta;
    const aparatoIdUnico = m.ap?.alias || apMatch?.idUnico || idUnicoPorDefecto({ id: aparatoId, nombre: aparatoNombre, so: m.plataforma });
    const aparatoColor = m.ap?.col || (apMatch ? colorAparatoDe(apMatch) : m.col || "#38bdf8");
    const syncEstado: EstadoSyncAparato = m.ap?.sync || (apMatch ? estadoSyncAparato(apMatch, { presente: true }).estado : "activa");

    for (const app of apps) {
      agregar({
        clave: `${normalizarAppId(app.id || app.nombre)}:${m.n}:${aparatoId}`,
        appId: normalizarAppId(app.id || app.nombre),
        appNombre: app.nombre,
        origen: app.origen,
        neuronaId: m.n,
        neuronaNombre: neu?.name || aparatoNombre,
        aparatoId,
        aparatoIdUnico,
        aparatoNombre,
        aparatoColor,
        syncEstado,
        plataforma: m.plataforma || neu?.capabilities?.platform,
        medio: m.etiqueta,
        desde: app.desde || m.t,
        esEsteAparato: Boolean(e.neuronaActualId && m.n === e.neuronaActualId && (!e.aparatoActual?.id || e.aparatoActual.id === aparatoId)),
      });
    }
  }

  // 2. Sesiones activas en ESTE aparato (aunque presencia Realtime no esté suscrita aún)
  if (e.sesionesLocales.length > 0) {
    const neuId = e.neuronaActualId || e.neuronas.find((n) => n.isThisDevice)?.id || "local";
    const neu = neuronaPorId.get(neuId);
    const apId = e.aparatoActual?.id || "este-aparato";
    const apNombre = e.aparatoActual?.nombre || neu?.name || "Este aparato";
    const apUnico = e.aparatoActual?.idUnico || idUnicoPorDefecto({ id: apId, nombre: apNombre });
    const apColor = e.aparatoActual?.color || "#38bdf8";

    for (const s of e.sesionesLocales) {
      if (!s.activa) continue;
      agregar({
        clave: `${normalizarAppId(s.appId || s.nombre)}:${neuId}:${apId}`,
        appId: normalizarAppId(s.appId || s.nombre),
        appNombre: s.nombre,
        origen: s.origen,
        neuronaId: neuId,
        neuronaNombre: neu?.name || apNombre,
        aparatoId: apId,
        aparatoIdUnico: apUnico,
        aparatoNombre: apNombre,
        aparatoColor: apColor,
        syncEstado: "activa",
        plataforma: e.aparatoActual?.plataforma || neu?.capabilities?.platform,
        medio: e.aparatoActual?.medio || "Este medio",
        desde: s.desde,
        esEsteAparato: true,
      });
    }
  }

  return Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
