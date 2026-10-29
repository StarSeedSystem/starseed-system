// Referencias e inspiración · herramienta `referencias.buscar` (RFI1018F).
// Módulo PURO: catálogo, red, reloj y Laya entran inyectados; sin `node:*`, sin `any`.
import type { Catalogo, EntradaReferencia } from "./catalogo";
import type { Decision, Pregunta } from "@/lib/jev/decisiones";
import { canalPara } from "./politica-acceso";

export type TipoContexto = "perfil" | "pagina" | "grupo" | "mensaje" | "publicacion" | "pizarra" | "escritorio";
export interface ContextoBusqueda { tipo: TipoContexto; privado: boolean }
export interface PersonalidadBusqueda { rasgos?: Readonly<Record<string, number>>; intereses?: readonly string[] }
export interface AdnBusqueda { tema?: string; palabras?: readonly string[]; movimiento?: string }
/** Laya inyectado: una pasada de preguntas tipadas (`choice`) devuelve sus decisiones. */
export type LayaBusqueda = (p: { estado: unknown; preguntas: Record<string, Pregunta> }) =>
  Promise<Record<string, Decision> | null> | Record<string, Decision> | null;
export interface PeticionBusqueda {
  peticion: string;
  contexto: ContextoBusqueda;
  personalidad?: PersonalidadBusqueda;
  adnDiseno?: AdnBusqueda;
  laya?: LayaBusqueda;
}
export interface EnlaceReferencia { titulo: string; url: string; canal: string }
export interface ConsultaCanalArgs { entrada: EntradaReferencia; canal: string; peticion: string; contexto: ContextoBusqueda }
export type ConsultaCanal = (args: ConsultaCanalArgs) =>
  Promise<readonly EnlaceReferencia[] | null> | readonly EnlaceReferencia[] | null;
