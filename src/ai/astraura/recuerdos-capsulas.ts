// Recuerdos de las cápsulas Memvid y del índice semántico LEANN en Astraura
// (MVD1027F-d1c, LNN1028F) — módulo PURO: sin red, sin disco, sin procesos.
// La E/S se inyecta (`buscar` Memvid y `buscarLeann` LEANN) para que el router de
// cliente, que corre en el navegador, no importe los clientes de servidor (`node:*`).
import {
  capsulasParaContexto,
  alcanceDe,
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

// Re-export para que los tests no tengan que importar de dos sitios
export { alcanceVisiblePara } from "@/lib/nucleo/alcance-memoria";

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

/** Acierto de LEANN: mismo contrato que `buscarLeann` de `leann-cliente.ts`. */
export interface AciertoLeann {
  id?: string;
  puntuacion?: number;
  texto: string;
  metadatos?: Record<string, string | number>;
}

export interface OpcionesBuscarLeann {
  k: number;
  filtros: Record<string, unknown>;
  pesoVector: number;
}

export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opciones: OpcionesBuscarLeann,
) => Promise<AciertoLeann[] | null>;

export interface RecordarOpciones {
  consulta: string;
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  buscar: BuscarCapsulaFn;
  /** Búsqueda por significado; sin LEANN el recuerdo sigue solo con Memvid. */
  buscarLeann?: BuscarLeannFn;
  esModeloNube?: boolean;
  timeoutMs?: number;
  memoryScope?: string;
}

const MAX_FRAGMENTOS = 6;
const K_POR_CAPSULA = 4;
const TOPE_MS = 900;
const ALCANCES: AlcanceMemoria[] = ["personal", "perfil", "grupo", "publica"];

/** Menos de 4 palabras y sin pregunta es demasiado vago: no se gasta búsqueda. */
export function consultaConSustancia(consulta: string): boolean {
  const palabras = consulta.trim().split(/\s+/).filter(Boolean).length;
  return palabras >= 4 || consulta.includes("?");
}

/** Índice LEANN del sujeto: `<tipo>-<id saneado>-<alcance>`, igual que el cliente. */
export function indiceLeannDe(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}

function alcanceValido(valor: unknown, porDefecto: AlcanceMemoria): AlcanceMemoria {
  return typeof valor === "string" && ALCANCES.includes(valor as AlcanceMemoria)
    ? (valor as AlcanceMemoria)
    : porDefecto;
}

function deMemvid(acierto: AciertoCapsula): Recuerdo {
  return {
    uri: acierto.uri ?? "",
    texto: acierto.texto,
    titulo: acierto.titulo,
    ts: acierto.ts,
    fuente: "memvid",
    alcance: acierto.alcance,
  };
}

function deLeann(acierto: AciertoLeann, alcanceCapsula: AlcanceMemoria): Recuerdo {
  const uri = typeof acierto.metadatos?.uri === "string" ? acierto.metadatos.uri : "";
  return {
    uri: uri || acierto.id || "",
    texto: acierto.texto,
    fuente: "leann",
    alcance: alcanceValido(acierto.metadatos?.alcance, alcanceCapsula),
  };
}

/** Espera solo lo que queda de plazo; lo que llega tarde vale null y no entra. */
function conTope<T>(promesa: Promise<T | null>, ms: number): Promise<T | null> {
  if (ms <= 0) return Promise.resolve(null);
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), ms);
  });
  const segura = promesa.catch(() => null);
  return Promise.race([segura, reloj]).finally(() => clearTimeout(temporizador));
}

/** Lanza una búsqueda sin dejar que un error síncrono tumbe a las demás. */
function intentar<T>(fn: () => Promise<T | null>): Promise<T | null> {
  return Promise.resolve().then(fn).catch(() => null);
}

function aFragmentos(recuerdos: Recuerdo[]): FragmentoMemoria[] {
  return recuerdos.map((r) => ({
    id: r.uri || `${r.fuente}:${r.texto}`,
    alcance: r.alcance,
    texto: r.texto,
    origen: r.titulo ?? r.fuente,
    at: r.ts ?? 0,
  }));
}

export async function recordar(opts: RecordarOpciones): Promise<string>;
export async function recordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  opciones?: Omit<RecordarOpciones, "contexto" | "consulta">,
): Promise<string>;
export async function recordar(
  primero: RecordarOpciones | (ContextoCapsulas & { actor: ActorMemoria }),
  consultaPosicional?: string,
  opcionesPosicionales?: Omit<RecordarOpciones, "contexto" | "consulta">,
): Promise<string> {
  const opts: RecordarOpciones =
    consultaPosicional === undefined
      ? (primero as RecordarOpciones)
      : ({
          ...(opcionesPosicionales ?? {}),
          contexto: primero as ContextoCapsulas & { actor: ActorMemoria },
          consulta: consultaPosicional,
        } as RecordarOpciones);
  const {
    consulta,
    contexto,
    buscar,
    buscarLeann,
    esModeloNube = false,
    timeoutMs = TOPE_MS,
    memoryScope,
  } = opts;

  if (!consultaConSustancia(consulta)) return "";
  if (memoryScope === "personal") return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  const limite = Date.now() + timeoutMs;
  const pesoVector = pesoVectorPara(consulta);

  const porCapsula = await Promise.all(
    capsulas.map(async (capsula) => {
      const sujeto = capsula.sujeto;
      const restante = () => limite - Date.now();
      const [memvid, leann] = await Promise.all([
        conTope(intentar(() => buscar(sujeto, consulta, K_POR_CAPSULA)), restante()),
        buscarLeann
          ? conTope(
              intentar(() =>
                buscarLeann(indiceLeannDe(sujeto), consulta, {
                  k: K_POR_CAPSULA,
                  filtros: { alcance: { in: permitidos } },
                  pesoVector,
                }),
              ),
              restante(),
            )
          : Promise.resolve(null),
      ]);
      return {
        memvid: (memvid ?? []).map(deMemvid),
        leann: (leann ?? []).map((a) => deLeann(a, capsula.alcance)),
      };
    }),
  );

  const memvidTodos = porCapsula.flatMap((r) => r.memvid);
  const leannTodos = porCapsula.flatMap((r) => r.leann);
  const fundidos = fundirRecuerdos([memvidTodos, leannTodos], { max: MAX_FRAGMENTOS });
  const filtrados = filtrarParaAlcance(aFragmentos(fundidos), permitidos);
  if (filtrados.length === 0) return "";

  const titulo =
    memvidTodos.length > 0 && leannTodos.length > 0
      ? "RECUERDOS (memoria + significado):"
      : leannTodos.length > 0
        ? "RECUERDOS (significado LEANN):"
        : "RECUERDOS (cápsulas Memvid):";
  let bloque = `${titulo}\n`;
  for (const fragmento of filtrados) bloque += `- ${fragmento.texto}\n`;
  bloque = bloque.trimEnd();

  if (esModeloNube) {
    const personales = filtrados.filter((f) => f.alcance === "personal");
    if (personales.length > 0 && detectarFuga(bloque, personales).length > 0) {
      bloque = "[FUGA DETECTADA] " + bloque;
    }
  }
  return bloque;
}

/** Alias de compatibilidad: el router y los tests antiguos siguen llamando aquí. */
export const recordarDeCapsulas = recordar;
