/**
 * Pliegue de historial por niveles, reversible y con búsqueda.
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado.
 */

export interface Turno { rol: "user" | "assistant"; texto: string }
export interface BloquePlegado { id: string; nivel: 1 | 2 | 3; desde: number; hasta: number; resumen: string }
export interface OpcionesPliegue { presupuestoChars: number; recientesChars?: number; maxResumenChars?: number; resumidor?: (turnos: Turno[], maxChars: number) => string }
export interface ResultadoPliegue { recientes: Turno[]; bloques: BloquePlegado[]; texto: string; descartadosChars: number }
const ENCABEZADO = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";

function recortarEnPalabra(texto: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (texto.length <= maxChars) return texto;
  if (maxChars === 1) return "…";
  const corte = texto.slice(0, maxChars - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const piezas = turnos.map((t) => {
    const limpio = t.texto.trim().replace(/\s+/g, " ");
    const frase = limpio.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? limpio;
    return `${t.rol === "user" ? "U" : "A"}: ${recortarEnPalabra(frase, 140)}`;
  });
  return recortarEnPalabra(piezas.join(" | "), maxChars);
}

function textoDe(bloques: BloquePlegado[]): string {
  if (bloques.length === 0) return "";
  const lineas = bloques.map((b) => `- (turnos ${b.desde}–${b.hasta}) ${b.resumen}`);
  return `${ENCABEZADO}\n${lineas.join("\n")}`;
}
function fusionar(grupo: BloquePlegado[], nivel: 2 | 3, resumir: (t: Turno[], m: number) => string, maxChars: number): BloquePlegado {
  const resumenes: Turno[] = grupo.map((b) => ({ rol: "assistant", texto: b.resumen }));
  const desde = grupo[0].desde;
  const hasta = grupo[grupo.length - 1].hasta;
  return { id: `bloque-${nivel}-${desde}-${hasta}`, nivel, desde, hasta, resumen: resumir(resumenes, maxChars) };
}
function buscarGrupo(bloques: BloquePlegado[], nivel: 1 | 2, tamano: number): number {
  for (let i = 0; i + tamano <= bloques.length; i += 1) {
    if (bloques.slice(i, i + tamano).every((b) => b.nivel === nivel)) return i;
  }
  return -1;
}

function fundirNivel(bloques: BloquePlegado[], nivel: 1 | 2, presupuesto: number, resumir: (t: Turno[], m: number) => string, maxChars: number): BloquePlegado[] {
  let actuales = bloques;
  for (let intentos = 0; intentos <= bloques.length; intentos += 1) {
    if (textoDe(actuales).length <= presupuesto) break;
    const tamano = buscarGrupo(actuales, nivel, 4) >= 0 ? 4 : 2;
    const inicio = buscarGrupo(actuales, nivel, tamano);
    if (inicio < 0) break;
    const grupo = actuales.slice(inicio, inicio + tamano);
    const fusionado = fusionar(grupo, (nivel + 1) as 2 | 3, resumir, maxChars);
    actuales = [...actuales.slice(0, inicio), fusionado, ...actuales.slice(inicio + tamano)];
  }
  return actuales;
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuesto = op.presupuestoChars;
  const recientesChars = op.recientesChars ?? Math.floor(presupuesto * 0.6);
  const maxResumenChars = op.maxResumenChars ?? 200;
  const resumir = op.resumidor ?? resumenExtractivo;
  const recientes: Turno[] = [];
  let usados = 0;
  for (let i = historial.length - 1; i >= 0; i -= 1) {
    const largo = historial[i].texto.length;
    if (usados + largo > recientesChars) break;
    recientes.unshift(historial[i]);
    usados += largo;
  }
  const cortado = historial.length - recientes.length;
  let bloques: BloquePlegado[] = [];
  for (let desde = 0; desde < cortado; desde += 6) {
    const hasta = Math.min(desde + 6, cortado);
    const resumen = resumir(historial.slice(desde, hasta), maxResumenChars);
    bloques.push({ id: `bloque-1-${desde}-${hasta}`, nivel: 1, desde, hasta, resumen });
  }
  const disponible = Math.max(0, presupuesto - usados);
  bloques = fundirNivel(bloques, 1, disponible, resumir, maxResumenChars);
  bloques = fundirNivel(bloques, 2, disponible, resumir, maxResumenChars);
  let descartadosChars = 0;
  while (bloques.length > 0 && textoDe(bloques).length > presupuesto) {
    const exceso = textoDe(bloques).length - presupuesto;
    const [primero, ...resto] = bloques;
    if (primero.resumen.length <= exceso) {
      descartadosChars += primero.resumen.length;
      bloques = resto;
    } else {
      const nuevo = primero.resumen.slice(0, primero.resumen.length - exceso).trimEnd();
      descartadosChars += primero.resumen.length - nuevo.length;
      bloques = [{ ...primero, resumen: nuevo }, ...resto];
    }
  }
  return { recientes, bloques, texto: textoDe(bloques), descartadosChars };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta);
}

function palabrasNormalizadas(texto: string): string[] {
  const limpio = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return limpio.split(/[^a-z0-9]+/).filter((palabra) => palabra.length > 0);
}
export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k = 3): BloquePlegado[] {
  const unicas = Array.from(new Set(palabrasNormalizadas(consulta).filter((p) => p.length >= 4)));
  if (unicas.length === 0 || k <= 0) return [];
  const puntuadas = bloques.map((bloque, orden) => {
    const original = historial.slice(bloque.desde, bloque.hasta).map((t) => t.texto).join(" ");
    const palabras = palabrasNormalizadas(original);
    let puntuacion = 0;
    for (const clave of unicas) for (const palabra of palabras) if (palabra === clave) puntuacion += 1;
    return { bloque, orden, puntuacion };
  }).filter((e) => e.puntuacion > 0).sort((a, b) => b.puntuacion - a.puntuacion || a.orden - b.orden);
  return puntuadas.slice(0, k).map((e) => e.bloque);
}
