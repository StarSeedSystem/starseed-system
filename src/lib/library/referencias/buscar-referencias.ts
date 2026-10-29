// Referencias e inspiración · herramienta `referencias.buscar` (RFI1018F).
// Módulo PURO: catálogo, red, reloj y Laya se inyectan; sin `node:*` ni efectos propios.
import type { Pregunta } from "@/lib/jev/decisiones";
import type { Catalogo, EntradaReferencia } from "./catalogo";
import { canalPara } from "./politica-acceso";

export type TipoContexto = "perfil" | "pagina" | "grupo" | "mensaje" | "publicacion" | "pizarra" | "escritorio";
export interface ContextoReferencias { tipo: TipoContexto; privado: boolean }
export type Personalidad = string | { nombre?: string; tono?: string; intereses?: string[]; claves?: string[] };
export type AdnDiseno = string | string[] | { claves?: string[]; tema?: string; movimiento?: string };
export type LayaReferencias = (preguntas: Record<string, Pregunta>, estado: unknown) => Promise<Record<string, unknown> | null>;
export interface EnlaceReferencia { titulo: string; url: string }
export interface TarjetaReferencia { entradaId: string; porque: string; enlaces: EnlaceReferencia[]; canalUsado: string }
export interface DepsBuscarReferencias {
  catalogo: Catalogo;
  conectado?: ReadonlySet<string> | readonly string[];
  ahora?: () => number;
  consultar?: (p: { entrada: EntradaReferencia; canal: string; peticion: string }) => Promise<EnlaceReferencia[] | null | undefined>;
  laya?: LayaReferencias;
  maximo?: number;
}
export interface PeticionBuscarReferencias {
  peticion: string;
  contexto: ContextoReferencias;
  personalidad?: Personalidad;
  adnDiseno?: AdnDiseno;
  laya?: LayaReferencias;
}
const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const CLAVES: Record<string, string[]> = {
  "ia-diseno": ["ia", "inteligencia artificial", "prompt", "skill", "agente", "generar", "generador", "automatizar", "higgsfield", "linearity", "video"],
  guias: ["guia", "tutorial", "curso", "comunidad", "aprender", "truco", "blueprint", "vault", "newsletter", "proceso"],
  movimiento: ["animacion", "movimiento", "transicion", "motion", "lottie", "microinteraccion", "cinetica", "entrada", "salida", "rebote"],
  marca: ["marca", "branding", "logo", "identidad", "deck", "presentacion", "moodboard", "rebrand", "paleta"],
  "tipografia-iconos": ["tipografia", "fuente", "fuentes", "letra", "icono", "iconos", "font", "glifo", "peso", "familia"],
  "inspiracion-ui": ["interfaz", "ui", "web", "pagina", "layout", "navbar", "menu", "footer", "cta", "boton", "bento", "galeria", "pantalla", "app", "movil", "seccion", "404", "diseno"],
  reglas: ["usabilidad", "principio", "regla", "redaccion", "texto", "claridad", "accesible", "accesibilidad", "legible"],
};
const AFINIDAD: Record<TipoContexto, Record<string, number>> = {
  perfil: { marca: 6, "inspiracion-ui": 4, "tipografia-iconos": 3 }, pagina: { "inspiracion-ui": 6, marca: 4, movimiento: 2 },
  grupo: { marca: 4, guias: 4, movimiento: 2 }, mensaje: { "tipografia-iconos": 4, reglas: 4, movimiento: 2 },
  publicacion: { movimiento: 6, "inspiracion-ui": 4, marca: 3 }, pizarra: { movimiento: 6, "inspiracion-ui": 4, "ia-diseno": 2 },
  escritorio: { "inspiracion-ui": 6, movimiento: 4, "ia-diseno": 3 },
};

const textoDe = (e: EntradaReferencia): string => norm([e.nombre, e.que_es, e.tema, e.subtema ?? "", e.tipo, e.clase_uso].join(" "));
const clavesDe = (v: Personalidad | AdnDiseno | undefined): string[] => {
  if (!v) return [];
  if (typeof v === "string") return palabras(v);
  if (Array.isArray(v)) return v.flatMap(palabras);
  const o = v as { nombre?: string; tono?: string; tema?: string; movimiento?: string; intereses?: string[]; claves?: string[] };
  return [o.nombre, o.tono, o.tema, o.movimiento, ...(o.intereses ?? []), ...(o.claves ?? [])]
    .filter((x): x is string => typeof x === "string").flatMap(palabras);
};
const cruces = (e: EntradaReferencia, claves: string[]): string[] => [...new Set(claves.filter((k) => textoDe(e).includes(k)))];
const temaPorPalabras = (catalogo: Catalogo, pedido: string): string | null => {
  let mejor: string | null = null, puntos = 0;
  for (const tema of catalogo.temas) {
    const n = (CLAVES[tema.id] ?? palabras(tema.nombre)).reduce((s, k) => s + (pedido.includes(norm(k)) ? 1 : 0), 0);
    if (n > puntos) { mejor = tema.id; puntos = n; }
  } return mejor;
};
const subtemasDe = (catalogo: Catalogo, tema: string): string[] =>
  [...new Set(catalogo.entradas.filter((e) => e.tema === tema).map((e) => e.subtema).filter((s): s is string => !!s))];
