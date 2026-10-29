// Referencias e inspiración · búsqueda por contexto (RFI1018F).
// Módulo PURO: catálogo, canales conectados, reloj y consulta MCP/API van inyectados.
// De una referencia sale un diseño propio con la referencia citada: nunca se copia.
import catalogoJson from "../../../../config/referencias-inspiracion.json";
import { canalPara } from "./politica-acceso";
import type { Catalogo, EntradaReferencia, TemaReferencia } from "./catalogo";
import { RASGOS, type Personalidad, type Rasgo } from "@/lib/astraura-bots/tipos";
import type { PreguntaChoice } from "@/lib/jev/decisiones";

export const CATALOGO_REFERENCIAS = catalogoJson as unknown as Catalogo;

export type TipoContexto = "perfil" | "pagina" | "grupo" | "mensaje" | "publicacion" | "pizarra" | "escritorio";
export const CONTEXTOS: readonly TipoContexto[] = ["perfil", "pagina", "grupo", "mensaje", "publicacion", "pizarra", "escritorio"];
export interface ContextoReferencias { tipo: TipoContexto; privado: boolean }
export interface AdnDiseno { temas?: readonly string[]; palabras?: readonly string[]; registroMovimiento?: "sobrio" | "expresivo" | "experimental" }
export interface EleccionLaya { tema?: string | null; subtema?: string | null; answer_confidence?: number }
export interface EntradaBuscarReferencias { peticion: string; contexto: ContextoReferencias; personalidad?: Partial<Personalidad>; adnDiseno?: AdnDiseno; laya?: EleccionLaya | null }
export interface TarjetaReferencia { entradaId: string; porque: string; enlaces: string[]; canalUsado: string }
export interface DepsBuscarReferencias {
  catalogo?: Catalogo; conectados: Set<string>; ahora: () => number; tope?: number;
  consultar?: (peticion: string, entrada: EntradaReferencia, canal: string) => Promise<{ enlaces: readonly string[] } | null>;
}

/** Pregunta `choice` de Laya con los temas del catálogo (sin Laya, se elige por palabras). */
export function preguntaTema(catalogo: Catalogo = CATALOGO_REFERENCIAS): PreguntaChoice {
  return { type: "choice", instructions: "¿Qué tema del catálogo de referencias encaja con esta petición?",
    criteria: Object.fromEntries(catalogo.temas.map((t) => [t.id, t.nombre])) };
}

