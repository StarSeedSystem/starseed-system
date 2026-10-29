// Buscador de referencias e inspiración (Ola 1018R · RFI1018F).
// Módulo PURO: catálogo, canales conectados, reloj y consultas VAN INYECTADOS.
// Sin red, disco ni reloj propio; lo privado no sale de las neuronas de la persona.
import type { Catalogo, EntradaReferencia } from "./catalogo";
import { canalPara } from "./politica-acceso";
export type TipoContextoReferencias = "perfil" | "pagina" | "grupo" | "mensaje" | "publicacion" | "pizarra" | "escritorio";
/** Palabras del contexto: gustos del perfil, tema del grupo, título de la página… */
export interface ContextoReferencias { tipo: TipoContextoReferencias; privado: boolean; palabras?: readonly string[]; }
export interface PersonalidadAgente { nombre?: string; rasgos?: readonly string[]; temas?: readonly string[]; }
export interface AdnDiseno { tema?: string; palabras?: readonly string[]; }
export interface EleccionLaya { tema: string; subtema?: string | null; }
/** Laya elige el tema (y el subtema si lo sabe) entre los del catálogo. */
export type ElegirTemaLaya = (
  peticion: string,
  temas: ReadonlyArray<{ id: string; nombre: string }>
) => Promise<EleccionLaya | null>;
export interface PeticionBuscarReferencias { peticion: string; contexto: ContextoReferencias; personalidad?: PersonalidadAgente; adnDiseno?: AdnDiseno; laya?: ElegirTemaLaya; }
/** `consultar` recibe solo la entrada y el canal oficial permitido: nunca el contexto privado. */
export interface DepsBuscarReferencias {
  catalogo: Catalogo; conectado?: ReadonlySet<string>; ahora?: () => number; limite?: number;
  consultar?: (entrada: EntradaReferencia, canal: string) => Promise<readonly string[]>;
}
export interface TarjetaReferencia { entradaId: string; porque: string; enlaces: string[]; canalUsado: string; }
const CONSULTA = new Set(["mcp-oficial", "api-oficial"]);
const PISTAS: Record<string, readonly string[]> = {
  "ia-diseno": ["ia", "inteligencia", "generar", "imagen", "presentacion", "prompt", "criterio"],
  guias: ["guia", "tutorial", "curso", "comunidad", "aprender"], movimiento: ["movimiento", "animacion", "transicion", "video", "lottie", "motion"],
  marca: ["marca", "logo", "identidad", "branding", "rebrand"], "tipografia-iconos": ["tipografia", "fuente", "letra", "icono", "iconos", "font"],
  "inspiracion-ui": ["interfaz", "menu", "navegacion", "boton", "pie", "footer", "galeria", "bento", "pantalla", "app"],
  reglas: ["regla", "usabilidad", "redaccion", "principio", "texto"],
};
const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const trozos = (s: string): string[] => norm(s).split(" ").filter((w) => w.length >= 3);
const palabrasDe = (xs: readonly string[]): Set<string> => new Set(xs.flatMap(trozos));
function puntuar(e: EntradaReferencia, tema: string, subtema: string | null, palabras: Set<string>, persona?: PersonalidadAgente, adn?: AdnDiseno): number {
  let p = e.tema === tema ? 6 : 0;
  if (subtema && e.subtema === subtema) p += 4;
  const campos = palabrasDe([e.nombre, e.que_es, e.tipo, e.subtema ?? "", e.tema]);
  for (const w of palabras) if (campos.has(w)) p += 2;
  if (persona?.temas?.includes(e.tema)) p += 5;
  for (const w of trozos((persona?.rasgos ?? []).join(" "))) if (campos.has(w)) p += 1;
  if (adn?.tema === e.tema) p += 5;
  for (const w of trozos((adn?.palabras ?? []).join(" "))) if (campos.has(w)) p += 1;
  return p;
}
function temaPorPalabras(palabras: Set<string>, catalogo: Catalogo): string | null {
  let mejor: { id: string; puntos: number } | null = null;
  for (const tema of catalogo.temas) {
    let p = 0;
    const pistas = palabrasDe([tema.nombre, ...(PISTAS[tema.id] ?? [])]);
    for (const w of palabras) if (pistas.has(w)) p += 2;
    for (const e of catalogo.entradas) {
      if (e.tema !== tema.id) continue;
      const campos = palabrasDe([e.nombre, e.que_es, e.subtema ?? ""]);
      for (const w of palabras) if (campos.has(w)) p += 1;
    }
    if (!mejor || p > mejor.puntos) mejor = { id: tema.id, puntos: p };
  }
  return mejor && mejor.puntos > 0 ? mejor.id : (catalogo.temas[0]?.id ?? null);
}
function subtemaPorPalabras(palabras: Set<string>, entradas: readonly EntradaReferencia[], tema: string): string | null {
  const cuenta = new Map<string, number>();
  for (const e of entradas) {
    if (e.tema !== tema || !e.subtema) continue;
    const pistas = palabrasDe([e.subtema, e.nombre]);
    for (const w of palabras) if (pistas.has(w)) cuenta.set(e.subtema, (cuenta.get(e.subtema) ?? 0) + 1);
  }
  let mejor: string | null = null, max = 0;
  for (const [s, n] of cuenta) if (n > max) { max = n; mejor = s; }
  return mejor;
}
export async function buscarReferencias(
  peticion: PeticionBuscarReferencias, deps: DepsBuscarReferencias
): Promise<TarjetaReferencia[]> {
  const { catalogo } = deps;
  if (!catalogo.temas.length || !catalogo.entradas.length) return [];
  const palabras = palabrasDe([peticion.peticion, ...(peticion.contexto.palabras ?? [])]);
  let eleccion: EleccionLaya | null = null;
  if (peticion.laya && peticion.peticion.trim()) {
    try {
      eleccion = await peticion.laya(peticion.peticion.trim(),
        catalogo.temas.map(({ id, nombre }) => ({ id, nombre })));
    } catch { eleccion = null; }
  }
  const valida = eleccion && catalogo.temas.some((t) => t.id === eleccion?.tema) ? eleccion : null;
  const tema = valida?.tema ?? temaPorPalabras(palabras, catalogo);
  if (!tema) return [];
  const subtema = valida?.subtema && catalogo.entradas.some((e) => e.tema === tema && e.subtema === valida.subtema)
    ? valida.subtema : subtemaPorPalabras(palabras, catalogo.entradas, tema);
  const temaNombre = catalogo.temas.find((t) => t.id === tema)?.nombre ?? tema;
  const orden = catalogo.entradas
    .map((e) => ({ e, p: puntuar(e, tema, subtema, palabras, peticion.personalidad, peticion.adnDiseno) }))
    .sort((a, b) => b.p - a.p || a.e.id.localeCompare(b.e.id))
    .slice(0, Math.max(1, Math.min(deps.limite ?? 6, 20)));
  const conectado = new Set(deps.conectado ?? []), ahora = (deps.ahora ?? Date.now)();
  const persona = peticion.personalidad, adn = peticion.adnDiseno, privado = peticion.contexto.privado;
  const tarjetas: TarjetaReferencia[] = [];
  for (const { e } of orden) {
    const canal = canalPara({ canales: e.canales, prohibido: e.prohibido }, { accion: "buscar", conectado, ahora }).canal;
    let enlaces: string[] = [e.url], canalUsado = "enlace";
    if (CONSULTA.has(canal) && conectado.has(canal) && deps.consultar) {
      try {
        const hallados = await deps.consultar(e, canal);
        if (hallados.length) { enlaces = [...hallados]; canalUsado = canal; }
      } catch { /* el canal oficial falló: la referencia vuelve como enlace */ }
    }
    const motivo: string[] = [];
    if (valida) motivo.push("elegida por Laya");
    motivo.push(`tema «${temaNombre}»`);
    if (subtema && e.subtema === subtema) motivo.push(`subtema «${subtema}»`);
    const campos = palabrasDe([e.nombre, e.que_es, e.tipo, e.subtema ?? ""]);
    const coincide = [...campos].filter((w) => palabras.has(w)).slice(0, 3);
    if (coincide.length) motivo.push(`coincide con «${coincide.join(", ")}»`);
    if (persona?.temas?.includes(e.tema)) motivo.push(`afín a la personalidad${persona.nombre ? ` «${persona.nombre}»` : ""}`);
    if (adn?.tema === e.tema) motivo.push("afín al ADN de diseño");
    if (privado) motivo.push("contexto privado: solo en tus neuronas");
    tarjetas.push({ entradaId: e.id, porque: motivo.join(" · "), enlaces, canalUsado });
  }
  return tarjetas;
}