const subtemaPorPalabras = (catalogo: Catalogo, tema: string, pedido: string): string | null => {
  let mejor: string | null = null, puntos = 0;
  for (const s of subtemasDe(catalogo, tema)) { const n = palabras(s).filter((w) => pedido.includes(w)).length; if (n > puntos) { mejor = s; puntos = n; } } return mejor;
};
const valorDe = (respuesta: Record<string, unknown> | null, clave: string): string | null => {
  if (!respuesta) return null;
  const base = respuesta.answers && typeof respuesta.answers === "object" ? respuesta.answers as Record<string, unknown> : respuesta;
  const v = base[clave];
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const elegido = (v as Record<string, unknown>).choice ?? (v as Record<string, unknown>).valor ?? (v as Record<string, unknown>).value ?? (v as Record<string, unknown>).answer;
    if (typeof elegido === "string") return elegido;
  }
  return null;
};
const elegirConLaya = async (catalogo: Catalogo, pedido: string, laya: LayaReferencias): Promise<{ tema: string | null; subtema: string | null }> => {
  const criterios: Record<string, string> = {}; for (const t of catalogo.temas) criterios[t.id] = t.nombre;
  const tema = valorDe(await laya({ tema: { type: "choice", instructions: "¿Qué tema de referencias encaja con esta petición?", criteria: criterios } }, { peticion: pedido }), "tema");
  if (!tema || !criterios[tema]) return { tema: null, subtema: null };
  const subtemas = subtemasDe(catalogo, tema), opciones: Record<string, string> = {};
  if (subtemas.length === 0) return { tema, subtema: null };
  subtemas.forEach((s, i) => { opciones[`s${i}`] = s; });
  const clave = valorDe(await laya({ subtema: { type: "choice", instructions: "¿Qué subtema encaja mejor?", criteria: opciones } }, { peticion: pedido, tema }), "subtema");
  return { tema, subtema: clave && opciones[clave] ? opciones[clave] : null };
};
async function tarjeta(e: EntradaReferencia, deps: DepsBuscarReferencias, peticion: string, privado: boolean, porque: string): Promise<TarjetaReferencia> {
  const conectado = new Set(deps.conectado ?? []), canal = canalPara(e, { accion: "buscar", conectado, ahora: (deps.ahora ?? Date.now)() }).canal;
  const oficial = canal === "mcp-oficial" || canal === "api-oficial", enlaces: EnlaceReferencia[] = [{ titulo: e.nombre, url: e.url }];
  let usado = "enlace";
  if (oficial && e.clase_uso !== "solo-enlace" && !privado && deps.consultar) try {
    for (const l of await deps.consultar({ entrada: e, canal, peticion }) ?? [])
      if (l.url && !enlaces.some((x) => x.url === l.url)) { enlaces.push(l); usado = canal; }
  } catch { /* el canal falló: se devuelve el enlace directo */ }
  return { entradaId: e.id, porque, enlaces, canalUsado: usado };
}
/** Busca referencias para un contexto: tema y subtema (Laya o palabras), orden por personalidad y ADN, y canales permitidos. */
export async function buscarReferencias(p: PeticionBuscarReferencias, deps: DepsBuscarReferencias): Promise<TarjetaReferencia[]> {
  const pedido = norm(p.peticion), terminos = [...new Set(palabras(pedido))];
  let tema: string | null = null, subtema: string | null = null;
  const laya = p.laya ?? deps.laya;
  if (laya) { try { ({ tema, subtema } = await elegirConLaya(deps.catalogo, pedido, laya)); } catch { /* sin Laya: regla por palabras */ } }
  tema = tema ?? temaPorPalabras(deps.catalogo, pedido);
  if (tema && !subtema) subtema = subtemaPorPalabras(deps.catalogo, tema, pedido);
  const cp = clavesDe(p.personalidad), ca = clavesDe(p.adnDiseno);
  const puntuar = (e: EntradaReferencia): number => (e.tema === tema ? 100 : 0) + (subtema && e.subtema === subtema ? 60 : 0)
    + 6 * cruces(e, terminos).length + 5 * cruces(e, cp).length + 4 * cruces(e, ca).length + (AFINIDAD[p.contexto.tipo]?.[e.tema] ?? 0);
  const elegidas = deps.catalogo.entradas.filter((e) => !tema || e.tema === tema).map((e) => ({ e, n: puntuar(e) }))
    .sort((a, b) => b.n - a.n).slice(0, deps.maximo ?? 6).map((x) => x.e);
  const nombreTema = deps.catalogo.temas.find((t) => t.id === tema)?.nombre ?? tema ?? "referencias";
  return Promise.all(elegidas.map((e) => {
    const c = [...new Set([...cruces(e, terminos), ...cruces(e, cp), ...cruces(e, ca)])].slice(0, 3);
    const porque = `Tema «${nombreTema}»${e.subtema ? ` · ${e.subtema}` : ""}; útil para ${p.contexto.tipo}.${c.length ? ` Encaja con «${c.join("», «")}».` : ""} De ${e.nombre} sale un diseño propio, citándola; no se copia nada.`;
    return tarjeta(e, deps, p.peticion, p.contexto.privado, porque.slice(0, 300));
  }));
}
