// Astraura · «referencias.buscar» (RFI1018F): tema/subtema con Laya o palabras, orden por personalidad y ADN.
import type { PreguntaChoice } from "@/lib/jev/decisiones";
import catalogoJson from "../../../../config/referencias-inspiracion.json";
import { canalPara } from "./politica-acceso";
import type { Catalogo, EntradaReferencia } from "./catalogo";
export type TipoContexto = "perfil" | "pagina" | "grupo" | "mensaje" | "publicacion" | "pizarra" | "escritorio";
export interface ContextoReferencias { tipo: TipoContexto; privado?: boolean }
export interface PeticionBuscarReferencias { peticion: string; contexto: ContextoReferencias; personalidad?: unknown; adnDiseno?: unknown; laya?: LayaReferencias }
export interface TarjetaReferencia { entradaId: string; porque: string; enlaces: string[]; canalUsado: string }
export interface RespuestaLaya { tema?: string | null; subtema?: string | null }
type RespuestaCruda = RespuestaLaya | { answers?: Record<string, unknown> } | null;
type LlamadaLaya = (entrada: { peticion: string; contexto: ContextoReferencias; estado: unknown; preguntas: Record<string, PreguntaChoice> }) => RespuestaCruda | Promise<RespuestaCruda>;
export type LayaReferencias = RespuestaLaya | LlamadaLaya | { tema?: string | null; subtema?: string | null; elegir?: LlamadaLaya; preguntar?: LlamadaLaya };
export interface DepsBuscarReferencias {
  catalogo?: Catalogo; conectado?: Iterable<string>; ahora?: number | (() => number); limite?: number;
  consultar?: (entrada: EntradaReferencia, canal: string, peticion: string) => string[] | Promise<string[]>;
  consultarCanal?: DepsBuscarReferencias["consultar"];
}
const CATALOGO = catalogoJson as unknown as Catalogo, LIMITE = 6;
const normalizar = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabrasDe = (s: string): string[] => normalizar(s).split(/[^a-z0-9]+/).filter((p) => p.length > 2);
const textoDe = (v: unknown): string => (typeof v === "string" ? v : "");
function aplanar(v: unknown, salida: string[] = []): string[] {
  if (typeof v === "string") salida.push(...palabrasDe(v));
  else if (typeof v === "number") salida.push(String(v));
  else if (Array.isArray(v)) for (const x of v) aplanar(x, salida);
  else if (v && typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) aplanar(x, salida);
  return salida;
}
const camposDe = (e: EntradaReferencia): string[] => palabrasDe([e.nombre, e.que_es, e.tipo, e.tema, e.subtema ?? "", ...e.canales].join(" "));
const enComun = (campo: string[], busca: Set<string>): number => campo.filter((p) => busca.has(p)).length;
const buscarTema = (v: string, catalogo: Catalogo): string | null => catalogo.temas.find((t) => normalizar(t.id) === normalizar(v) || normalizar(t.nombre) === normalizar(v))?.id ?? null;
/** Tema y subtema por palabras; sin coincidencias, `null` y decide el catálogo completo. */
export function elegirPorPalabras(peticion: string, catalogo: Catalogo = CATALOGO, fijo: string | null = null): { tema: string | null; subtema: string | null } {
  const busca = new Set(palabrasDe(peticion)); let tema = fijo, puntos = 0, subtema: string | null = null, puntosSubtema = 0;
  if (!fijo) for (const t of catalogo.temas) {
    const campo = palabrasDe([t.nombre, t.id, ...catalogo.entradas.filter((e) => e.tema === t.id).map((e) => `${e.nombre} ${e.que_es} ${e.subtema ?? ""}`)].join(" "));
    const s = enComun(campo, busca); if (s > puntos) { puntos = s; tema = t.id; }
  }
  for (const e of catalogo.entradas) {
    if (!e.subtema || (tema && e.tema !== tema)) continue;
    const s = enComun(palabrasDe(e.subtema), busca); if (s > puntosSubtema) { puntosSubtema = s; subtema = e.subtema; }
  }
  return { tema: fijo ?? tema, subtema };
}
function leerEleccion(v: unknown, catalogo: Catalogo): RespuestaLaya | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, answers = o.answers && typeof o.answers === "object" ? o.answers as Record<string, unknown> : null;
  const a = answers?.tema && typeof answers.tema === "object" ? answers.tema as Record<string, unknown> : null;
  const temaCrudo = textoDe(o.tema) || textoDe(o.choice) || textoDe(a?.choice);
  const subtema = textoDe(o.subtema) || textoDe((answers?.subtema as Record<string, unknown> | undefined)?.choice);
  const tema = temaCrudo ? buscarTema(temaCrudo, catalogo) : null;
  return tema || subtema ? { tema, subtema: subtema || null } : null;
}
async function eleccionDeLaya(peticion: PeticionBuscarReferencias, catalogo: Catalogo): Promise<RespuestaLaya | null> {
  const laya = peticion.laya; if (!laya) return null;
  const fn = typeof laya === "function" ? laya : typeof laya === "object" ? ((laya as { elegir?: LlamadaLaya; preguntar?: LlamadaLaya }).elegir ?? (laya as { preguntar?: LlamadaLaya }).preguntar) : undefined;
  if (!fn) return leerEleccion(laya, catalogo);
  try {
    const preguntas = preguntasDeTema(catalogo);
    return leerEleccion(await fn({ peticion: peticion.peticion, contexto: peticion.contexto, estado: { peticion: peticion.peticion, contexto: peticion.contexto }, preguntas }), catalogo);
  } catch { return null; }
}
const nombreTema = (id: string | null, catalogo: Catalogo): string => catalogo.temas.find((t) => t.id === id)?.nombre ?? "el catálogo";
const enlacesLimpios = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^https:\/\//.test(x)) : [];
function elegirEntradas(peticion: PeticionBuscarReferencias, catalogo: Catalogo, tema: string | null, subtema: string | null, limite: number): EntradaReferencia[] {
  const busca = new Set(palabrasDe(peticion.peticion)), persona = new Set(aplanar(peticion.personalidad)), adn = new Set(aplanar(peticion.adnDiseno));
  const candidatas = tema ? catalogo.entradas.filter((e) => e.tema === tema) : catalogo.entradas;
  const punto = (e: EntradaReferencia): number => {
    const campo = camposDe(e);
    let s = enComun(campo, busca) * 3 + enComun(campo, persona) * 2 + enComun(campo, adn) * 2;
    if (tema && e.tema === tema) s += 12;
    if (subtema && e.subtema && normalizar(e.subtema).includes(normalizar(subtema))) s += 6;
    return e.clase_uso === "reutilizable" ? s + 1 : s;
  };
  const orden = [...candidatas].sort((a, b) => punto(b) - punto(a) || a.nombre.localeCompare(b.nombre));
  const vistos = new Set<string>(), salida: EntradaReferencia[] = [];
  for (const e of orden) if (!vistos.has(e.tema)) { vistos.add(e.tema); salida.push(e); if (salida.length >= limite) return salida; }
  for (const e of orden) if (!salida.includes(e)) { salida.push(e); if (salida.length >= limite) break; }
  return salida;
}
function porqueDe(e: EntradaReferencia, peticion: PeticionBuscarReferencias, tema: string | null, subtema: string | null, catalogo: Catalogo): string {
  const razones: string[] = [], persona = new Set(aplanar(peticion.personalidad)), adn = new Set(aplanar(peticion.adnDiseno));
  if (subtema && e.subtema && normalizar(e.subtema).includes(normalizar(subtema))) razones.push(`subtema «${e.subtema}»`);
  if (enComun(camposDe(e), persona) > 0) razones.push("encaja con tu personalidad");
  if (enComun(camposDe(e), adn) > 0) razones.push("encaja con tu ADN de diseño");
  if (!razones.length) razones.push(`tema «${nombreTema(tema, catalogo)}»`);
  return `${e.nombre}: ${e.que_es} Elegida por ${razones.join(" y ")}. Se estudia el patrón, se diseña una versión propia y se cita la referencia.`;
}
async function armarTarjetas(peticion: PeticionBuscarReferencias, catalogo: Catalogo, tema: string | null, subtema: string | null,
  conectado: Set<string>, deps: DepsBuscarReferencias | undefined): Promise<TarjetaReferencia[]> {
  const privado = peticion.contexto.privado === true, consultar = deps?.consultar ?? deps?.consultarCanal, tarjetas: TarjetaReferencia[] = [];
  const ahora = typeof deps?.ahora === "function" ? deps.ahora() : deps?.ahora ?? 0, limite = Math.max(1, Math.min(deps?.limite ?? LIMITE, 12));
  for (const e of elegirEntradas(peticion, catalogo, tema, subtema, limite)) {
    const canal = canalPara(e, { accion: "buscar", conectado, ahora }), oficial = (canal.canal === "mcp-oficial" || canal.canal === "api-oficial") && conectado.has(canal.canal);
    let enlaces = [e.url], canalUsado = "enlace";
    if (!privado && oficial && consultar) {
      try { const r = enlacesLimpios(await consultar(e, canal.canal, peticion.peticion)); if (r.length) { enlaces = r; canalUsado = canal.canal; } } catch { /* enlace directo */ }
    }
    tarjetas.push({ entradaId: e.id, porque: porqueDe(e, peticion, tema, subtema, catalogo), enlaces, canalUsado });
  }
  return tarjetas;
}
export function preguntasDeTema(catalogo: Catalogo = CATALOGO): Record<string, PreguntaChoice> {
  const criteria: Record<string, string> = {};
  for (const tema of catalogo.temas) criteria[tema.id] = tema.nombre;
  return { tema: { type: "choice", instructions: "¿Qué tema de referencias encaja mejor con esta petición y su contexto?", criteria } };
}
export function buscarReferenciasLocal(peticion: PeticionBuscarReferencias, catalogo: Catalogo = CATALOGO): TarjetaReferencia[] {
  const { tema, subtema } = elegirPorPalabras(peticion.peticion, catalogo);
  return elegirEntradas(peticion, catalogo, tema, subtema, LIMITE).map((e) => ({
    entradaId: e.id, porque: porqueDe(e, peticion, tema, subtema, catalogo), enlaces: [e.url], canalUsado: "enlace",
  }));
}
export async function buscarReferencias(peticion: PeticionBuscarReferencias, deps: DepsBuscarReferencias = {}): Promise<TarjetaReferencia[]> {
  const catalogo = deps.catalogo ?? CATALOGO, eleccion = await eleccionDeLaya(peticion, catalogo);
  const porPalabras = elegirPorPalabras(peticion.peticion, catalogo, eleccion?.tema ?? null);
  const tema = eleccion?.tema ?? porPalabras.tema, subtema = eleccion?.subtema ?? porPalabras.subtema;
  return armarTarjetas(peticion, catalogo, tema, subtema, new Set(deps.conectado ?? []), deps);
}
