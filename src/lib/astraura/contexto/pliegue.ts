/**
 * Pliegue de historial por niveles para el contexto corto de Astraura 1.58.
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 */

export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue { presupuestoChars: number; recientesChars?: number; maxResumenChars?: number; resumidor?: (turnos: Turno[], maxChars: number) => string }
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }
const ENCABEZADO = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const MAX_FRASE = 140; const TURNOS_POR_BLOQUE = 6; const BLOQUES_POR_FUSION = 4;

function recortar(texto: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (texto.length <= maxChars) return texto;
  const corte = texto.slice(0, Math.max(0, maxChars - 1));
  const espacio = corte.lastIndexOf(" ");
  const base = (espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd();
  return `${base}…`.slice(0, maxChars);
}
function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const fin = limpio.search(/[.!?](\s|$)/);
  const frase = fin >= 0 ? limpio.slice(0, fin + 1) : limpio;
  return frase.length <= MAX_FRASE ? frase : recortar(frase, MAX_FRASE);
}
export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`);
  return recortar(partes.join(" | "), maxChars);
}
function render(bloques: BloquePlegado[]): string {
  if (!bloques.length) return "";
  return [ENCABEZADO, ...bloques.map((b) => `- (turnos ${b.desde}–${b.hasta - 1}) ${b.resumen}`)].join("\n");
}
function fusionar(
  historial: Turno[], bloques: BloquePlegado[],
  resumir: (turnos: Turno[], maxChars: number) => string, max: number,
): BloquePlegado[] {
  const siguientes: BloquePlegado[] = [];
  for (let i = 0; i < bloques.length; i += BLOQUES_POR_FUSION) {
    const grupo = bloques.slice(i, i + BLOQUES_POR_FUSION);
    if (grupo.length === 1) { siguientes.push(grupo[0]); continue; }
    const nivel = Math.min(3, Math.max(...grupo.map((b) => b.nivel)) + 1) as 1 | 2 | 3;
    const desde = grupo[0].desde;
    const hasta = grupo[grupo.length - 1].hasta;
    siguientes.push({ id: `b${nivel}:${desde}-${hasta}`, nivel, desde, hasta, resumen: resumir(historial.slice(desde, hasta), max) });
  }
  return siguientes;
}
export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, op.presupuestoChars);
  const recientesChars = Math.max(0, op.recientesChars ?? Math.floor(presupuesto * 0.6));
  const maxResumen = Math.max(1, op.maxResumenChars ?? Math.max(24, Math.floor(presupuesto / 10)));
  const resumir = (turnos: Turno[], max: number) =>
    recortar(op.resumidor ? op.resumidor(turnos, max) : resumenExtractivo(turnos, max), max);

  let inicioRecientes = historial.length;
  let usados = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    usados += largo;
    inicioRecientes = i;
  }
  const recientes = historial.slice(inicioRecientes);
  const antiguos = historial.slice(0, inicioRecientes);

  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < antiguos.length; desde += TURNOS_POR_BLOQUE) {
    const hasta = Math.min(desde + TURNOS_POR_BLOQUE, antiguos.length);
    bloques.push({ id: `b1:${desde}-${hasta}`, nivel: 1, desde, hasta, resumen: resumir(historial.slice(desde, hasta), maxResumen) });
  }

  const presupuestoResumen = Math.max(0, presupuesto - usados);
  while (bloques.length > 1 && render(bloques).length > presupuestoResumen) {
    const siguientes = fusionar(historial, bloques, resumir, maxResumen);
    if (siguientes.length >= bloques.length) break;
    bloques = siguientes;
  }

  let descartadosChars = 0;
  while (bloques.length) {
    const actual = render(bloques);
    if (actual.length <= presupuestoResumen) break;
    const primero = bloques[0];
    const exceso = actual.length - presupuestoResumen;
    if (primero.resumen.length > exceso) {
      const nuevo = primero.resumen.slice(0, primero.resumen.length - exceso).trimEnd();
      descartadosChars += primero.resumen.length - nuevo.length;
      bloques = [{ ...primero, resumen: nuevo }, ...bloques.slice(1)];
      break;
    }
    descartadosChars += primero.resumen.length;
    bloques = bloques.slice(1);
  }

  return { recientes, bloques, texto: render(bloques), descartadosChars };
}
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(Math.max(0, bloque.desde), Math.max(0, bloque.hasta));
}
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = [...new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4))];
  if (!palabras.length) return [];
  return bloques
    .map((bloque, indice) => {
      const texto = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
      return { bloque, indice, puntuacion: palabras.filter((p) => texto.includes(p)).length };
    })
    .filter((x) => x.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion || a.indice - b.indice)
    .slice(0, Math.max(0, k))
    .map((x) => x.bloque);
}
