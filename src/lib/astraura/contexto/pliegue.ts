/* Idea inspirada en billion-context (MIT + atribución); sin código copiado. */

export interface Turno { rol: "user" | "assistant"; texto: string }

export interface BloquePlegado {
  id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string;
}

export interface OpcionesPliegue {
  presupuestoChars: number; recientesChars?: number; maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}

export interface ResultadoPliegue {
  recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number;
}

const ENCABEZADO = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const MAX_FRASE = 140;
const TAM_BLOQUE = 6;
const TAM_FUSION = 4;

function recortar(texto: string, max: number): string {
  if (max <= 0) return "";
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1), espacio = corte.lastIndexOf(" ");
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio ? recortar((limpio.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? limpio).trim(), MAX_FRASE) : "";
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`);
  return recortar(partes.join(" | "), maxChars);
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function palabrasDe(texto: string): string[] {
  return normalizar(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
}

function resumir(turnos: Turno[], max: number, resumidor?: OpcionesPliegue["resumidor"]): string {
  return resumidor ? resumidor(turnos, max) : resumenExtractivo(turnos, max);
}

function lineas(bloques: BloquePlegado[]): string {
  if (!bloques.length) return "";
  return [ENCABEZADO, ...bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`)].join("\n");
}

function fusionar(grupo: BloquePlegado[], max: number, resumidor?: OpcionesPliegue["resumidor"]): BloquePlegado {
  const nivel = Math.min(3, Math.max(...grupo.map((b) => b.nivel)) + 1) as 1 | 2 | 3;
  const desde = grupo[0].desde, hasta = grupo[grupo.length - 1].hasta;
  const pseudo = grupo.map((b) => ({ rol: "assistant" as const, texto: b.resumen }));
  return { id: `b${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen: resumir(pseudo, max, resumidor) };
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const recientesChars = Math.max(0, Math.floor(op.recientesChars ?? presupuesto * 0.6));
  const maxResumen = Math.max(1, Math.floor(op.maxResumenChars ?? 240));
  let corte = recientesChars > 0 ? historial.length : 0, usados = 0;
  for (let i = historial.length - 1; i >= 0 && recientesChars > 0; i--) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    usados += largo;
    corte = i;
  }
  const recientes = historial.slice(corte);
  let bloques: BloquePlegado[] = [];
  for (let i = 0; i < corte; i += TAM_BLOQUE) {
    const trozo = historial.slice(i, Math.min(i + TAM_BLOQUE, corte));
    const resumen = resumir(trozo, maxResumen, op.resumidor);
    bloques.push({ id: `b1-${i}-${i + trozo.length}`, nivel: 1, desde: i, hasta: i + trozo.length, resumen });
  }
  const area = Math.max(0, presupuesto - usados);
  while (lineas(bloques).length > area && bloques.length >= 2) {
    const grupo = bloques.slice(0, Math.min(TAM_FUSION, bloques.length));
    bloques = [fusionar(grupo, maxResumen, op.resumidor), ...bloques.slice(grupo.length)];
  }
  let descartadosChars = 0;
  while (lineas(bloques).length > area && bloques.length) {
    const [primero, ...resto] = bloques;
    descartadosChars += lineas([primero]).length;
    bloques = resto;
  }
  return { recientes, bloques, texto: lineas(bloques), descartadosChars };
}

/** Devuelve el trozo original que cubre el bloque, sin copiarlo ni alterarlo. */
export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

// Puntuación léxica sobre el texto ORIGINAL del bloque (palabras de ≥ 4 letras).
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const buscadas = [...new Set(palabrasDe(consulta))];
  if (!buscadas.length || k <= 0) return [];
  const puntuadas = bloques.map((bloque, indice) => {
    const original = restaurarBloque(historial, bloque).map((t) => t.texto).join(" ");
    const presentes = new Set(normalizar(original).split(/[^a-z0-9]+/));
    const puntos = buscadas.filter((p) => presentes.has(p)).length;
    return { bloque, puntos, indice };
  });
  return puntuadas
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.indice - b.indice)
    .slice(0, Math.floor(k))
    .map((p) => p.bloque);
}
