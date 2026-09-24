"use client";

/**
 * ActualizacionNativa — aviso de actualización del SHELL NATIVO (Tauri),
 * distinto del UpdateBanner retirado (aurora-provider.tsx), que era para el
 * contenido WEB (ese sigue actualizándose solo vía register-sw.tsx). Este
 * componente SOLO hace algo cuando existe `window.__TAURI__` — en el
 * navegador normal (sin la app nativa instalada) es un no-op total.
 *
 * Dos mitades independientes (una app nativa nunca es las dos a la vez):
 *   · Escritorio (macOS/Windows/Linux): escucha el evento
 *     `starseed://actualizacion` que emite el Rust de
 *     native/src-tauri/src/lib.rs (comprobación cada 6h en 2º plano + primer
 *     chequeo a los ~25s de arrancar) y pinta un toast de cristal con el
 *     progreso; cuando la fase es "lista", ofrece «Reiniciar ahora»
 *     (invoca el comando `reiniciar_para_actualizar`).
 *   · Android (Tauri móvil): NO hay updater de Tauri en móvil, así que aquí
 *     comparamos la versión instalada (`window.__TAURI__.app.getVersion()`)
 *     contra el último Release público de GitHub (con caché de 6h en
 *     localStorage) y, si hay una más nueva, enlazamos directo al .apk.
 *
 * Toda la lógica de interpretación/comparación es PURA y vive en
 * src/lib/pwa/actualizacion-nativa-logica.ts (con sus tests); este archivo
 * solo hace de "pegamento" con window/localStorage/fetch, siempre en
 * try/catch — nunca debe poder romper el resto de la app.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUpCircle, Download, X } from "lucide-react";
import {
  normalizarEstadoActualizacion,
  textoEstadoActualizacion,
  porcentajeDescarga,
  debeMostrarToast,
  esAndroidTauri,
  cacheReleaseValida,
  elegirApkAndroid,
  hayNuevaVersionAndroid,
  type EstadoActualizacionNativa,
  type GithubReleaseMin,
  type CacheReleaseAndroid,
} from "@/lib/pwa/actualizacion-nativa-logica";

const EVENTO_ACTUALIZACION = "starseed://actualizacion";
const CACHE_KEY_ANDROID = "starseed.native.android-release.v1";
const RELEASES_API = "https://api.github.com/repos/StarSeedSystem/starseed-system/releases/latest";

/** Forma mínima de `window.__TAURI__` que este componente necesita (con
 * `withGlobalTauri: true` en tauri.conf.json, expuesta sin depender del
 * paquete npm `@tauri-apps/api`, que esta web no instala). */
interface TauriGlobal {
  event?: {
    listen?: (event: string, cb: (payload: { payload: unknown }) => void) => Promise<() => void>;
  };
  core?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  app?: {
    getVersion?: () => Promise<string>;
  };
}

function leerTauriGlobal(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __TAURI__?: TauriGlobal };
  return w.__TAURI__ ?? null;
}