const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const palabras = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const solapan = (a: readonly string[], b: ReadonlySet<string>): number => a.reduce((n, w) => n + (b.has(w) ? 1 : 0), 0);
const textoDe = (e: EntradaReferencia): string[] => palabras([e.nombre, e.subtema ?? "", e.que_es, e.tipo].join(" "));
const AFINIDAD: Record<string, Partial<Record<Rasgo, number>>> = {
  "ia-diseno": { curiosidad: 1 }, guias: { formalidad: 1, calidez: 1 }, movimiento: { energia: 1, curiosidad: 0.4 }, marca: { calidez: 1, formalidad: 0.5 },
  "tipografia-iconos": { formalidad: 1, concision: 0.5 }, "inspiracion-ui": { humor: 1, curiosidad: 1 }, reglas: { concision: 1, formalidad: 1 },
};
const REGISTRO: Record<string, string> = { sobrio: "reglas", expresivo: "movimiento", experimental: "ia-diseno" };
function afinidad(tema: string, p?: Partial<Personalidad>): number {
  if (!p) return 0;
  return Object.entries(AFINIDAD[tema] ?? {}).reduce((s, [r, peso]) => s + ((p[r as Rasgo] ?? 0.5) - 0.5) * (peso as number), 0);
}
function puntuarTema(tema: TemaReferencia, cat: Catalogo, ps: Set<string>, p?: Partial<Personalidad>, adn?: AdnDiseno): number {
  const propias = solapan(palabras(`${tema.nombre} ${tema.id}`), ps) * 2;
  const dentro = Math.max(0, ...cat.entradas.filter((e) => e.tema === tema.id).map((e) => solapan(textoDe(e), ps)));
  return propias + dentro * 1.5 + afinidad(tema.id, p) + (adn?.temas?.includes(tema.id) ? 4 : 0)
    + (REGISTRO[adn?.registroMovimiento ?? ""] === tema.id ? 2 : 0);
}
function subtemaDe(cat: Catalogo, tema: string, ps: Set<string>): string | null {
  let mejor: string | null = null, tope = 0;
  for (const e of cat.entradas) {
    if (e.tema !== tema || !e.subtema) continue;
    const n = solapan(palabras(e.subtema), ps) + solapan(palabras(e.nombre), ps);
    if (n > tope) { tope = n; mejor = e.subtema; }
  }
  return tope > 0 ? mejor : null;
}
function elegir(cat: Catalogo, entrada: EntradaBuscarReferencias): { tema: string; subtema: string | null } {
  const ps = new Set(palabras(entrada.peticion));
  const valido = cat.temas.find((t) => t.id === entrada.laya?.tema);
  const orden = [...cat.temas].sort((a, b) => puntuarTema(b, cat, ps, entrada.personalidad, entrada.adnDiseno)
    - puntuarTema(a, cat, ps, entrada.personalidad, entrada.adnDiseno));
  const tema = valido?.id ?? orden[0]?.id ?? "inspiracion-ui";
  const subtema = entrada.laya?.subtema?.trim() || subtemaDe(cat, tema, ps);
  return { tema, subtema };
}
function puntuarEntrada(e: EntradaReferencia, entrada: EntradaBuscarReferencias, tema: string, ps: Set<string>): number {
  const propias = new Set(textoDe(e));
  let n = solapan([...ps], propias) * 2 + (e.tema === tema ? 3 : 0) + afinidad(e.tema, entrada.personalidad);
  if (e.subtema && solapan(palabras(e.subtema), ps) > 0) n += 2;
  if (entrada.adnDiseno?.temas?.includes(e.tema)) n += 2;
  if (entrada.adnDiseno?.palabras?.some((w) => propias.has(norm(w))) || REGISTRO[entrada.adnDiseno?.registroMovimiento ?? ""] === e.tema) n += 1.5;
  return n;
}
function rasgoDestacado(p?: Partial<Personalidad>): Rasgo | null {
  let mejor: Rasgo | null = null, tope = 0.55;
  for (const r of RASGOS) { const v = p?.[r] ?? 0; if (v > tope) { tope = v; mejor = r; } }
  return mejor;
}
function porque(e: EntradaReferencia, entrada: EntradaBuscarReferencias, canalUsado: string, tema: string): string {
  const partes = [`«${e.nombre}» coincide con el tema «${tema}»`];
  if (e.subtema && solapan(palabras(e.subtema), new Set(palabras(entrada.peticion))) > 0) partes.push(`responde al subtema «${e.subtema}»`);
  const rasgo = rasgoDestacado(entrada.personalidad); if (rasgo) partes.push(`encaja con tu ${rasgo}`);
  if (entrada.adnDiseno?.temas?.includes(e.tema)) partes.push("lo pide el ADN de diseño de este contexto");
  if (entrada.contexto.privado) partes.push("tu contexto es privado: solo se abre el enlace y nada sale de tus neuronas");
  else if (canalUsado === "enlace") partes.push("se abre como enlace porque su MCP o API no está conectado");
  else partes.push(`se consulta por su canal oficial ${canalUsado}`);
  return `Se elige porque ${partes.join("; ")}.`;
}
async function tarjetaDe(e: EntradaReferencia, entrada: EntradaBuscarReferencias, deps: DepsBuscarReferencias, tema: string): Promise<TarjetaReferencia> {
  const canal = canalPara(e, { accion: "buscar", conectado: deps.conectados, ahora: deps.ahora() });
  const oficial = (canal.canal === "mcp-oficial" || canal.canal === "api-oficial") && deps.conectados.has(canal.canal);
  let enlaces = [e.url], canalUsado = "enlace";
  if (!entrada.contexto.privado && oficial && deps.consultar) {
    try {
      const r = await deps.consultar(entrada.peticion, e, canal.canal);
      if (r?.enlaces.length) { enlaces = [...r.enlaces]; canalUsado = canal.canal; }
    } catch { /* sin canal: la referencia se abre como enlace */ }
  }
  return { entradaId: e.id, porque: porque(e, entrada, canalUsado, tema), enlaces, canalUsado };
}

/** Elige tema y subtema, ordena por personalidad y ADN y consulta solo los canales permitidos. */
export async function buscarReferencias(
  entrada: EntradaBuscarReferencias,
  deps: DepsBuscarReferencias,
): Promise<TarjetaReferencia[]> {
  const cat = deps.catalogo ?? CATALOGO_REFERENCIAS;
  if (!cat.entradas.length || !entrada.peticion.trim()) return [];
  const { tema, subtema } = elegir(cat, entrada);
  const ps = new Set(palabras(entrada.peticion));
  let candidatos = cat.entradas.filter((e) => e.tema === tema);
  if (subtema) {
    const con = candidatos.filter((e) => e.subtema && norm(e.subtema).includes(norm(subtema)));
    if (con.length) candidatos = con;
  }
  const orden = candidatos.map((e, i) => ({ e, i, n: puntuarEntrada(e, entrada, tema, ps) }))
    .sort((a, b) => b.n - a.n || a.i - b.i).slice(0, Math.min(5, Math.max(1, deps.tope ?? 3))).map((x) => x.e);
  return Promise.all(orden.map((e) => tarjetaDe(e, entrada, deps, tema)));
}
