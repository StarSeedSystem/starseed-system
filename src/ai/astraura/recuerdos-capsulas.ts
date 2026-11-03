// Recuerdos de las cápsulas Memvid en Astraura (MVD1027F, 2026-10-27).
// Contrato: architecture/memvid-capsulas.md §3 — «Astraura busca en las cápsulas del
// contexto antes de responder». Módulo PURO (sin node:*): el cliente del servidor de
// cápsulas entra INYECTADO en `buscarFn`, y el router pasa el real de memvid-cliente.
import {
  capsulasParaContexto,
  type CapsulaMemoria,
  type ContextoCapsulas,
  type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import {
  alcanceVisiblePara,
  detectarFuga,
  filtrarParaAlcance,
  type ActorMemoria,
  type AlcanceMemoria,
  type FragmentoMemoria,
} from "@/lib/nucleo/alcance-memoria";

// k=4 aciertos por cápsula, tope de 6 fragmentos y 1.500 caracteres en total (contrato §3).
export const K_BUSQUEDA = 4;
export const MAX_FRAGMENTOS = 6;
export const MAX_CARACTERES = 1500;

/** Un fragmento de cápsula, en la forma que `alcance-memoria.ts` entiende. */
const COMO_MEMORIA = (f: FragmentoCapsula): FragmentoMemoria => ({
  id: f.uri ?? "", alcance: f.alcance, texto: f.texto, origen: "cápsula-memvid", at: f.ts ?? 0,
});

export interface AciertoCapsula { titulo?: string; texto: string; uri?: string; ts?: number }
export interface FragmentoCapsula extends AciertoCapsula { alcance: AlcanceMemoria }
export type BuscarCapsulas = (
  sujeto: SujetoMemoria, consulta: string, k: number, fecha: Date,
) => Promise<AciertoCapsula[] | null>;
export interface OpcionesRecordarCapsulas {
  /** Cliente del servidor de cápsulas (inyectado; el router pasa `buscar` de memvid-cliente). */
  buscarFn?: BuscarCapsulas;
  /** `fecha` del trimestre de cápsulas, `actor` (por defecto, el dueño), `k` de búsqueda. */
  fecha?: Date;
  k?: number;
  actor?: ActorMemoria;
  /** Alcance de memoria elegido en ESTE chat (menú unificado, Adenda 71-bis). */
  memoryScope?: string;
  /** true (por defecto): la salida se criba contra lo personal antes de ir a la nube. */
  esModeloNube?: boolean;
  /** Tope total de consulta de cápsulas, en ms (por defecto 800). */
  topeMs?: number;
}

/** Último turno del usuario: la consulta por la que se pregunta a las cápsulas. */
export function consultaDeTurno(mensajes: { role: string; content: string }[]): string {
  return [...mensajes].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
}

/** Qué cápsulas deja ver el alcance de memoria del chat: «personal» acota a lo del dueño,
 * «compartida» a lo de grupo/página y «cerebro-activo» solo al cerebro; sin alcance no acota. */
export function capsulasParaScope(varias: CapsulaMemoria[], memoryScope?: string): CapsulaMemoria[] {
  const deAlcance = (permitidos: AlcanceMemoria[]) => varias.filter((c) => permitidos.includes(c.alcance));
  if (memoryScope === "personal") return deAlcance(["personal", "perfil"]);
  if (memoryScope === "compartida") return deAlcance(["grupo", "publica"]);
  if (memoryScope === "cerebro-activo") return varias.filter((c) => c.sujeto.tipo === "cerebro");
  return varias;
}

/** El bloque «RECUERDOS (cápsulas Memvid):» que entra de cabeza al prompt. Sin recuerdos, "". */
export function bloqueDeRecuerdos(frs: FragmentoCapsula[]): string {
  if (!frs.length) return "";
  return `RECUERDOS (cápsulas Memvid):\n${frs.map((f) => `• ${f.texto}`).join("\n")}`;
}

/** Red de seguridad ANTES de salir hacia un modelo de la nube (contrato §3): cada bloque
 * que sale pasa `detectarFuga` contra lo personal (cada uno no se delata a sí mismo). */
function cribarParaNube(frs: FragmentoCapsula[]): FragmentoCapsula[] {
  const personales = frs.filter((f) => f.alcance === "personal");
  if (!personales.length) return frs;
  return frs.filter((f) => {
    const otras = personales.filter((p) => p !== f).map(COMO_MEMORIA);
    return detectarFuga(f.texto, otras).length === 0;
  });
}

/** Busca `k=4` en cada cápsula del contexto (de la más cercana a la más general) hasta
 * llenar el tope de fragmentos o caracteres; pasa `filtrarParaAlcance` y la criba de nube. */
export async function recuerdosDeCapsulas(
  contexto: ContextoCapsulas, consulta: string, opciones: OpcionesRecordarCapsulas = {},
): Promise<FragmentoCapsula[]> {
  if (!consulta.trim()) return [];
  const fecha = opciones.fecha ?? new Date();
  const actor: ActorMemoria = opciones.actor ?? { tipo: "usuario" };
  const capsulas = capsulasParaScope(capsulasParaContexto(contexto, actor, fecha), opciones.memoryScope);
  const vence = Date.now() + (opciones.topeMs ?? 800);
  const hallados: FragmentoCapsula[] = [];
  let usados = 0;
  for (const capsula of capsulas) {
    if (hallados.length >= MAX_FRAGMENTOS || usados >= MAX_CARACTERES) break;
    if (Date.now() >= vence) break;
    try {
      if (!opciones.buscarFn) break;
      const aciertos = await opciones.buscarFn(capsula.sujeto, consulta, opciones.k ?? K_BUSQUEDA, fecha);
      for (const acierto of aciertos ?? []) {
        if (!acierto?.texto) continue;
        if (hallados.length >= MAX_FRAGMENTOS || usados + acierto.texto.length > MAX_CARACTERES) break;
        hallados.push({ ...acierto, alcance: capsula.alcance });
        usados += acierto.texto.length;
      }
    } catch { /* una cápsula tumbada no tumba el resto: se sigue con la siguiente */ }
  }
  const ids = new Set(filtrarParaAlcance(hallados.map(COMO_MEMORIA), alcanceVisiblePara(actor)).map((m) => m.id));
  const permitidas = hallados.filter((f) => ids.has(f.uri ?? ""));
  return opciones.esModeloNube === false ? permitidas : cribarParaNube(permitidas);
}

/** El punto del router: cápsulas del contexto → bloque «RECUERDOS…», o "" si nada salió. */
export async function recordarDeCapsulas(
  contexto: ContextoCapsulas, consulta: string, opciones: OpcionesRecordarCapsulas = {},
): Promise<string> {
  return bloqueDeRecuerdos(await recuerdosDeCapsulas(contexto, consulta, opciones));
}
