/**
 * Pasarela ArtCraft · ACCIÓN DE AGENTE (contrato: `architecture/artcraft-y-rare.md` §4.1).
 * `[[ACCION: artcraft {json}]]` usa la MISMA puerta que la persona (la pasarela de la
 * neurona), pero nunca toca las herramientas de ventana ni archivos fuera del directorio
 * de trabajo. Sin React, sin red, sin `node:*`: la pasarela se inyecta por `ctx`. El
 * mensaje al agente no pasa de 4 KB, no lleva rutas absolutas (solo nombres de archivo),
 * recorta los resultados largos con «…» y nunca devuelve bytes de archivos.
 */
import { APPS_ARTCRAFT, HERRAMIENTAS, type AppArtcraft } from "./politica-tablas";

/** Misma forma que `AuroraActionResult` de `src/lib/aurora/actions.ts`. */
export interface ResultadoAccionArtcraft { ok: boolean; message: string; status?: string }
/** Lo que la pasarela (`/api/artcraft/<app>`) devuelve a una llamada. */
export interface RespuestaPasarela { ok: boolean; resultado?: unknown; status?: number; confirmar?: boolean; motivo?: string }
/** Todo lo que hace falta de fuera: la pasarela (fetch) y el contexto de trabajo de la sesión. */
export interface ContextoAccionArtcraft {
  llamar: (p: { app: AppArtcraft; herramienta: string; parametros: Record<string, unknown>; contexto: string }) => Promise<RespuestaPasarela>;
  contexto: string;
  estado: (app: AppArtcraft) => Promise<{ instalado: boolean; version: string | null }>;
}

export const ACCIONES_AGENCIA = ["estado", "inspeccionar", "ejecutar", "exportar"] as const;
export type AccionArtcraft = (typeof ACCIONES_AGENCIA)[number];
export const TOPE_MENSAJE = 4096;
export const PENDIENTE = "queda pendiente de que la persona la confirme en el panel";
export const OCUPADA = "la neurona está ocupada, vuelve a intentarlo";
const TITULOS: Record<AppArtcraft, string> = { figcraft: "FigCraft", gridcraft: "GridCraft", deckcraft: "DeckCraft" };

/** El texto del JSON del agente: solo cadenas recortadas, todo lo demás undefined para `no(...)`. */
/** El texto del JSON del agente: solo cadenas recortadas, todo lo demás queda como cadena vacía de rechazo. */
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const esApp = (x: string): x is AppArtcraft => (APPS_ARTCRAFT as readonly string[]).includes(x);
const esAccion = (x: string): x is AccionArtcraft => (ACCIONES_AGENCIA as readonly string[]).includes(x);
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const no = (message: string): ResultadoAccionArtcraft => ({ ok: false, message, status: "Pasarela ArtCraft" });
const si = (message: string, status: string): ResultadoAccionArtcraft => ({ ok: true, message, status });
/** Una ruta absoluta se cuenta con su nombre de archivo: el nombre viene de la última barra. */
const quitaRutas = (m: string): string =>
  m.replace(/(?:\/[\S]*|~\/[\S]*|[A-Za-z]:[\\/][\S]*|file:[\S]*)/g, (r) => r.split(/[\\/]/).pop() ?? r);
/** Resumen de un resultado de la pasarela: texto o JSON, sin bytes (los bloques rotos en base64 se colapsan por su «=»). */
const SIN_BYTES = /[A-Za-z0-9+/=]{256,}/g;
const colapsa = (s: string): string =>
  s.replace(SIN_BYTES, (c) => (c.includes("=") || c.length > 512 ? "(bytes del archivo omitidos)" : c));
/** Resumen de un resultado de la pasarela: texto o JSON, sin bytes, a lo sumo ~512 caracteres. */
const resumen = (r: unknown): string => {
  if (r === undefined || r === null) return "El resultado no trajo datos.";
  if (typeof r === "string") return colapsa(r.slice(0, 600).trim()) || "(sin datos)";
  const s = JSON.stringify(r);
  if (!s) return "El resultado no trajo datos.";
  const limpio = colapsa(s);
  return limpio.length > 512 ? `${limpio.slice(0, 512)}…` : limpio;
};
/** El mensaje al agente no pasa de 4 KB. */
const corta = (m: string): string => {
  let s = m;
  while (bytes(`${s}…`) > TOPE_MENSAJE && s.length > 40) s = s.slice(0, s.length - 128);
  return bytes(`${s}…`) > TOPE_MENSAJE ? `${s.slice(0, 40)}…` : `${s}…`;
};

