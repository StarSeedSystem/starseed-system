/**
 * Pliegue de historial por niveles para el contexto corto de Astraura 1.58.
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 * Módulo PURO y determinista: sin red, sin disco, sin `node:*` y sin reloj. El
 * historial original nunca se borra; los bloques guardan rangos [desde, hasta)
 * contados desde el índice 0, así que un bloque ya hecho no cambia con turnos
 * nuevos (amigable con las cachés de prefijo).
 */
export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export type Resumidor = (turnos: Turno[], maxChars: number) => string;
export interface OpcionesPliegue {
  presupuestoChars: number; recientesChars?: number; maxResumenChars?: number; resumidor?: Resumidor;
}
export interface ResultadoPliegue {
  recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number;
}
export const ENCABEZADO_PLIEGUE = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const TURNOS_POR_BLOQUE = 6;
const BLOQUES_POR_FUSION = 4;
const MAX_RESUMEN_POR_TURNO = 140;
const MAX_RESUMEN_DEFECTO = 240;
/** Primera frase del turno, cortada en palabra y con «…» si pasa de 140 caracteres. */
function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const m = limpio.match(/^(.+?[.!?])(?:\s|$)/);
  const frase = m ? m[1] : limpio;
  if (frase.length <= MAX_RESUMEN_POR_TURNO) return frase;
  const corte = frase.slice(0, MAX_RESUMEN_POR_TURNO);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).replace(/[.,;:!?]+$/, "")}…`;
}
/** Resumen barato, sin modelo: `U:`/`A:` + primera frase de cada turno. */
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  if (maxChars <= 0) return "";
  const unido = turnos
    .map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`)
    .join(" | ");
  return unido.length <= maxChars ? unido : unido.slice(0, maxChars).trimEnd();
}
/** Trozo original que respalda un bloque. */
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
/** Bloques que contienen alguna palabra de la consulta, con puntuación léxica estable. */
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
  if (!palabras.length) return [];
  return bloques
    .map((bloque, orden) => {
      const texto = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
      return { bloque, orden, puntos: palabras.filter((p) => texto.includes(p)).length };
    })
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .slice(0, Math.max(0, k))
    .map((p) => p.bloque);
}
function render(bloques: BloquePlegado[]): string {
  if (!bloques.length) return "";
  const lineas = bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`).join("\n");
  return `${ENCABEZADO_PLIEGUE}\n${lineas}`;
}
/** Fusiona los 4 bloques más antiguos en uno de nivel superior (resumen de resúmenes). */
function fusionar(bloques: BloquePlegado[], maxChars: number, resumidor?: Resumidor): void {
  const primeros = bloques.splice(0, BLOQUES_POR_FUSION);
  const desde = primeros[0].desde;
  const hasta = primeros[primeros.length - 1].hasta;
  const nivel: 1 | 2 | 3 = primeros[0].nivel === 1 ? 2 : 3;
  const resumen = (resumidor ?? resumenExtractivo)(
    primeros.map((b) => ({ rol: "assistant" as const, texto: b.resumen })),
    maxChars,
  );
  bloques.unshift({ id: `n${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen });
}
export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const recientesChars = Math.max(0, Math.floor(op.recientesChars ?? presupuesto * 0.6));
  const maxResumen = Math.max(0, Math.floor(op.maxResumenChars ?? MAX_RESUMEN_DEFECTO));
  let usados = 0;
  let inicio = historial.length;
  while (inicio > 0 && usados + historial[inicio - 1].texto.length <= recientesChars) {
    usados += historial[inicio - 1].texto.length;
    inicio -= 1;
  }
  const bloques: BloquePlegado[] = [];
  for (let i = 0; i < inicio; i += TURNOS_POR_BLOQUE) {
    const hasta = Math.min(i + TURNOS_POR_BLOQUE, inicio);
    const resumen = (op.resumidor ?? resumenExtractivo)(historial.slice(i, hasta), maxResumen);
    bloques.push({ id: `n1-${i}-${hasta}`, nivel: 1, desde: i, hasta, resumen });
  }
  const espacio = Math.max(0, presupuesto - usados);
  let descartadosChars = 0;
  while (bloques.length && render(bloques).length > espacio) {
    if (bloques.length >= BLOQUES_POR_FUSION && bloques[0].nivel < 3) {
      fusionar(bloques, maxResumen, op.resumidor);
      continue;
    }
    const exceso = render(bloques).length - espacio;
    const antiguo = bloques[0];
    const linea = `- (turnos ${antiguo.desde}–${antiguo.hasta}) ${antiguo.resumen}`;
    if (exceso >= linea.length) {
      descartadosChars += linea.length;
      bloques.shift();
      continue;
    }
    const quitar = Math.min(exceso, antiguo.resumen.length);
    const resumen = antiguo.resumen.slice(0, antiguo.resumen.length - quitar).trimEnd(); // ajuste
    descartadosChars += quitar;
    if (resumen) bloques[0] = { ...antiguo, resumen };
    else {
      descartadosChars += linea.length - quitar;
      bloques.shift();
    }
  }
  return { recientes: historial.slice(inicio), bloques, texto: render(bloques), descartadosChars };
}