export function ActualizacionNativa() {
  const [estado, setEstado] = useState<EstadoActualizacionNativa | null>(null);
  const [descartado, setDescartado] = useState(false);
  const [androidAviso, setAndroidAviso] = useState<{ version: string; href: string } | null>(null);
  const desuscribirRef = useRef<(() => void) | null>(null);

  /* ── Escritorio: progreso del updater nativo ── */
  useEffect(() => {
    const tauri = leerTauriGlobal();
    const listen = tauri?.event?.listen;
    if (!listen) return;

    let cancelado = false;
    listen(EVENTO_ACTUALIZACION, (e) => {
      const normalizado = normalizarEstadoActualizacion(e?.payload);
      if (!normalizado || cancelado) return;
      setDescartado(false);
      setEstado(normalizado);
    })
      .then((desuscribir) => {
        if (cancelado) {
          try {
            desuscribir();
          } catch {
            /* noop */
          }
          return;
        }
        desuscribirRef.current = desuscribir;
      })
      .catch(() => {
        /* sin listener: la app sigue funcionando sin el toast, nunca rompe nada */
      });

    return () => {
      cancelado = true;
      try {
        desuscribirRef.current?.();
      } catch {
        /* noop */
      }
      desuscribirRef.current = null;
    };
  }, []);

  /* ── Android: ¿hay un .apk más nuevo en GitHub Releases? ── */
  useEffect(() => {
    const tauri = leerTauriGlobal();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (!esAndroidTauri(ua, tauri !== null)) return;

    const getVersion = tauri?.app?.getVersion;
    if (!getVersion) return;

    let cancelado = false;

    const leerCache = (): CacheReleaseAndroid | null => {
      try {
        const raw = window.localStorage.getItem(CACHE_KEY_ANDROID);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheReleaseAndroid;
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    };

    const escribirCache = (release: GithubReleaseMin | null): void => {
      try {
        const entrada: CacheReleaseAndroid = { guardadoEn: Date.now(), release };
        window.localStorage.setItem(CACHE_KEY_ANDROID, JSON.stringify(entrada));
      } catch {
        /* cuota / modo privado: degradamos en silencio */
      }
    };

    const comprobar = async () => {
      try {
        const instalada = await getVersion().catch(() => null);
        if (!instalada || cancelado) return;

        let release: GithubReleaseMin | null = null;
        const cache = leerCache();
        if (cacheReleaseValida(cache, Date.now())) {
          release = cache ? cache.release : null;
        } else {
          try {
            const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
            if (res.ok) {
              release = (await res.json()) as GithubReleaseMin;
              escribirCache(release);
            }
          } catch {
            /* sin red: seguimos sin aviso, honesto (no inventamos versión nueva) */
          }
        }
        if (cancelado) return;

        if (hayNuevaVersionAndroid(instalada, release)) {
          const apk = elegirApkAndroid(release);
          if (apk) setAndroidAviso({ version: apk.version, href: apk.href });
        }
      } catch {
        /* nunca rompe la app */
      }
    };

    void comprobar();
    return () => {
      cancelado = true;
    };
  }, []);

  const reiniciarAhora = (): void => {
    const tauri = leerTauriGlobal();
    const invoke = tauri?.core?.invoke;
    if (!invoke) return;
    try {
      void invoke("reiniciar_para_actualizar");
    } catch {
      /* noop */
    }
  };

  // ── Escritorio: toast de progreso (prioridad sobre el aviso de Android,
  // que nunca coexisten porque son ramas de plataforma distintas). ──
  if (estado && debeMostrarToast(estado) && !descartado) {
    const texto = textoEstadoActualizacion(estado);
    if (!texto) return null;
    const porcentaje = porcentajeDescarga(estado);
    const lista = estado.fase === "lista";
    return (
      <div
        role="status"
        data-testid="actualizacion-nativa-toast"
        className="fixed inset-x-0 bottom-4 z-[120] mx-auto flex w-[min(92vw,420px)] flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b0f16]/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <ArrowUpCircle className="h-5 w-5 shrink-0 text-[#7fb8ff]" />
          <p className="min-w-0 flex-1 text-[13px] font-medium text-white/90">{texto}</p>
          <button
            type="button"
            onClick={() => setDescartado(true)}
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-white/45 transition-colors duration-200 hover:bg-white/10 hover:text-white/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {porcentaje !== null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#7fb8ff] transition-[width] duration-300"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        )}
        {lista && (
          <button
            type="button"
            onClick={reiniciarAhora}
            className="self-start cursor-pointer rounded-full bg-[#7fb8ff] px-3 py-1.5 text-[12px] font-semibold text-[#0b0f16] transition-opacity duration-200 hover:opacity-90"
          >
            Reiniciar ahora
          </button>
        )}
      </div>
    );
  }

  // ── Android: aviso de .apk nuevo disponible ──
  if (androidAviso) {
    return (
      <a
        href={androidAviso.href}
        role="status"
        data-testid="actualizacion-nativa-android"
        className="fixed inset-x-0 bottom-4 z-[120] mx-auto flex w-[min(92vw,420px)] cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0f16]/95 px-4 py-3 shadow-2xl backdrop-blur-xl transition-opacity duration-200 hover:opacity-95"
      >
        <Download className="h-5 w-5 shrink-0 text-[#7fb8ff]" />
        <p className="min-w-0 flex-1 text-[13px] font-medium text-white/90">
          Nueva versión {androidAviso.version}: descargar e instalar
        </p>
      </a>
    );
  }

  return null;
}

export default ActualizacionNativa;
