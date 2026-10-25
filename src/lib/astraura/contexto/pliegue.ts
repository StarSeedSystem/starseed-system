/**
 * Pliegue de historial por niveles — módulo PURO.
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
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
const TAM_BLOQUE = 6;
const TAM_FUSION = 4;
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function recortarPalabra(texto: string, maxChars: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (maxChars <= 0) return "";
  if (limpio.length <= maxChars) return limpio;
  if (maxChars === 1) return "…";
  const corte = limpio.slice(0, maxChars - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const fin = limpio.search(/[.!?…](?=\s|$)/);
  return fin >= 0 ? limpio.slice(0, fin + 1) : limpio;
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  if (maxChars <= 0 || turnos.length === 0) return "";
  const partes = turnos.map((t) => `${t.rol === "user" ? "U" : "A"}: ${recortarPalabra(primeraFrase(t.texto), 140)}`);
  return recortarPalabra(partes.join(" | "), maxChars);
}

function resumir(turnos: Turno[], maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): string {
  return resumidor ? recortarPalabra(resumidor(turnos, maxChars), maxChars) : resumenExtractivo(turnos, maxChars);
}

function render(bloques: BloquePlegado[]): string {
  if (bloques.length === 0) return "";
  return [CABECERA, ...bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`)].join("\n");
}

function fusionar(bloques: BloquePlegado[], nivel: 2 | 3, maxChars: number, resumidor?: OpcionesPliegue["resumidor"]): BloquePlegado[] {
  const grupo = bloques.slice(0, TAM_FUSION);
  const desde = grupo[0].desde;
  const hasta = grupo[grupo.length - 1].hasta;
  const sinteticos: Turno[] = grupo.map((b) => ({ rol: "assistant", texto: b.resumen }));
  const resumen = resumir(sinteticos, maxChars, resumidor);
  return [{ id: `b${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen }, ...bloques.slice(TAM_FUSION)];
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = Math.max(0, Math.floor(op.presupuestoChars));
  const recientesChars = Math.max(0, Math.floor(op.recientesChars ?? presupuesto * 0.6));
  const maxResumen = Math.max(8, Math.floor(op.maxResumenChars ?? 160));
  const recientes: Turno[] = [];
  let usados = 0;
  for (let i = historial.length - 1; i >= 0; i -= 1) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    recientes.unshift(historial[i]);
    usados += largo;
  }
  const anteriores = historial.slice(0, historial.length - recientes.length);
  let bloques: BloquePlegado[] = [];
  for (let i = 0; i < anteriores.length; i += TAM_BLOQUE) {
    const hasta = Math.min(i + TAM_BLOQUE, anteriores.length);
    const resumen = resumir(anteriores.slice(i, hasta), maxResumen, op.resumidor);
    bloques.push({ id: `b1-${i}-${hasta}`, nivel: 1, desde: i, hasta, resumen });
  }
  let descartadosChars = 0;
  let texto = render(bloques);
  while (texto.length > presupuesto && bloques.length > 0) {
    const nivelMenor = Math.min(...bloques.map((b) => b.nivel));
    if (bloques.filter((b) => b.nivel === nivelMenor).length >= TAM_FUSION) {
      bloques = fusionar(bloques, Math.min(3, nivelMenor + 1) as 2 | 3, maxResumen, op.resumidor);
    } else {
      const viejo = bloques[0].resumen;
      const nuevo = recortarPalabra(viejo, viejo.length - (texto.length - presupuesto));
      if (nuevo === viejo) break;
      descartadosChars += viejo.length - nuevo.length;
      bloques = [{ ...bloques[0], resumen: nuevo }, ...bloques.slice(1)];
    }
    texto = render(bloques);
  }
  return { recientes, bloques, texto: bloques.length > 0 ? texto : "", descartadosChars };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const palabras = [...new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4))];
  if (palabras.length === 0 || k <= 0) return [];
  return bloques
    .map((bloque, indice) => {
      const original = normalizar(restaurarBloque(historial, bloque).map((t) => t.texto).join(" "));
      const puntos = palabras.reduce((total, p) => total + (original.includes(p) ? 1 : 0), 0);
      return { bloque, indice, puntos };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.indice - b.indice)
    .slice(0, k)
    .map((x) => x.bloque);
}
