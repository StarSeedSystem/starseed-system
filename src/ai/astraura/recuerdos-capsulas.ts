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

/** Acierto de LEANN tal como lo devuelve su servidor (mismo contrato estructural). */
export interface AciertoLeann {
  id: string;
  puntuacion?: number;
  texto: string;
  metadatos?: Record<string, string | number>;
}

export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoCapsula[] | null>;

export interface OpcionesBuscarLeann {
  k?: number;
  filtros?: Record<string, unknown>;
  pesoVector?: number;
}

export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opciones: OpcionesBuscarLeann,
) => Promise<AciertoLeann[] | null>;

/** Dependencias y ajustes comunes a las dos formas de llamar a `recordar`. */
export interface OpcionesRecordar {
  /** Búsqueda en Memvid (en vivo: /api/memorias/capsulas; en tests: fake). */
  buscar: BuscarCapsulaFn;
  /** Búsqueda por significado en LEANN; sin ella todo sigue con Memvid. */
  buscarLeann?: BuscarLeannFn;
  /** Si el modelo elegido es de la nube → ejecuta detectarFuga contra lo personal. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 900). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
}

export interface RecordarOpciones extends OpcionesRecordar {
  /** Consulta del usuario. */
  consulta: string;
  /** Contexto del chat: qué cápsulas buscar y quién pregunta. */
  contexto: ContextoCapsulas & { actor: ActorMemoria };
}

/** Máximo de fragmentos totales que se devuelven. */
const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
const MAX_CARACTERES = 1500;
/** k por cápsula. */
const K_POR_CAPSULA = 4;
/** Tope total por defecto entre Memvid y LEANN. */
const TOPE_POR_DEFECTO = 900;

const ALCANCES: readonly AlcanceMemoria[] = ["personal", "perfil", "grupo", "publica"];

/** Barato primero: una consulta de menos de 4 palabras y sin pregunta no busca. */
function consultaValeLaPena(consulta: string): boolean {
  const palabras = consulta.trim().split(/\s+/).filter(Boolean);
  return palabras.length >= 4 || /[?¿]/.test(consulta);
}

/** Normaliza el alcance que llega en los metadatos de LEANN; si no vale, el de la cápsula. */
function alcanceValido(valor: unknown, porDefecto: AlcanceMemoria): AlcanceMemoria {
  return typeof valor === "string" && (ALCANCES as readonly string[]).includes(valor)
    ? (valor as AlcanceMemoria)
    : porDefecto;
}

/** Nombre del índice LEANN del sujeto (mismo formato que `nombreIndiceLeann`). */
function indiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}

function aRecuerdoMemvid(acierto: AciertoCapsula): Recuerdo {
  return {
    uri: acierto.uri ?? "",
    texto: acierto.texto,
    titulo: acierto.titulo,
    ts: acierto.ts,
    fuente: "memvid",
    alcance: acierto.alcance,
  };
}

function aRecuerdoLeann(
  acierto: AciertoLeann,
  porDefecto: AlcanceMemoria,
): Recuerdo {
  return {
    uri: acierto.id,
    texto: acierto.texto,
    fuente: "leann",
    puntuacion: acierto.puntuacion,
    alcance: alcanceValido(acierto.metadatos?.alcance, porDefecto),
  };
}

function aFragmento(recuerdo: Recuerdo): FragmentoMemoria {
  return {
    id: recuerdo.uri || `texto-${recuerdo.texto.length}-${recuerdo.texto.slice(0, 12)}`,
    alcance: recuerdo.alcance,
    texto: recuerdo.texto,
    origen: recuerdo.titulo ?? (recuerdo.fuente === "leann" ? "LEANN" : "Memvid"),
    at: recuerdo.ts ?? 0,
  };
}

/** Corre la tarea con un tope: lo que llegue tarde no entra. */
function conTope<T>(tarea: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(null), ms);
    tarea.then(
      (valor) => { clearTimeout(temporizador); resolver(valor); },
      () => { clearTimeout(temporizador); resolver(null); },
    );
  });
}

type ResultadoCapsula = { memvid: Recuerdo[]; leann: Recuerdo[] };

async function recordarImpl(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  opciones: OpcionesRecordar,
): Promise<string> {
  const {
    buscar,
    buscarLeann,
    esModeloNube = false,
    timeoutMs = TOPE_POR_DEFECTO,
    memoryScope,
  } = opciones;

  if (memoryScope === "personal") return "";
  if (!consultaValeLaPena(consulta)) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  const pesoVector = pesoVectorPara(consulta);
  const filtros = { alcance: { in: permitidos } };

  const tarea = Promise.all(
    capsulas.map(async (capsula): Promise<ResultadoCapsula> => {
      const sujeto = capsula.sujeto;
      const [memvid, leann] = await Promise.all([
        buscar(sujeto, consulta, K_POR_CAPSULA).catch(() => null),
        buscarLeann
          ? buscarLeann(indiceLeann(sujeto), consulta, {
              k: K_POR_CAPSULA,
              filtros,
              pesoVector,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const porDefecto = alcanceDe(sujeto);
      return {
        memvid: Array.isArray(memvid) ? memvid.map(aRecuerdoMemvid) : [],
        leann: Array.isArray(leann)
          ? leann.map((acierto) => aRecuerdoLeann(acierto, porDefecto))
          : [],
      };
    }),
  );

  const resultado = await conTope(tarea, timeoutMs);
  if (!resultado) return "";

  const memvid = resultado.flatMap((r) => r.memvid);
  const leann = resultado.flatMap((r) => r.leann);

  const fusionados = fundirRecuerdos([memvid, leann], {
    max: MAX_FRAGMENTOS,
    maxCaracteres: MAX_CARACTERES,
  });
  const fragmentos = filtrarParaAlcance(fusionados.map(aFragmento), permitidos);
  if (fragmentos.length === 0) return "";

  const cabecera = leann.length > 0
    ? "RECUERDOS (memoria + significado):"
    : "RECUERDOS (cápsulas Memvid):";
  let bloque = cabecera;
  for (const fragmento of fragmentos) bloque += `\n- ${fragmento.texto}`;

  if (esModeloNube) {
    const personales = fragmentos.filter((fragmento) => fragmento.alcance === "personal");
    if (personales.length > 0 && detectarFuga(bloque, personales).length > 0) {
      // En producción no se envía el bloque si hay fuga; aquí lo marcamos.
      bloque = "[FUGA DETECTADA] " + bloque;
    }
  }

  return bloque;
}

/**
 * Recuerda antes de responder: la consulta primero, el contexto después.
 * Sin `buscar` inyectado no hay a quién preguntar y devuelve vacío; la E/S va fuera.
 */
export async function recordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  opciones?: OpcionesRecordar,
): Promise<string>;
/** Forma histórica de MVD1027F: un objeto con consulta, contexto y búsqueda. */
export async function recordar(opciones: RecordarOpciones): Promise<string>;
export async function recordar(
  contextoUOpciones: (ContextoCapsulas & { actor: ActorMemoria }) | RecordarOpciones,
  consulta?: string,
  opciones?: OpcionesRecordar,
): Promise<string> {
  if (typeof consulta === "string") {
    if (!opciones?.buscar) return "";
    return recordarImpl(contextoUOpciones as ContextoCapsulas & { actor: ActorMemoria }, consulta, opciones);
  }
  const { consulta: preguntada, contexto, ...resto } = contextoUOpciones as RecordarOpciones;
  return recordarImpl(contexto, preguntada, resto);
}

/** Alias histórico (MVD1027F): el mismo `recordar`, con la forma de objeto. */
export const recordarDeCapsulas = recordar;

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";
