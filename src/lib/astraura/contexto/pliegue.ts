// Pliegue de historial por niveles para el contexto corto de Astraura 1.58.
// Idea inspirada en billion-context (MIT + atribución); sin código copiado.
// Módulo PURO y determinista: sin red, sin disco, sin node:*.

export interface Turno { rol: "user" | "assistant"; texto: string; }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string; }

export interface OpcionesPliegue {
  presupuestoChars: number;
  recientesChars?: number;
  maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number; }

export const CABECERA_PLIEGUE = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const TAM_BLOQUE = 6, TAM_FUSION = 4, MAX_FRASE = 140, MAX_RESUMEN_DEFECTO = 200;

function recortar(texto: string, maxChars: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length <= maxChars ? limpio : limpio.slice(0, Math.max(0, maxChars));
}
function primeraFrase(texto: string, maxChars = MAX_FRASE): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const fin = limpio.search(/[.!?…](?:\s|$)/), frase = fin >= 0 ? limpio.slice(0, fin + 1) : limpio;
  if (frase.length <= maxChars) return frase;
  const trozo = frase.slice(0, maxChars), espacio = trozo.lastIndexOf(" ");
  return `${(espacio > 0 ? trozo.slice(0, espacio) : trozo).trimEnd()}…`;
}

/** Resumen barato y sin modelo: una frase por turno, unidas con « | ». */
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`);
  return recortar(partes.join(" | "), maxChars);
}

function resumir(turnos: Turno[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): string {
  return recortar(resumidor ? resumidor(turnos, maxChars) : resumenExtractivo(turnos, maxChars), maxChars);
}

function prefijo(b: BloquePlegado): string { return `- (turnos ${b.desde}–${b.hasta}) `; }

function largoTexto(bloques: readonly BloquePlegado[]): number {
  if (!bloques.length) return 0;
  return bloques.reduce((total, b) => total + 1 + prefijo(b).length + b.resumen.length, CABECERA_PLIEGUE.length);
}

function componerTexto(bloques: readonly BloquePlegado[]): string {
  return bloques.length ? [CABECERA_PLIEGUE, ...bloques.map((b) => `${prefijo(b)}${b.resumen}`)].join("\n") : "";
}

function fusionar(grupo: readonly BloquePlegado[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): BloquePlegado {
  const nivel = Math.min(3, Math.max(...grupo.map((b) => b.nivel)) + 1) as 1 | 2 | 3;
  const desde = grupo[0].desde, hasta = grupo[grupo.length - 1].hasta;
  const texto = resumidor
    ? resumidor(grupo.map((b) => ({ rol: "assistant" as const, texto: b.resumen })), maxChars)
    : grupo.map((b) => b.resumen).join(" | ");
  return { id: `n${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen: recortar(texto, maxChars) };
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const recientesChars = Math.max(0, Math.floor(op.recientesChars ?? presupuesto * 0.6));
  const maxResumenChars = Math.max(1, Math.floor(op.maxResumenChars ?? MAX_RESUMEN_DEFECTO));
  let inicio = historial.length, usados = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    usados += largo;
    inicio = i;
  }
  const recientes = historial.slice(inicio);
  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < inicio; desde += TAM_BLOQUE) {
    const hasta = Math.min(desde + TAM_BLOQUE, inicio);
    bloques.push({ id: `n1-${desde}-${hasta}`, nivel: 1, desde, hasta,
      resumen: resumir(historial.slice(desde, hasta), maxResumenChars, op.resumidor) });
  }
  const objetivo = Math.max(0, presupuesto - usados);
  while (bloques.length >= TAM_FUSION && largoTexto(bloques) > objetivo) {
    bloques = [fusionar(bloques.slice(0, TAM_FUSION), maxResumenChars, op.resumidor), ...bloques.slice(TAM_FUSION)];
  }
  let descartadosChars = 0;
  while (bloques.length > 0 && largoTexto(bloques) > objetivo) {
    const sobra = largoTexto(bloques) - objetivo, primero = bloques[0];
    if (primero.resumen.length > 0) {
      const recorte = Math.min(sobra, primero.resumen.length);
      primero.resumen = primero.resumen.slice(0, primero.resumen.length - recorte);
      descartadosChars += recorte;
    } else bloques = bloques.slice(1);
  }
  return { recientes, bloques, texto: componerTexto(bloques), descartadosChars };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

function normalizar(texto: string): string { return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

function palabrasDe(consulta: string): string[] {
  const vistas = new Set<string>();
  for (const palabra of normalizar(consulta).split(/[^a-z0-9]+/)) if (palabra.length >= 4) vistas.add(palabra);
  return [...vistas];
}

export function buscarEnBloques(historial: Turno[], bloques: readonly BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = palabrasDe(consulta);
  if (!palabras.length) return [];
  return bloques
    .map((bloque, orden) => {
      const texto = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
      return { bloque, orden, puntaje: palabras.filter((palabra) => texto.includes(palabra)).length };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden)
    .slice(0, Math.max(0, Math.floor(k)))
    .map((x) => x.bloque);
}
