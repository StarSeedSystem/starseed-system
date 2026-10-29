/**
 * Pliegue de historial por niveles para el contexto corto del 1.58.
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 *
 * Nada se borra: el historial original sigue intacto; cada bloque guarda su
 * rango [desde, hasta) y se puede restaurar o buscar dentro. Los bloques se
 * cuentan desde el índice 0, así los ya hechos no cambian con turnos nuevos
 * (amigable con cachés de prefijo).
 */
export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue {
  presupuestoChars: number; recientesChars?: number; maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }
export const ENCABEZADO_PLIEGUE = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const TURNOS_POR_BLOQUE = 6;
const BLOQUES_POR_FUSION = 4;
const MAX_FRASE = 140;
const MAX_RESUMEN_POR_DEFECTO = 200;
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
/** Recorta a `maxChars` en palabra, dejando «…» dentro del límite. */
function recortar(texto: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (texto.length <= maxChars) return texto;
  const corte = texto.slice(0, maxChars);
  const ultimo = corte.lastIndexOf(" ");
  const base = ultimo > 0 ? corte.slice(0, ultimo) : corte;
  return base.length < maxChars ? `${base}…` : `${base.slice(0, maxChars - 1)}…`;
}
function primeraFrase(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  const encontrada = limpio.match(/^[^.!?\n]*[.!?]?/);
  return recortar((encontrada ? encontrada[0] : limpio).trim(), MAX_FRASE);
}
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`);
  return recortar(partes.join(" | "), maxChars);
}
function calcularCorte(historial: Turno[], recientesChars: number): number {
  let usados = 0, corte = historial.length;
  for (let i = historial.length - 1; i >= 0; i--) {
    if (usados + historial[i].texto.length > recientesChars) break;
    usados += historial[i].texto.length;
    corte = i;
  }
  return corte;
}
function prefijo(b: BloquePlegado): string { return `\n- (turnos ${b.desde}–${b.hasta - 1}) `; }
function longitudTexto(bloques: BloquePlegado[]): number {
  if (!bloques.length) return 0;
  return ENCABEZADO_PLIEGUE.length + bloques.reduce((n, b) => n + prefijo(b).length + b.resumen.length, 0);
}
export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const recientesChars = Math.max(0, Math.floor(op.recientesChars ?? presupuesto * 0.6));
  const maxResumen = Math.max(0, Math.floor(op.maxResumenChars ?? MAX_RESUMEN_POR_DEFECTO));
  const corte = calcularCorte(historial, recientesChars);
  const recientes = historial.slice(corte);
  const usadosRecientes = recientes.reduce((n, t) => n + t.texto.length, 0);
  const resumir = (desde: number, hasta: number): string => {
    const turnos = historial.slice(desde, hasta);
    const bruto = op.resumidor ? op.resumidor(turnos, maxResumen) : resumenExtractivo(turnos, maxResumen);
    return recortar(bruto, maxResumen);
  };
  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < corte; desde += TURNOS_POR_BLOQUE) {
    const hasta = Math.min(desde + TURNOS_POR_BLOQUE, corte);
    bloques.push({ id: `b1-${desde}`, nivel: 1, desde, hasta, resumen: resumir(desde, hasta) });
  }
  const suma = (lista: BloquePlegado[]) => lista.reduce((n, b) => n + b.resumen.length, 0);
  const margen = presupuesto - usadosRecientes;
  while (bloques.length > 1 && suma(bloques) > margen) {
    const grupo = bloques.slice(0, Math.min(BLOQUES_POR_FUSION, bloques.length));
    const desde = grupo[0].desde, hasta = grupo[grupo.length - 1].hasta;
    const nivel = Math.min(3, Math.max(...grupo.map((b) => b.nivel)) + 1) as 1 | 2 | 3;
    const bruto = op.resumidor
      ? op.resumidor(historial.slice(desde, hasta), maxResumen)
      : grupo.map((b) => b.resumen).join(" | ");
    const resumen = recortar(bruto, maxResumen);
    bloques = [{ id: `b${nivel}-${desde}`, nivel, desde, hasta, resumen }, ...bloques.slice(grupo.length)];
  }
  let descartadosChars = 0;
  while (bloques.length && longitudTexto(bloques) > presupuesto) {
    const viejo = bloques[0];
    if (!viejo.resumen.length) { descartadosChars += prefijo(viejo).length; bloques = bloques.slice(1); continue; }
    const antes = viejo.resumen.length;
    const sobra = longitudTexto(bloques) - presupuesto;
    viejo.resumen = viejo.resumen.slice(0, Math.max(0, antes - sobra)).trimEnd();
    descartadosChars += antes - viejo.resumen.length;
  }
  const texto = bloques.length
    ? [ENCABEZADO_PLIEGUE, ...bloques.map((b) => `${prefijo(b).slice(1)}${b.resumen}`.trimEnd())].join("\n")
    : "";
  return { recientes, bloques, texto, descartadosChars };
}
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = Array.from(new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4)));
  if (!palabras.length) return [];
  const puntuados = bloques
    .map((bloque, indice) => {
      const original = normalizar(historial.slice(bloque.desde, bloque.hasta).map((t) => t.texto).join(" "));
      const puntuacion = palabras.reduce((n, p) => n + (original.includes(p) ? 1 : 0), 0);
      return { bloque, indice, puntuacion };
    })
    .filter((e) => e.puntuacion > 0);
  puntuados.sort((a, b) => b.puntuacion - a.puntuacion || a.indice - b.indice);
  return puntuados.slice(0, Math.max(0, k)).map((e) => e.bloque);
}
