// Idea inspirada en billion-context (MIT + atribución); sin código copiado.

export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue { presupuestoChars: number; recientesChars?: number; maxResumenChars?: number; resumidor?: (turnos: Turno[], maxChars: number) => string }
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }

const CABECERA = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
const TAM_BLOQUE = 6;
const TAM_FUSION = 4;

function primeraFrase(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  const fin = limpio.search(/[.!?](\s|$)/);
  let frase = fin >= 0 ? limpio.slice(0, fin + 1).trim() : limpio;
  if (frase.length <= 140) return frase;
  frase = frase.slice(0, 139);
  const espacio = frase.lastIndexOf(" ");
  if (espacio > 0) frase = frase.slice(0, espacio);
  return `${frase.trimEnd()}…`;
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const unido = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${primeraFrase(t.texto)}`).join(" | ");
  if (unido.length <= maxChars) return unido;
  if (maxChars <= 1) return unido.slice(0, Math.max(0, maxChars));
  return `${unido.slice(0, maxChars - 1).trimEnd()}…`;
}

const sumaResumenes = (bloques: BloquePlegado[]): number => bloques.reduce((total, bloque) => total + bloque.resumen.length, 0);

const resumir = (turnos: Turno[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): string =>
  resumidor ? resumidor(turnos, maxChars) : resumenExtractivo(turnos, maxChars);

function recortarHasta(bloques: BloquePlegado[], objetivo: number): number {
  let quitados = 0;
  for (const bloque of bloques) {
    if (sumaResumenes(bloques) <= objetivo) break;
    const quitar = Math.min(bloque.resumen.length, sumaResumenes(bloques) - objetivo);
    const recortado = bloque.resumen.slice(0, bloque.resumen.length - quitar).trimEnd();
    quitados += bloque.resumen.length - recortado.length;
    bloque.resumen = recortado;
  }
  return quitados;
}

function fusionar(bloques: BloquePlegado[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): BloquePlegado[] {
  const grupo = bloques.slice(0, TAM_FUSION);
  const ultimo = grupo[grupo.length - 1];
  const nivel = Math.min(3, Math.max(...grupo.map((b) => b.nivel)) + 1) as BloquePlegado["nivel"];
  const pseudo = grupo.map((b) => ({ rol: "assistant" as const, texto: b.resumen }));
  const resumen = resumir(pseudo, maxChars, resumidor);
  return [{ id: `n${nivel}-${grupo[0].desde}-${ultimo.hasta}`, nivel, desde: grupo[0].desde, hasta: ultimo.hasta, resumen }, ...bloques.slice(grupo.length)];
}

const renderizar = (bloques: BloquePlegado[]): string =>
  bloques.length ? [CABECERA, ...bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`)].join("\n") : "";

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const n = historial.length;
  const presupuesto = Math.max(0, op.presupuestoChars);
  const recientesChars = Math.max(0, op.recientesChars ?? Math.floor(presupuesto * 0.6));
  const maxResumen = Math.max(1, op.maxResumenChars ?? 160);
  if (historial.reduce((suma, turno) => suma + turno.texto.length, 0) <= presupuesto) {
    return { recientes: historial.slice(), bloques: [], texto: "", descartadosChars: 0 };
  }
  let usado = 0;
  let corte = n;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (usado + historial[i].texto.length > recientesChars) break;
    usado += historial[i].texto.length;
    corte = i;
  }
  // El corte sube al siguiente múltiplo de 6: los bloques ya formados no cambian
  // con turnos nuevos y los recientes siguen dentro del presupuesto.
  const inicioReciente = Math.min(n, Math.ceil(corte / TAM_BLOQUE) * TAM_BLOQUE);
  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < inicioReciente; desde += TAM_BLOQUE) {
    const hasta = Math.min(desde + TAM_BLOQUE, inicioReciente);
    const resumen = resumir(historial.slice(desde, hasta), maxResumen, op.resumidor);
    bloques.push({ id: `n1-${desde}-${hasta}`, nivel: 1, desde, hasta, resumen });
  }
  const disponible = Math.max(0, presupuesto - recientesChars);
  while (bloques.length > 1 && sumaResumenes(bloques) > disponible) {
    bloques = fusionar(bloques, maxResumen, op.resumidor);
  }
  let descartadosChars = recortarHasta(bloques, disponible);
  let texto = renderizar(bloques);
  while (texto.length > presupuesto && sumaResumenes(bloques) > 0) {
    const exceso = texto.length - presupuesto;
    descartadosChars += recortarHasta(bloques, Math.max(0, sumaResumenes(bloques) - exceso));
    texto = renderizar(bloques);
  }
  if (texto.length > presupuesto) texto = "";
  return { recientes: historial.slice(inicioReciente), bloques, texto, descartadosChars };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

const normalizar = (texto: string): string => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (texto: string, minimo: number): Set<string> => new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= minimo));

export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const buscadas = [...palabras(consulta, 4)];
  if (!buscadas.length) return [];
  return bloques
    .map((bloque, indice) => {
      const original = palabras(historial.slice(bloque.desde, bloque.hasta).map((t) => t.texto).join(" "), 1);
      const puntuacion = buscadas.filter((palabra) => original.has(palabra)).length;
      return { bloque, indice, puntuacion };
    })
    .filter((item) => item.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion || a.indice - b.indice)
    .slice(0, Math.max(0, k))
    .map((item) => item.bloque);
}
