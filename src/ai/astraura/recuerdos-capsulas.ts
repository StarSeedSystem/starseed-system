// Recuerdos de las cápsulas Memvid y LEANN en Astraura (MVD1027F-d1c, LNN1028F) —
// módulo PURO: sin red, sin disco, sin procesos. Solo lógica de búsqueda, fusión
// por rango recíproco, filtrado por alcance y detección de fuga. La E/S real
// (Memvid y LEANN) se inyecta como dependencia para que sea testeable.
import {
  alcanceDe,
  capsulasParaContexto,
  saneaId,
  type ContextoCapsulas,
  type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import {
  filtrarParaAlcance,
  detectarFuga,
  alcanceVisiblePara,
  type FragmentoMemoria,
  type ActorMemoria,
  type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";
import {
  fundirRecuerdos,
  pesoVectorPara,
  type Recuerdo,
} from "@/lib/memorias/fusion-recuerdos";

export interface AciertoCapsula {
  titulo: string;
  texto: string;
  uri?: string;
  ts?: number;
  alcance: AlcanceMemoria;
  sujeto: SujetoMemoria;
}

export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoCapsula[] | null>;

export interface RecordarOpciones {
  /** Consulta del usuario. */
  consulta: string;
  /** Contexto del chat: qué cápsulas buscar y quién pregunta. */
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  /** Función de búsqueda (en vivo: llama a /api/memorias/capsulas; en tests: fake). */
  buscar: BuscarCapsulaFn;
  /** Si el modelo elegido es de la nube → ejecuta detectarFuga contra lo personal. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 800). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
}

/** Máximo de fragmentos totales que se devuelven. */
const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
const MAX_CARACTERES = 1500;
/** k por cápsula. */
const K_POR_CAPSULA = 4;

function memoriaScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

function aFragmentoMemoria(
  acierto: AciertoCapsula,
): FragmentoMemoria {
  return {
    id: acierto.uri ?? `capsula-${Date.now()}-${Math.random()}`,
    alcance: acierto.alcance,
    texto: acierto.texto,
    origen: acierto.titulo ?? acierto.sujeto.tipo,
    at: acierto.ts ?? Date.now(),
  };
}

/** Acierto de LEANN tal como lo devuelve su servidor (mismo contrato estructural). */
export interface AciertoLeann {
  id: string; puntuacion?: number; texto: string;
  metadatos?: Record<string, string | number>;
}
export interface OpcionesBuscarLeann { k?: number; filtros?: Record<string, unknown>; pesoVector?: number }
export type BuscarLeannFn = (
  indice: string, consulta: string, opciones: OpcionesBuscarLeann,
) => Promise<AciertoLeann[] | null>;

/** Dependencias y ajustes de `recordar`; la E/S siempre se inyecta. */
export interface OpcionesRecordar {
  buscar: BuscarCapsulaFn;
  /** Búsqueda por significado; sin ella todo sigue con Memvid. */
  buscarLeann?: BuscarLeannFn;
  esModeloNube?: boolean; timeoutMs?: number; memoryScope?: string;
}

const TOPE_POR_DEFECTO = 900;
const ALCANCES: readonly AlcanceMemoria[] = ["personal", "perfil", "grupo", "publica"];

/** Barato primero: menos de 4 palabras y sin pregunta no busca. */
function consultaValeLaPena(consulta: string): boolean {
  return consulta.trim().split(/\s+/).filter(Boolean).length >= 4 || /[?¿]/.test(consulta);
}
function alcanceValido(valor: unknown, porDefecto: AlcanceMemoria): AlcanceMemoria {
  return typeof valor === "string" && (ALCANCES as readonly string[]).includes(valor)
    ? (valor as AlcanceMemoria) : porDefecto;
}
/** Nombre del índice LEANN del sujeto (mismo formato que `nombreIndiceLeann`). */
function indiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}
function aRecuerdoMemvid(a: AciertoCapsula): Recuerdo {
  return { uri: a.uri ?? "", texto: a.texto, titulo: a.titulo, ts: a.ts, fuente: "memvid", alcance: a.alcance };
}
function aRecuerdoLeann(a: AciertoLeann, porDefecto: AlcanceMemoria): Recuerdo {
  return { uri: a.id, texto: a.texto, fuente: "leann", puntuacion: a.puntuacion,
    alcance: alcanceValido(a.metadatos?.alcance, porDefecto) };
}
/** Si un uri se repite con textos distintos (lotes o fakes), se desambigua. */
function conUriUnica(recuerdos: Recuerdo[]): Recuerdo[] {
  const vistos = new Map<string, string>();
  return recuerdos.map((r, i) => {
    if (!r.uri) return r;
    const previo = vistos.get(r.uri);
    if (previo === undefined || previo === r.texto) { vistos.set(r.uri, r.texto); return r; }
    return { ...r, uri: `${r.uri}#${i}` };
  });
}
function aFragmento(r: Recuerdo): FragmentoMemoria {
  return { id: r.uri || `texto-${r.texto.length}-${r.texto.slice(0, 12)}`, alcance: r.alcance,
    texto: r.texto, origen: r.titulo ?? (r.fuente === "leann" ? "LEANN" : "Memvid"), at: r.ts ?? 0 };
}
/** Corre la tarea con un tope: lo que llegue tarde no entra. */
function conTope<T>(tarea: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(null), ms);
    tarea.then((v) => { clearTimeout(temporizador); resolver(v); },
      () => { clearTimeout(temporizador); resolver(null); });
  });
}
function promesaSegura<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try { return Promise.resolve(fn()); } catch { return Promise.resolve(null); }
}
interface ResultadoCapsula { memvid: Recuerdo[]; leann: Recuerdo[] }