export interface TarjetaReferencia { entradaId: string; porque: string; enlaces: EnlaceReferencia[]; canalUsado: string }
export interface DepsBuscarReferencias {
  catalogo: Catalogo;
  conectados: ReadonlySet<string>;
  consultarCanal?: ConsultaCanal;
  ahora?: () => number;
}
export const MAX_REFERENCIAS = 3;
const OFICIALES: ReadonlySet<string> = new Set(["mcp-oficial", "api-oficial"]);
const VACIAS: ReadonlySet<string> = new Set(["para", "como", "con", "del", "las", "los", "una", "uno", "que", "por", "mas", "the", "and"]);
const sinAcentos = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (s: string): string[] => sinAcentos(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !VACIAS.has(w));
const choice = (instructions: string, criteria: Record<string, string>): Pregunta => ({ type: "choice", instructions, criteria });
export async function buscarReferencias(peticion: PeticionBusqueda, deps: DepsBuscarReferencias): Promise<TarjetaReferencia[]> {
  const terminos = new Set(palabras(`${peticion.peticion} ${(peticion.adnDiseno?.palabras ?? []).join(" ")}`));
  const estado = peticion.contexto.privado ? { tipo: peticion.contexto.tipo } : { peticion: peticion.peticion, tipo: peticion.contexto.tipo };
  const tema = await elegirTema(peticion, terminos, estado, deps.catalogo);
  const subtema = await elegirSubtema(peticion, terminos, estado, deps.catalogo, tema);
  const delTema = deps.catalogo.entradas.filter((e) => e.tema === tema);
  const candidatas = subtema ? delTema.filter((e) => e.subtema === subtema) : delTema;
  const elegidas = (candidatas.length ? candidatas : delTema)
    .map((e) => ({ e, puntos: afinidad(e, peticion, terminos) }))
    .sort((a, b) => b.puntos - a.puntos || a.e.id.localeCompare(b.e.id))
    .slice(0, MAX_REFERENCIAS);
  return Promise.all(elegidas.map(({ e }) => tarjeta(e, peticion, deps, tema, subtema)));
}
async function elegirTema(peticion: PeticionBusqueda, terminos: Set<string>, estado: unknown, catalogo: Catalogo): Promise<string> {
  const criterios = Object.fromEntries(catalogo.temas.map((t) => [t.id, t.nombre]));
  const respuesta = await preguntar(peticion.laya, estado, { tema: choice("¿Qué tema de referencias encaja con lo pedido?", criterios) });
  const elegido = respuesta?.tema?.valor;
  if (typeof elegido === "string" && Object.prototype.hasOwnProperty.call(criterios, elegido)) return elegido;
  return temaPorPalabras(catalogo, terminos);
}
async function elegirSubtema(peticion: PeticionBusqueda, terminos: Set<string>, estado: unknown, catalogo: Catalogo, tema: string): Promise<string | null> {
  const subtemas = [...new Set(catalogo.entradas.filter((e) => e.tema === tema && e.subtema).map((e) => e.subtema as string))];
  if (!subtemas.length) return null;
  const criterios = Object.fromEntries(subtemas.map((s) => [s, s]));
  const respuesta = await preguntar(peticion.laya, estado, { subtema: choice("¿Qué subtema conviene para este contexto?", criterios) });
  const elegido = respuesta?.subtema?.valor;
  if (typeof elegido === "string" && Object.prototype.hasOwnProperty.call(criterios, elegido)) return elegido;
  const porPalabras = subtemas.map((s) => ({ s, n: palabras(s).filter((w) => terminos.has(w)).length }))
    .sort((a, b) => b.n - a.n || a.s.localeCompare(b.s))[0];
  return porPalabras && porPalabras.n > 0 ? porPalabras.s : null;
}
function temaPorPalabras(catalogo: Catalogo, terminos: Set<string>): string {
  let mejor = "", puntos = 0;
  for (const t of catalogo.temas) {
    const propias = palabras(t.nombre).filter((w) => terminos.has(w)).length * 2;
    const ajenas = catalogo.entradas.filter((e) => e.tema === t.id)
      .reduce((n, e) => n + palabras(`${e.nombre} ${e.subtema ?? ""} ${e.que_es}`).filter((w) => terminos.has(w)).length, 0);
    if (propias + ajenas > puntos) { mejor = t.id; puntos = propias + ajenas; }
  }
  return mejor || "inspiracion-ui";
}
function afinidad(e: EntradaReferencia, peticion: PeticionBusqueda, terminos: Set<string>): number {
  const texto = palabras(`${e.nombre} ${e.subtema ?? ""} ${e.que_es} ${e.tipo}`);
  let n = texto.filter((w) => terminos.has(w)).length * 2;
  const rasgos = peticion.personalidad?.rasgos ?? {};
  const porRasgo: Record<string, readonly string[]> = {
    curiosidad: ["ia-diseno", "guias"], formalidad: ["reglas"], energia: ["movimiento"],
    calidez: ["marca"], concision: ["inspiracion-ui", "reglas"], humor: ["inspiracion-ui", "marca"],
  };
  for (const [rasgo, temas] of Object.entries(porRasgo)) if ((rasgos[rasgo] ?? 0) > 0.6 && temas.includes(e.tema)) n += 2;
  for (const i of peticion.personalidad?.intereses ?? []) if (palabras(i).some((w) => texto.includes(w))) n += 1;
  const adn = peticion.adnDiseno;
  if (adn?.tema === e.tema) n += 3;
  if (adn?.movimiento && e.tema === "movimiento") n += 1;
  for (const w of adn?.palabras ?? []) if (palabras(w).some((x) => texto.includes(x))) n += 1;
  if (e.clase_uso === "reutilizable") n += 0.3;
  else if (e.clase_uso === "reutilizable-con-condiciones") n += 0.2;
  return n;
}
async function tarjeta(e: EntradaReferencia, peticion: PeticionBusqueda, deps: DepsBuscarReferencias, tema: string, subtema: string | null): Promise<TarjetaReferencia> {
  const { contexto } = peticion;
  const canal = canalPara({ canales: e.canales, prohibido: e.prohibido },
    { accion: "buscar", conectado: new Set(deps.conectados), ahora: (deps.ahora ?? Date.now)() }).canal;
  const base: EnlaceReferencia = { titulo: e.nombre, url: e.url, canal: "enlace" };
  const porque = `Encaja con «${subtema ?? e.subtema ?? tema}» para ${contexto.tipo}: ${e.que_es} Inspiración citada, nunca copia.`;
  const consultar = deps.consultarCanal, soloEnlace = { entradaId: e.id, porque, enlaces: [base], canalUsado: "enlace" };
  if (!consultar || contexto.privado || !OFICIALES.has(canal) || !deps.conectados.has(canal)) return soloEnlace;
  try {
    const salida = await consultar({ entrada: e, canal, peticion: peticion.peticion, contexto });
    const enlaces = [...(salida ?? [])].filter((x) => x.url.startsWith("https://"));
    return enlaces.length ? { ...soloEnlace, enlaces, canalUsado: canal } : soloEnlace;
  } catch { return soloEnlace; }
}
async function preguntar(laya: LayaBusqueda | undefined, estado: unknown, preguntas: Record<string, Pregunta>): Promise<Record<string, Decision> | null> {
  if (!laya) return null;
  try { return await laya({ estado, preguntas }); } catch { return null; }
}