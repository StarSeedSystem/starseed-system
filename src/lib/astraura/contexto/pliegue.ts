/**
 * Pliegue de historial por niveles para el contexto corto de Astraura 1.58 (Ola 1025R).
 *
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 *
 * `buildAstraura158Prompt` (src/ai/providers/astraura-158.ts) solo conserva los turnos que caben
 * en ~9.000 caracteres y tira el resto: BitNet 2B olvida lo anterior. Aquí lo viejo se PLEGA en
 * bloques con rangos estables contados desde el índice 0 (amigables con cachés de prefijo),
 * NADA se borra (el historial queda intacto y cada bloque se restaura) y se PUEDE BUSCAR dentro
 * de lo plegado. Puro y determinista, sin red ni node:*. El `resumidor` inyectado es para
 * motores capaces (Bonsai 8B, nube); por defecto el extractivo, barato, sin modelo.
 */
export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado {
  id: string;
  nivel: 1 | 2 | 3;
  desde: number; // rango [desde, hasta) sobre el historial original
  hasta: number;
  resumen: string;
}
export interface OpcionesPliegue {
  presupuestoChars: number;
  recientesChars?: number; // por defecto el 60 % del presupuesto
  maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}
export interface ResultadoPliegue {
  recientes: Turno[];
  bloques: BloquePlegado[];
  texto: string; // encabezado + una línea por bloque; vacío si no hay bloques
  descartadosChars: number;
}
export const ENCABEZADO_PLIEGUE = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const FRASE_MAX = 140;
const TURNOS_POR_BLOQUE = 6;
const FUSION_GRUPO = 4;
const MAX_RESUMEN_DEFECTO = 240;
const minusculasSinAcentos = (texto: string): string =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Primera frase de hasta 140 caracteres, cortada en palabra y con «…» si hubo corte. */
function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const fin = limpio.search(/[.!?…]/);
  const frase = (fin >= 0 ? limpio.slice(0, fin + 1) : limpio).slice(0, FRASE_MAX + 1);
  return frase.length <= FRASE_MAX ? frase : `${frase.slice(0, FRASE_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/** Extractivo barato: `U:`/`A:` + primera frase por turno, unidos con « | », a maxChars. */
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const completo = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`).join(" | ");
  return completo.length <= maxChars ? completo : completo.slice(0, maxChars);
}
/** Pliega el historial al presupuesto: recientes íntegros (sufijo de atrás hacia delante,
 * hasta `recientesChars`, por defecto el 60 % del presupuesto); los anteriores en bloques de
 * nivel 1 de 6 turnos desde el índice 0. Si no cabe, se fusionan de 4 en 4 los más antiguos
 * (nivel 2, luego 3: resumen de los resúmenes) y, si aun así no cabe, se recorta el bloque más
 * antiguo sumando sus caracteres originales a `descartadosChars`. Determinista por diseño. */
export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const maxResumen = op.maxResumenChars ?? MAX_RESUMEN_DEFECTO;
  const topeRecientes = Math.max(0, op.recientesChars ?? Math.floor(presupuesto * 0.6));
  const resumir = (turnos: Turno[]): string => op.resumidor ? op.resumidor(turnos, maxResumen) : resumenExtractivo(turnos, maxResumen);
  let desdeRecientes = historial.length;
  let usados = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    if (usados + historial[i].texto.length > topeRecientes) break;
    usados += historial[i].texto.length;
    desdeRecientes = i;
  }
  const recientes = historial.slice(desdeRecientes);
  const bloques: BloquePlegado[] = [];
  for (let i = 0; i < desdeRecientes; i += TURNOS_POR_BLOQUE) {
    const hasta = Math.min(i + TURNOS_POR_BLOQUE, desdeRecientes);
    bloques.push({
      id: `pleg1-${i}-${hasta}`,
      nivel: 1,
      desde: i,
      hasta,
      resumen: resumir(historial.slice(i, hasta)),
    });
  }
  const textoDe = (): string => bloques.length === 0 ? "" : `${ENCABEZADO_PLIEGUE}\n${bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`).join("\n")}`;
  // Los resúmenes no caben: se fusionan de 4 en 4 los más antiguos (nivel 2, luego 3).
  while (textoDe().length > presupuesto && bloques.length >= FUSION_GRUPO) {
    const viejos = bloques.splice(0, FUSION_GRUPO);
    const nivel = Math.min(3, viejos[0].nivel + 1) as 1 | 2 | 3;
    const desde = viejos[0].desde;
    const hasta = viejos[viejos.length - 1].hasta;
    const pseudo: Turno[] = viejos.map((b) => ({ rol: "assistant" as const, texto: b.resumen }));
    bloques.unshift({ id: `pleg${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen: resumir(pseudo) });
  }
  // Aun así no cabe: se recorta el bloque más antiguo y se cuenta lo original descartado.
  let descartadosChars = 0;
  while (textoDe().length > presupuesto && bloques.length > 0) {
    const fuera = bloques.shift() as BloquePlegado;
    descartadosChars += restaurarBloque(historial, fuera).reduce((n, t) => n + t.texto.length, 0);
  }
  return { recientes, bloques, texto: textoDe(), descartadosChars };
}

/** El trozo original EXACTO del historial que representa un bloque: nada se borra nunca. */
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}
/** Búsqueda: palabras de la consulta (con acentos quitados, de ≥ 4 letras) presentes en el
 * texto original del bloque; solo puntuaciones mayores que cero; orden estable; máximo k. */
export function buscarEnBloques(
  historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3,
): BloquePlegado[] {
  const palabras = Array.from(new Set(minusculasSinAcentos(consulta).match(/[a-z0-9]{4,}/g) ?? []));
  if (palabras.length === 0) return [];
  const conPuntos = bloques
    .map((bloque) => {
      const trozo = minusculasSinAcentos(historial.slice(bloque.desde, bloque.hasta).map((t) => t.texto).join(" "));
      return { bloque, puntos: palabras.filter((p) => trozo.includes(p)).length };
    })
    .filter((x) => x.puntos > 0);
  conPuntos.sort((a, b) => b.puntos - a.puntos);
  return conPuntos.slice(0, k).map((x) => x.bloque);
}