/** Por cada cápsula, a la vez Memvid (palabras) y LEANN (significado). */
async function consultarCapsula(
  sujeto: SujetoMemoria, consulta: string, opciones: OpcionesRecordar, filtros: Record<string, unknown>,
): Promise<ResultadoCapsula> {
  const { buscar, buscarLeann, timeoutMs = TOPE_POR_DEFECTO } = opciones;
  const memvidP = promesaSegura(() => buscar(sujeto, consulta, K_POR_CAPSULA));
  const leannP = buscarLeann
    ? promesaSegura(() => buscarLeann(indiceLeann(sujeto), consulta, {
        k: K_POR_CAPSULA, filtros, pesoVector: pesoVectorPara(consulta) }))
    : Promise.resolve(null);
  const [memvid, leann] = await Promise.all([conTope(memvidP, timeoutMs), conTope(leannP, timeoutMs)]);
  const porDefecto = alcanceDe(sujeto);
  return {
    memvid: Array.isArray(memvid) ? conUriUnica(memvid.map(aRecuerdoMemvid)) : [],
    leann: Array.isArray(leann) ? leann.map((a) => aRecuerdoLeann(a, porDefecto)) : [],
  };
}

async function recordarFundido(
  contexto: ContextoCapsulas & { actor: ActorMemoria }, consulta: string,
  opciones: OpcionesRecordar, aplicarJuicio: boolean,
): Promise<string> {
  const { esModeloNube = false, memoryScope } = opciones;
  if (memoryScope === "personal") return "";
  if (aplicarJuicio && !consultaValeLaPena(consulta)) return "";
  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";
  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";
  const filtros = { alcance: { in: permitidos } };
  const resultados = await Promise.all(
    capsulas.map((c) => consultarCapsula(c.sujeto, consulta, opciones, filtros)));
  const memvid = resultados.flatMap((r) => r.memvid);
  const leann = resultados.flatMap((r) => r.leann);
  const fusionados = fundirRecuerdos([memvid, leann], { max: MAX_FRAGMENTOS, maxCaracteres: MAX_CARACTERES });
  const fragmentos = filtrarParaAlcance(fusionados.map(aFragmento), permitidos);
  if (fragmentos.length === 0) return "";
  let bloque = leann.length > 0 ? "RECUERDOS (memoria + significado):" : "RECUERDOS (cápsulas Memvid):";
  for (const fragmento of fragmentos) bloque += `\n- ${fragmento.texto}`;
  if (esModeloNube) {
    const personales = fragmentos.filter((fr) => fr.alcance === "personal");
    if (personales.length > 0 && detectarFuga(bloque, personales).length > 0) {
      bloque = "[FUGA DETECTADA] " + bloque;
    }
  }
  return bloque;
}

/** Forma histórica de MVD1027F: un objeto con consulta, contexto y búsqueda. */
async function recordarHistorico(
  opts: RecordarOpciones,
): Promise<string> {
  const {
    consulta,
    contexto,
    buscar,
    esModeloNube = false,
    timeoutMs = 800,
    memoryScope,
  } = opts;

  if (!memoriaScopeActivaCapsulas(memoryScope)) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;

    for (const capsula of capsulas) {
      if (todos.length >= MAX_FRAGMENTOS) break;
      if (caracteresTotales >= MAX_CARACTERES) break;

      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!aciertos || aciertos.length === 0) continue;

      const fragmentos = aciertos.map(aFragmentoMemoria);
      const filtrados = filtrarParaAlcance(fragmentos, permitidos);

      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        if (caracteresTotales + fr.texto.length > MAX_CARACTERES) break;
        todos.push(fr);
        caracteresTotales += fr.texto.length;
      }
    }

    if (todos.length === 0) return "";

    let bloque = "RECUERDOS (cápsulas Memvid):\n";
    for (const fr of todos) {
      bloque += `- ${fr.texto}\n`;
    }

    if (esModeloNube) {
      const personales = todos.filter((fr) => fr.alcance === "personal");
      if (personales.length > 0) {
        const fugas = detectarFuga(bloque, personales);
        if (fugas.length > 0) {
          // En producción no se envía el bloque si hay fuga; aquí lo marcamos.
          // La llamada real en router.ts decidirá si suprimirlo.
          bloque = "[FUGA DETECTADA] " + bloque;
        }
      }
    }

    return bloque.trimEnd();
  } catch {
    return "";
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Recuerda antes de responder: `recordar(contexto, consulta, opciones)`.
 * Si la consulta es corta y no pregunta, no gasta búsquedas.
 */
export async function recordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria }, consulta: string, opciones?: OpcionesRecordar,
): Promise<string>;
/** Forma histórica de MVD1027F: un objeto con consulta, contexto y búsqueda. */
export async function recordar(opciones: RecordarOpciones): Promise<string>;
export async function recordar(
  contextoUOpciones: (ContextoCapsulas & { actor: ActorMemoria }) | RecordarOpciones,
  consulta?: string, opciones?: OpcionesRecordar,
): Promise<string> {
  if (typeof consulta === "string") {
    if (!opciones?.buscar) return "";
    return recordarFundido(
      contextoUOpciones as ContextoCapsulas & { actor: ActorMemoria }, consulta, opciones, true);
  }
  return recordarHistorico(contextoUOpciones as RecordarOpciones);
}

/** Alias histórico (MVD1027F): el mismo `recordar`. */
export const recordarDeCapsulas = recordar;

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";