/** «estado»: ¿queda la CLI de esta app instalada en la neurona y con qué versión? */
async function estadoDe(app: AppArtcraft, ctx: ContextoAccionArtcraft): Promise<ResultadoAccionArtcraft> {
  const e = await ctx.estado(app);
  return e.instalado
    ? si(`${TITULOS[app]} está instalada en esta neurona (versión ${e.version || "desconocida"}).`, "Consultando la CLI…")
    : si(`${TITULOS[app]} NO está instalada en esta neurona: la instala la persona, no el agente.`, "Consultando la CLI…");
}

/** «inspeccionar»: SOLO herramientas de lectura de la lista libre; lo que escriba va por «ejecutar». */
const esLectura = (app: AppArtcraft, herramienta: string): boolean => HERRAMIENTAS[app].libre.includes(herramienta);
const lecturasDe = (app: AppArtcraft): string => [...HERRAMIENTAS[app].libre].join(", ");
/** Las de ventana y las vetadas de §3.2 nunca entran por una acción de agente. */
const esVetada = (app: AppArtcraft, herramienta: string): boolean => HERRAMIENTAS[app].vetadas.includes(herramienta);

/** Parámetros del JSON del agente: objeto vacío si no vienen, error legible si vienen mal. */
const parametrosDe = (v: unknown): { p: Record<string, unknown> } | string => {
  if (v === undefined || v === null) return { p: {} };
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return { p: v as Record<string, unknown> };
  return "«parametros» tiene que ser un objeto (por ejemplo {\"capa\":\"Inferior\"}).";
};

/**
 * Acción de agente de ArtCraft: `bruto` es el JSON que el modelo escribió en
 * `[[ACCION: artcraft {json}]]` (ya desempaquetado); `ctx` trae la pasarela y el
 * contexto de trabajo de la sesión. Toda decisión legible sale en `message`.
 */
export async function ejecutarAccionArtcraft(bruto: unknown, ctx: ContextoAccionArtcraft): Promise<ResultadoAccionArtcraft> {
  if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto))
    return no("Se esperaba un objeto con {app, accion}: por ejemplo {\"app\":\"figcraft\",\"accion\":\"estado\"}.");
  const a = bruto as Record<string, unknown>, app = texto(a.app), accion = texto(a.accion);
  if (!esApp(app)) return no(`App desconocida «${app || "sin app"}»: usa ${APPS_ARTCRAFT.join(", ")}.`);
  if (!esAccion(accion)) return no(`No conozco la acción «${accion || "sin accion"}»: usa ${ACCIONES_AGENCIA.join(", ")}.`);
  if (!(typeof ctx.contexto === "string" && ctx.contexto))
    return no("Falta el contexto de trabajo de esta sesión: es la carpeta donde se cuela cada llamada.");
  if (accion === "estado") return estadoDe(app, ctx);
  const herramienta = texto(a.herramienta), params = parametrosDe(a.parametros);
  if (typeof params === "string") return no(params);
  if (accion === "inspeccionar" && !herramienta)
    return no(`Falta «herramienta». De lectura puedes usar: ${lecturasDe(app)}.`);
  if (accion === "inspeccionar" && !esLectura(app, herramienta))
    return no(`«${herramienta}» no es de lectura en ${TITULOS[app]}: para tocar la obra usa «ejecutar» o «exportar», y esa llamada queda apuntada en la pasarela.`);
  const nombre = accion === "exportar" ? "export" : herramienta;
  if (!nombre) return no("Falta «herramienta» (o usa la acción «exportar», que apunta sola a «export»).");
  if (esVetada(app, nombre)) return no(`«${nombre}» está vetada desde un agente (herramienta de la ventana de la app).`);
  const r = await ctx.llamar({ app, herramienta: nombre, parametros: params.p, contexto: ctx.contexto });
  if (r.confirmar === true) return si(`La llamada a «${nombre}» ${PENDIENTE}.`, "Esperando la confirmación de la persona…");
  if (r.status === 429) return no(OCUPADA);
  if (!r.ok) return no(r.motivo || (r.status === 403 ? "La política de la pasarela denegó la llamada." : `La pasarela de ${TITULOS[app]} no completó la llamada (código ${r.status ?? "desconocido"}).`));
  return si(corta(quitaRutas(`${nombre} ejecutado en ${TITULOS[app]} (trabajo «${ctx.contexto}»): ${resumen(r.resultado)}`)), accion === "exportar" ? "Exportando…" : "Ejecutando la herramienta…");
}
