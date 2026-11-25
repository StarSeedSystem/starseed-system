/**
 * ACT1114H · ¿toca pedir ya el relevo de capa en la app de escritorio? Decisión pura (sin red, sin DOM).
 *
 * Contexto: la app sirve su propia copia de la web desde 127.0.0.1, así que `/version.json` es la copia local y la
 * comprobación de ACT1113F se comparaba consigo misma. Quien mira la web PUBLICADA es la parte nativa
 * (`servidor_capas.rs`: lee el /version.json publicado, baja y verifica la capa nueva y deja dicho en
 * `servidor_local_estado` qué build corre, cuál hay publicada y cuál trae la capa lista). Aquí se decide si es
 * momento de cambiar a ella con LA MISMA regla de ACT1113F (`decidirCambioBuild`): nunca durante una llamada o
 * mientras suena, nunca escribiendo, nunca sin red. Una segunda regla no existe.
 */

import { decidirCambioBuild, type DecisionBuild } from "@/lib/pwa/decision-build";
import type { EstadoServidorLocal } from "./estado-servidor-local";

export type AccionRelevo = "nada" | "aplicar" | "esperar";

export interface ResultadoRelevo {
  accion: AccionRelevo;
  /** Por qué, en una frase (para pruebas y diagnóstico). */
  motivo: string;
  /** Build de la capa lista (la clave de «una vez por build»); null si no hay. */
  clave: string | null;
  decision: DecisionBuild | null;
}

export interface ContextoRelevo {
  enLlamada: boolean;
  escribiendo: boolean;
  enLinea: boolean;
  /** Capas que ya se pidieron en esta página: no se repite (sin bucles si una no se puede aplicar). */
  yaPedidas: ReadonlySet<string>;
}

/**
 * «<compilación>/<sha>» → lo que se compara. Con sha en las dos manda el sha: la capa la compila el CI y la web
 * publicada la compila Vercel (cada una con su id de build aleatorio) del MISMO commit; comparar ids diría
 * «distinta» siempre. Sin sha, el id.
 */
export function identidadWeb(etiqueta: string | null | undefined): string | null {
  if (!etiqueta) return null;
  const [build, sha] = etiqueta.split("/");
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return `sha:${sha.toLowerCase()}`;
  return build && build !== "?" ? `build:${build}` : null;
}

export function decidirRelevoNativo(e: EstadoServidorLocal | null, ctx: ContextoRelevo): ResultadoRelevo {
  const nada = (motivo: string, clave: string | null = null): ResultadoRelevo => ({ accion: "nada", motivo, clave, decision: null });
  if (!e) return nada("sin estado de la app");
  if (e.fase !== "local") return nada(`el servidor local no sirve (${e.fase})`);
  const clave = e.capa_nueva ?? null;
  if (!clave) return nada("no hay capa nueva lista");
  if (ctx.yaPedidas.has(clave)) return nada("ya se pidió el relevo a esta capa", clave);
  // Una capa a medias no existe: `capa_nueva` solo se rellena con la capa completa y verificada (firma + SHA-256).
  const corriendo = identidadWeb(e.web_corre);
  const publicada = identidadWeb(e.web_nueva);
  if (!corriendo || !publicada) return nada("falta la build que corre o la de la capa: no se adivina", clave);
  const d = decidirCambioBuild({
    corriendo,
    publicada,
    enLlamada: ctx.enLlamada,
    escribiendo: ctx.escribiendo,
    enLinea: ctx.enLinea,
    recargasEstaSesion: 0, // el tope «una vez por build» es `yaPedidas`
    topeRecargas: 1,
  });
  if (d === "al-dia") return { accion: "nada", motivo: "la capa lista trae la misma web que corre", clave, decision: d };
  if (d === "aplicar") return { accion: "aplicar", motivo: "capa lista y momento seguro", clave, decision: d };
  if (d === "tope") return { accion: "nada", motivo: "tope", clave, decision: d };
  return { accion: "esperar", motivo: d, clave, decision: d };
}

/** Cada cuánto se pregunta a la app mientras la página está abierta (barato: un comando local). */
export const MIRAR_RELEVO_CADA_MS = 30 * 1000;

// ── (DIR1125C) La página corre una build y el servidor local sirve otra ───────────────────────────────────────────
// Medido el 25-11 en la Maggabox: tras un relevo de capa la app recargó la página, el Node recién arrancado tardó más de
// 10 s en dar la primera y el service worker entregó la copia guardada de la capa ANTERIOR. El servidor decía «sirvo la
// nueva», la página corría la vieja y nadie comparaba las dos: la app se quedaba una versión atrás hasta cerrarla.

export type AccionAlDia = "nada" | "recargar" | "esperar" | "rendirse";

export interface ResultadoAlDia {
  accion: AccionAlDia;
  motivo: string;
  /** «<la de la página>><la que sirve>»: la clave del tope de intentos; null si no hay diferencia. */
  clave: string | null;
}

export interface ContextoAlDia {
  enLlamada: boolean;
  escribiendo: boolean;
  /** Recargas ya hechas en esta ventana por ESTA misma diferencia. */
  intentos: number;
}

/** Recargas como mucho por una misma diferencia: si tras dos sigue igual, no es cosa de recargar (nunca un bucle). */
export const MAX_INTENTOS_AL_DIA = 2;

function partesWeb(etiqueta: string | null | undefined): { build: string | null; sha: string | null } {
  const [b, s] = String(etiqueta ?? "").trim().split("/");
  return {
    build: b && b !== "?" && b !== "desconocida" ? b : null,
    sha: s && /^[0-9a-f]{7,40}$/i.test(s) ? s.toLowerCase() : null,
  };
}

/**
 * ¿La página corre otra web que la que sirve el servidor local de la app? Pura. `propia` es la etiqueta del código que
 * corre («<compilación>/<sha>», `etiquetaBuild()`); `e.web_corre`, la de la capa que sirve el Node. Es la misma web si
 * coincide el id de compilación o el sha (uno puede venir más corto que el otro). Sin datos comparables no se adivina.
 */
export function decidirPonerseAlDia(propia: string | null | undefined, e: EstadoServidorLocal | null, ctx: ContextoAlDia): ResultadoAlDia {
  const nada = (motivo: string): ResultadoAlDia => ({ accion: "nada", motivo, clave: null });
  if (!e) return nada("sin estado de la app");
  if (e.fase !== "local") return nada(`el servidor local no sirve (${e.fase})`);
  const mia = partesWeb(propia);
  const sirve = partesWeb(e.web_corre);
  const mismoSha = !!(mia.sha && sirve.sha && (mia.sha.startsWith(sirve.sha) || sirve.sha.startsWith(mia.sha)));
  const mismaBuild = !!(mia.build && sirve.build && mia.build === sirve.build);
  if (!((mia.sha && sirve.sha) || (mia.build && sirve.build))) return nada("falta la build de la página o la del servidor: no se adivina");
  if (mismoSha || mismaBuild) return nada("la página corre lo que sirve el servidor");
  const clave = `${String(propia).trim()}>${String(e.web_corre).trim()}`;
  if (ctx.intentos >= MAX_INTENTOS_AL_DIA) return { accion: "rendirse", motivo: "ya se recargó dos veces y sigue igual", clave };
  if (ctx.enLlamada) return { accion: "esperar", motivo: "en llamada", clave };
  if (ctx.escribiendo) return { accion: "esperar", motivo: "escribiendo", clave };
  return { accion: "recargar", motivo: "la página corre una capa y el servidor sirve otra", clave };
}
