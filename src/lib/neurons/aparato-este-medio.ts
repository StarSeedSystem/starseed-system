"use client";

/*
 * aparato-este-medio — el bloque `capabilities.aparato` de ESTE medio y la pista de la app nativa de
 * Android (NEU1108A · 2026-11-08). Contrato: architecture/neurona-bienvenida.md §2.1 y §6.
 *
 * · `aparatoDeEsteMedio(caps)`: en la app nativa lee `info_neurona` (una vez por pestaña) y calcula la
 *   huella; en un navegador, solo el medio y el sistema. Sin pedir `/version.json` (eso lo hace la
 *   ventana de versiones; aquí no hace falta).
 * · `traerPistaNativa()`: la app de Android con servidor local guarda, al primer arranque, el id de
 *   neurona que usaba en el origen de la web publicada (Rust: `pista_neurona`). Aquí se lee
 *   (`pista_neurona_leer`) y se deja donde la escritorio deja la suya (`CLAVE_NEURONA_ANTERIOR`), para
 *   que la adopción al arrancar y la ventana «Esta neurona» la usen igual en las dos plataformas.
 * Nunca lanza.
 */

import { aparatoDesde, huellaAparato, type AparatoRegistro, type MedioAparato } from "@/lib/neurons/aparato-registro";
import { CLAVE_NEURONA_ANTERIOR, leerNeuronaAnterior } from "@/lib/nativa/migracion-origen";
// Módulos ligeros y puros salvo la lectura del global de Tauri: estáticos (el latido no espera a cargarlos).
import { leerInfoNativa, tauriGlobal } from "@/lib/nativa/info-neurona";
import { medioActual, plataformaNativa } from "@/lib/actualizaciones/version-por-medio";

interface CapsMinimas {
  platform?: string;
  cores?: number;
  gpuRenderer?: string;
  pantalla?: string;
}

let cache: { clave: string; valor: AparatoRegistro } | null = null;

/** El bloque del aparato que escribe este medio con su ficha. Nunca lanza. */
export async function aparatoDeEsteMedio(caps: CapsMinimas, ahora: number = Date.now()): Promise<AparatoRegistro | null> {
  try {
    const tauri = tauriGlobal();
    const ua = typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? navigator.userAgent : "";
    let medio: MedioAparato;
    let info = null as Awaited<ReturnType<typeof leerInfoNativa>>;
    if (tauri) {
      info = await leerInfoNativa(tauri).catch(() => null);
      medio = medioActual({ tauriPresente: true, plataforma: plataformaNativa(info, ua) }) as MedioAparato;
    } else {
      let standalone = false;
      try {
        standalone = window.matchMedia?.("(display-mode: standalone)").matches === true;
      } catch {
        standalone = false;
      }
      medio = medioActual({ tauriPresente: false, modoStandalone: standalone }) as MedioAparato;
    }
    const equipo = info?.modelo || info?.equipo || null;
    const so = info?.plataforma || caps.platform || null;
    const clave = JSON.stringify([medio, info, caps.platform, caps.cores, caps.gpuRenderer, caps.pantalla]);
    if (cache?.clave === clave) return { ...cache.valor, ultimoMedio: medio, visto: new Date(ahora).toISOString() };
    const huella = info ? await huellaAparato({ so, equipo, cores: caps.cores, gpuRenderer: caps.gpuRenderer, pantalla: caps.pantalla }) : null;
    const valor = aparatoDesde({ medio, info, plataforma: caps.platform, huella, ahora });
    cache = { clave, valor };
    return valor;
  } catch {
    return null;
  }
}

/** Solo pruebas. */
export function _olvidarAparatoParaPruebas(): void {
  cache = null;
}

/**
 * Trae la pista de la app nativa (Android) al localStorage de este origen, si aquí no hay ya una.
 * Devuelve la pista vigente (la de aquí o la traída) o null. Nunca lanza.
 */
export async function traerPistaNativa(): Promise<string | null> {
  try {
    const actual = leerNeuronaAnterior(window.localStorage.getItem(CLAVE_NEURONA_ANTERIOR));
    if (actual) return actual;
    const invoke = tauriGlobal()?.core?.invoke;
    if (typeof invoke !== "function") return null;
    const id = leerNeuronaAnterior((await invoke("pista_neurona_leer").catch(() => null)) as string | null);
    if (!id) return null;
    window.localStorage.setItem(CLAVE_NEURONA_ANTERIOR, id);
    return id;
  } catch {
    return null;
  }
}
