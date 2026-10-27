// Idea inspirada en billion-context (MIT + atribución); sin código copiado.
// Pliegue de historial por niveles: rangos estables desde el índice 0, nada se
// borra y cada bloque se restaura o se busca. Puro: sin red, sin disco, sin node:*.

export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue { presupuestoChars: number; recientesChars?: number; maxResumenChars?: number; resumidor?: (turnos: Turno[], maxChars: number) => string }
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }

const CABECERA = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const TAM_BLOQUE = 6, TAM_FUSION = 4, MAX_FRASE = 140;

/** Recorta en palabra sin pasar de `max` caracteres. */
function recortarPalabra(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, Math.max(0, max)), espacio = corte.lastIndexOf(" ");
  return (espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd();
}

/** Primera frase de un turno, hasta 140 caracteres y cortada en palabra. */
function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const encontrada = limpio.match(/^.*?[.!?](?:\s|$)/);
  const frase = encontrada ? encontrada[0].trim() : limpio;
  return frase.length <= MAX_FRASE ? frase : `${recortarPalabra(frase, MAX_FRASE - 1)}…`;
}

/** Minúsculas y sin acentos, para comparar léxicamente. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Resumen barato sin modelo: `U:`/`A:` + primera frase de cada turno. */
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const unido = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`).join(" | ");
  return unido.slice(0, Math.max(0, maxChars));
}

function lineasDe(bloques: BloquePlegado[]): string[] {
  return bloques.map((b) => `- (turnos ${b.desde}–${b.hasta - 1}) ${b.resumen}`);
}

function textoDe(bloques: BloquePlegado[]): string {
  return bloques.length ? [CABECERA, ...lineasDe(bloques)].join("\n") : "";
}

/** Fusiona los 4 bloques consecutivos más antiguos de un nivel en uno del siguiente. */
function fusionar(bloques: BloquePlegado[], nivel: 1 | 2, resumir: (turnos: Turno[], maxChars: number) => string, maxResumen: number): BloquePlegado[] {
  for (let i = 0; i <= bloques.length - TAM_FUSION; i++) {
    const grupo = bloques.slice(i, i + TAM_FUSION);
    if (!grupo.every((b) => b.nivel === nivel)) continue;
    const desde = grupo[0].desde, hasta = grupo[TAM_FUSION - 1].hasta;
    const resumen = resumir(grupo.map((b) => ({ rol: "assistant" as const, texto: b.resumen })), maxResumen);
    const nuevo: BloquePlegado = { id: `m${nivel + 1}-${desde}-${hasta}`, nivel: nivel === 1 ? 2 : 3, desde, hasta, resumen };
    return [...bloques.slice(0, i), nuevo, ...bloques.slice(i + TAM_FUSION)];
  }
  return bloques;
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, op.presupuestoChars);
  const recientesChars = Math.max(0, op.recientesChars ?? Math.floor(presupuesto * 0.6));
  const maxResumen = Math.max(1, op.maxResumenChars ?? 400);
  const resumir = op.resumidor ?? resumenExtractivo;
  let corte = historial.length, usado = 0;
  while (corte > 0) {
    const largo = historial[corte - 1].texto.length;
    if (usado + largo > recientesChars) break;
    usado += largo;
    corte -= 1;
  }
  const recientes = historial.slice(corte);
  const charsRecientes = recientes.reduce((total, t) => total + t.texto.length, 0);
  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < corte; desde += TAM_BLOQUE) {
    const hasta = Math.min(desde + TAM_BLOQUE, corte);
    bloques.push({ id: `n1-${desde}-${hasta}`, nivel: 1, desde, hasta, resumen: resumir(historial.slice(desde, hasta), maxResumen) });
  }
  let descartadosChars = 0;
  const excede = () => charsRecientes + textoDe(bloques).length > presupuesto;
  while (excede()) {
    const antes = bloques;
    if (bloques.filter((b) => b.nivel === 1).length >= TAM_FUSION) bloques = fusionar(bloques, 1, resumir, maxResumen);
    if (bloques === antes && bloques.filter((b) => b.nivel === 2).length >= TAM_FUSION) bloques = fusionar(bloques, 2, resumir, maxResumen);
    if (bloques === antes) break;
  }
  while (bloques.length && excede()) {
    const sobra = charsRecientes + textoDe(bloques).length - presupuesto;
    const primero = bloques[0], linea = lineasDe([primero])[0];
    if (sobra >= linea.length) {
      descartadosChars += primero.resumen.length;
      bloques = bloques.slice(1);
    } else {
      const nuevoLargo = Math.max(0, primero.resumen.length - sobra);
      descartadosChars += primero.resumen.length - nuevoLargo;
      const resumen = primero.resumen.slice(0, nuevoLargo);
      bloques = resumen ? [{ ...primero, resumen }, ...bloques.slice(1)] : bloques.slice(1);
    }
  }
  return { recientes, bloques, texto: textoDe(bloques), descartadosChars };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

/** Puntúa bloques por palabras de la consulta (≥ 4 letras) en su texto original. */
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = Array.from(new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4)));
  if (!palabras.length) return [];
  const puntuadas = bloques.map((bloque, orden) => {
    const texto = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
    const puntos = palabras.reduce((total, p) => total + (texto.includes(p) ? 1 : 0), 0);
    return { bloque, puntos, orden };
  }).filter((x) => x.puntos > 0);
  puntuadas.sort((a, b) => b.puntos - a.puntos || a.orden - b.orden);
  return puntuadas.slice(0, Math.max(0, k)).map((x) => x.bloque);
}
