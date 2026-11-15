/**
 * AND1114L · el bloque «Interfaz web» de Ajustes › Versión y actualizaciones: qué web corre, cuál hay publicada y en qué
 * punto está el relevo. PURO (sin red, sin DOM). Todo sale de lo que dice la app nativa (`servidor_local_estado`); lo que no
 * se sabe se dice («sin dato»), nunca se inventa. Mismo texto en escritorio y Android.
 */

import { identidadWeb } from "./relevo-capa";
import type { EstadoServidorLocal } from "./estado-servidor-local";

export type EstadoInterfazWeb = "al-dia" | "bajando" | "lista" | "error" | "sin-capa" | "sin-dato" | "sin-sirve-local";

export interface VistaInterfazWeb {
  estado: EstadoInterfazWeb;
  /** Frase corta del estado (la insignia). */
  titulo: string;
  /** Frase larga: qué pasa y qué hará la app. */
  detalle: string;
  /** Motivo si no se pudo (solo con `estado: "error"`). */
  motivo: string | null;
  corre: string | null;
  publicada: string | null;
  nueva: string | null;
  /** Cuándo se miró por última vez (ms), o null. */
  mirada: number | null;
}

/** `compilación/sha` → «compilación · sha» legible (la compilación sola si no hay sha). */
export function etiquetaWeb(e: string | null | undefined): string | null {
  if (!e || e === "desconocida") return null;
  const [b, sha] = e.split("/");
  const build = b && b !== "?" ? b : null;
  return [build, sha ? sha.slice(0, 8) : null].filter(Boolean).join(" · ") || null;
}

export interface MomentoWeb {
  enLlamada: boolean;
  escribiendo: boolean;
}

export function vistaInterfazWeb(e: EstadoServidorLocal | null, momento: MomentoWeb = { enLlamada: false, escribiendo: false }): VistaInterfazWeb | null {
  if (!e || e.fase === "otro-sistema") return null;
  const base = {
    corre: etiquetaWeb(e.web_corre),
    publicada: etiquetaWeb(e.web_publicada),
    nueva: etiquetaWeb(e.web_nueva),
    mirada: e.ultima_mirada_ms ?? null,
    motivo: null as string | null,
  };
  const v = (estado: EstadoInterfazWeb, titulo: string, detalle: string, motivo: string | null = null): VistaInterfazWeb => ({ ...base, estado, titulo, detalle, motivo });
  if (e.fase !== "local") {
    return v("sin-sirve-local", "Sin copia propia", "Esta vez la app abre la web publicada: no hay una copia local que relevar.");
  }
  const fase = e.capas_fase ?? null;
  if (fase === "error") {
    const motivo = e.capas_aviso ?? "No se pudo traer la web nueva.";
    return v("error", "No se pudo", "La app sigue con la web que tiene y vuelve a intentarlo sola.", motivo);
  }
  if (fase === "buscando" || fase === "descargando" || fase === "verificando") {
    const que = fase === "buscando" ? "Buscando" : fase === "descargando" ? "Bajando" : "Verificando";
    return v("bajando", `${que} la web nueva`, "Se verifica (firma y SHA-256) antes de usarla; si falla, no se toca nada.");
  }
  if (e.capa_nueva) {
    const espera = momento.enLlamada ? "se aplica al terminar la llamada" : momento.escribiendo ? "se aplica cuando no haya texto sin enviar" : "se aplica en unos segundos";
    return v("lista", `Lista, ${espera}`, "La app se reabre un momento; la que corre ahora queda de respaldo por si la nueva no arranca.");
  }
  const mismaWeb = identidadWeb(e.web_corre) && identidadWeb(e.web_corre) === identidadWeb(e.web_publicada);
  if (e.relevo === "al-dia" || mismaWeb) return v("al-dia", "Al día", "La web que corre es la publicada.");
  if (e.relevo === "sin-capa") {
    return v("sin-capa", "Aún sin capa", "La web publicada es más nueva, pero su capa todavía no está en el canal: la app la busca cada pocos minutos.");
  }
  return v("sin-dato", "Sin dato", "Todavía no se pudo leer la web publicada (sin red o aún no se miró).");
}

/** «hace 3 min», «hace 2 h»… o null. Puro. */
export function hace(ms: number | null, ahora: number): string | null {
  if (!ms || ms > ahora + 60_000) return null;
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}
