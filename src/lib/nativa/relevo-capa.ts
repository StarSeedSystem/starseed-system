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
