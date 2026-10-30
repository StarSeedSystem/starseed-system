/**
 * pliegue.ts — Pliegue de historial por niveles (Ola 1025R · CPZ1025H).
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 * Puro y determinista: sin red, sin disco, sin `node:*`. Los rangos se cuentan
 * desde el índice 0 para que los bloques viejos no cambien al llegar turnos.
 */
export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue {
  presupuestoChars: number;
  recientesChars?: number;
  maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }
const CABECERA = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const MAX_FRASE = 140;
const MAX_RESUMEN = 240;
const TURNO_POR_BLOQUE = 6;
const FUSION = 4;
function recortarPalabra(texto: string, max: number): string {
  if (max <= 0) return "";
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  const base = espacio > 0 ? corte.slice(0, espacio) : corte;
  return `${base}…`;
}
function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const fin = limpio.search(/[.!?…]/);
  return recortarPalabra(fin >= 0 ? limpio.slice(0, fin + 1) : limpio, MAX_FRASE);
}
function crear(nivel: 1 | 2 | 3, desde: number, hasta: number, resumen: string): BloquePlegado { return { id: `n${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen }; }
const suma = (bloques: BloquePlegado[]): number => bloques.reduce((total, b) => total + b.resumen.length, 0);
function resumir(turnos: Turno[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): string { return resumidor ? resumidor(turnos, maxChars) : resumenExtractivo(turnos, maxChars); }
/** Resumen barato, sin modelo: primera frase de cada turno, unida con « | ». */
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  if (maxChars <= 0) return "";
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`);
  const unido = partes.join(" | ");
  return unido.length <= maxChars ? unido : unido.slice(0, maxChars);
}
function fusionar(bloques: BloquePlegado[], nivel: 2 | 3, maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): boolean {
  const indices: number[] = [];
  for (let i = 0; i < bloques.length && indices.length < FUSION; i++) {
    if (bloques[i].nivel === nivel - 1) indices.push(i);
  }
  if (indices.length < FUSION) return false;
  const grupo = indices.map((i) => bloques[i]);
  const sinteticos = grupo.map((b): Turno => ({ rol: "assistant", texto: b.resumen }));
  const resumen = resumir(sinteticos, Math.min(maxChars, suma(grupo)), resumidor);
  bloques.splice(indices[0], FUSION, crear(nivel, grupo[0].desde, grupo[grupo.length - 1].hasta, resumen));
  return true;
}
/** Pliega lo viejo en bloques por niveles y deja los turnos recientes íntegros. */
export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, op.presupuestoChars);
  const recientesChars = Math.max(0, op.recientesChars ?? Math.floor(presupuesto * 0.6));
  const maxResumen = Math.max(0, op.maxResumenChars ?? MAX_RESUMEN);
  let k = 0;
  let usados = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    usados += largo;
    k++;
  }
  // Ancla el corte a un múltiplo de 6: los bloques viejos nunca se rehacen.
  const resto = ((k - (historial.length % TURNO_POR_BLOQUE)) % TURNO_POR_BLOQUE + TURNO_POR_BLOQUE) % TURNO_POR_BLOQUE;
  k -= Math.min(k, resto);
  const recientes = historial.slice(historial.length - k);
  usados = recientes.reduce((total, t) => total + t.texto.length, 0);
  const corte = historial.length - recientes.length;
  const bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < corte; desde += TURNO_POR_BLOQUE) {
    const hasta = Math.min(desde + TURNO_POR_BLOQUE, corte);
    bloques.push(crear(1, desde, hasta, resumir(historial.slice(desde, hasta), maxResumen, op.resumidor)));
  }
  // Reserva el encabezado y el prefijo de cada línea para que `texto` quepa.
  const overhead = CABECERA.length + 32 * Math.ceil(corte / TURNO_POR_BLOQUE);
  const espacio = Math.max(0, presupuesto - usados - overhead);
  for (const nivel of [2, 3] as const) {
    while (suma(bloques) > espacio && fusionar(bloques, nivel, maxResumen, op.resumidor)) {
      // Fusiona los cuatro bloques más antiguos del nivel anterior.
    }
  }
  let descartadosChars = 0;
  let total = suma(bloques);
  while (total > espacio && bloques.length) {
    const viejo = bloques[0];
    const quitados = Math.min(total - espacio, viejo.resumen.length);
    if (quitados <= 0) break;
    viejo.resumen = viejo.resumen.slice(0, viejo.resumen.length - quitados);
    descartadosChars += quitados;
    total -= quitados;
  }
  const lineas = bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`);
  const texto = bloques.length ? [CABECERA, ...lineas].join("\n") : "";
  return { recientes, bloques, texto, descartadosChars };
}
/** Devuelve el trozo original de historial que cubre un bloque. */
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] { return historial.slice(bloque.desde, bloque.hasta); }
function normalizar(texto: string): string { return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
/** Busca dentro de lo plegado por coincidencia léxica, sin red ni modelo. */
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = Array.from(new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4)));
  if (!palabras.length) return [];
  return bloques
    .map((bloque, orden) => {
      const texto = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
      const puntos = palabras.reduce((n, p) => n + (texto.includes(p) ? 1 : 0), 0);
      return { bloque, puntos, orden };
    })
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .slice(0, Math.max(0, k))
    .map((p) => p.bloque);
}
