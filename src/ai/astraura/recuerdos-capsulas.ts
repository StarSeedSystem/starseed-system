// Recuerdos de cápsulas Memvid ANTES de responder (MVD1027F · 2026-10-27) —
// contrato: architecture/memvid-capsulas.md §3. SOLO DE SERVIDOR: busca en las
// cápsulas del chat (127.0.0.1:4490 vía memvid-cliente.ts) y arma el bloque
// «RECUERDOS (cápsulas Memvid):» para inyectarlo junto a `chatCfgNote`. Sin
// claves ni rutas de disco. Nunca lanza: sin servidor el bloque es «».
import { capsulasParaContexto, type CapsulaMemoria, type ContextoCapsulas } from "@/lib/memorias/capsulas";
import { buscar, type AciertoMemvid, type OpcionesCliente } from "@/lib/memorias/memvid-cliente";
import {
  alcanceVisiblePara, detectarFuga, filtrarParaAlcance, type ActorMemoria, type FragmentoMemoria,
} from "@/lib/nucleo/alcance-memoria";

export const K_POR_CAPSULA = 4;
export const MAX_FRAGMENTOS = 6;
export const MAX_CARACTERES = 1500;
export const TOPE_RECUERDOS_MS = 800;
export interface OpcionesRecordar {
  /** Quien pregunta: manda qué alcances ve (por defecto, la persona dueña). */
  actor?: ActorMemoria;
  /** true = el modelo elegido es de la nube: nada personal sale de la neurona. */
  aNube?: boolean;
  /** Cliente de cápsulas (el fetch falso en las pruebas). */
  cliente?: OpcionesCliente;
  /** Fecha base del trimestre; por defecto, ahora. */
  fecha?: Date;
  /** Reloj (ms) inyectado para el tope total: determinista en pruebas. */
  ahora?: () => number;
}

/** Aciertos de una cápsula → fragmentos con SU alcance y la cápsula como origen. */
export function capsulaAFragmentos(
  capsula: CapsulaMemoria, aciertos: AciertoMemvid[], ahora: () => number,
): FragmentoMemoria[] {
  return aciertos
    .filter((a) => typeof a?.texto === "string" && a.texto.trim().length > 0)
    .map((a, i) => ({
      id: `${capsula.nombre}#${i}`,
      alcance: capsula.alcance,
      texto: a.texto,
      origen: capsula.nombre,
      at: typeof a.ts === "number" ? a.ts : ahora(),
    }));
}

/**
 * Corta al tope del contrato: ≤ `maxFragmentos` y ≤ `maxCaracteres`. El primero
 * entra SIEMPRE (aunque desborde). Pura, como `fundirRecuerdos`.
 */
export function recortarRecuerdos(
  fragmentos: FragmentoMemoria[], maxFragmentos: number = MAX_FRAGMENTOS, maxCaracteres: number = MAX_CARACTERES,
): FragmentoMemoria[] {
  const salida: FragmentoMemoria[] = [];
  let usados = 0;
  for (const fr of fragmentos) {
    if (salida.length >= maxFragmentos) break;
    if (salida.length > 0 && usados + fr.texto.length > maxCaracteres) break;
    salida.push(fr);
    usados += fr.texto.length;
  }
  return salida;
}

/**
 * Última red contra la fuga hacia un modelo de la NUBE: los fragmentos de
 * alcance personal NO salen de la neurona y el resto pasa `detectarFuga`
 * contra lo personal (repetir la vida privada del dueño también es fuga).
 * Sin nube, no-op: el alcance ya lo filtró `filtrarParaAlcance`. Pura.
 */
export function sinFugas(fragmentos: FragmentoMemoria[], aNube: boolean): FragmentoMemoria[] {
  if (!aNube) return fragmentos;
  const personales = fragmentos.filter((fr) => fr.alcance === "personal");
  return fragmentos.flatMap((fr) => {
    if (fr.alcance === "personal") return [];
    const otras = personales.filter((p) => p !== fr);
    return detectarFuga(fr.texto, otras).length === 0 ? [fr] : [];
  });
}

/** El bloque que entra al system prompt: encabezado fijo y una línea por recuerdo. */
export function bloqueDeRecuerdos(fragmentos: FragmentoMemoria[]): string {
  if (fragmentos.length === 0) return "";
  const cuerpo = fragmentos.map((fr) => `- (${fr.origen}) ${fr.texto}`).join("\n");
  return `RECUERDOS (cápsulas Memvid):\n${cuerpo}`;
}

/**
 * `recordarDeCapsulas(contexto, consulta)` — busca k=4 en cada cápsula del
 * contexto (de la más cercana a la más general: personalidad → agente →
 * cerebro → perfil → grupo → página) hasta llenar 6 fragmentos o 1500
 * caracteres, filtra por el alcance de quien pregunta y, si el modelo va a
 * la nube, `detectarFuga` contra lo personal. NUNCA lanza; sin servidor, sin
 * consulta o cápsulas vale «». El llamador (router.ts) la envuelve en 800 ms.
 */
export async function recordarDeCapsulas(
  contexto: ContextoCapsulas, consulta: string, opciones: OpcionesRecordar = {},
): Promise<string> {
  try {
    const preg = consulta.trim();
    if (!preg) return "";
    const ahora = opciones.ahora ?? Date.now;
    const fecha = opciones.fecha ?? new Date();
    const actor = opciones.actor ?? { tipo: "usuario" as const };
    const limite = ahora() + TOPE_RECUERDOS_MS;
    const ya = new Set<string>(); // dedupe entre cápsulas que comparten memoria
    const juntados: FragmentoMemoria[] = [];
    for (const capsula of capsulasParaContexto(contexto, actor, fecha)) {
      if (juntados.length >= MAX_FRAGMENTOS || ahora() >= limite) break;
      const aciertos = await buscar(capsula.sujeto, preg, K_POR_CAPSULA, fecha, opciones.cliente);
      if (!Array.isArray(aciertos)) continue; // sin respuesta: cápsula siguiente
      for (const fr of capsulaAFragmentos(capsula, aciertos, ahora)) {
        if (ya.has(fr.texto)) continue;
        ya.add(fr.texto);
        juntados.push(fr);
      }
    }
    const visibles = filtrarParaAlcance(juntados, alcanceVisiblePara(actor));
    return bloqueDeRecuerdos(recortarRecuerdos(sinFugas(visibles, opciones.aNube === true)));
  } catch {
    return ""; // si falla, no hay bloque: nada rompe el turno
  }
}
