// Idea inspirada en billion-context (MIT + atribución); sin código copiado

export interface Turno {
  rol: "user" | "assistant";
  texto: string;
}

export interface BloquePlegado {
  id: string;
  nivel: 1 | 2 | 3;
  desde: number;
  hasta: number;
  resumen: string;
}

export interface OpcionesPliegue {
  presupuestoChars: number;
  recientesChars?: number;
  maxResumenChars?: number;
  resumidor?: (turnos: Turno[], maxChars: number) => string;
}

export interface ResultadoPliegue {
  recientes: Turno[];
  bloques: BloquePlegado[];
  texto: string;
  descartadosChars: number;
}

function cortarEnPalabra(s: string): string {
  if (s.length <= 140) return s;
  const corte = s.slice(0, 140);
  const idx = corte.lastIndexOf(" ");
  if (idx > 40) return corte.slice(0, idx) + "…";
  return corte + "…";
}

function primeraFrase(s: string): string {
  const limpio = s.replace(/\s+/g, " ").trim();
  const m = limpio.match(/^(.+?[.!?])(\s|$)/);
  if (m) return cortarEnPalabra(m[1]);
  return cortarEnPalabra(limpio);
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  const partes: string[] = [];
  for (const t of turnos) {
    const pref = t.rol === "user" ? "U:" : "A:";
    partes.push(pref + " " + primeraFrase(t.texto));
  }
  let res = partes.join(" | ");
  if (res.length <= maxChars) return res;
  if (maxChars <= 0) return "";
  res = res.slice(0, maxChars);
  const idx = res.lastIndexOf(" |");
  if (idx > 10) res = res.slice(0, idx);
  if (res.length > maxChars) res = res.slice(0, maxChars);
  return res;
}

function agruparEnBloques(turnos: Turno[], tam: number): Array<Turno[]> {
  const bloques: Array<Turno[]> = [];
  for (let i = 0; i < turnos.length; i += tam) {
    bloques.push(turnos.slice(i, i + tam));
  }
  return bloques;
}

function idBloque(desde: number, hasta: number, nivel: number): string {
  return `b${nivel}:${desde}-${hasta}`;
}

function construirTextoBloques(bloques: BloquePlegado[]): string {
  if (bloques.length === 0) return "";
  const encabezado = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]\n";
  const lineas = bloques.map((b) => `- (turnos ${b.desde}-${b.hasta - 1}) ${b.resumen}`);
  return encabezado + lineas.join("\n");
}

function fusionarBloques(
  historial: Turno[],
  bloques: BloquePlegado[],
  op: OpcionesPliegue,
  nivelDestino: 2 | 3
): BloquePlegado[] {
  const resumidor = op.resumidor ?? resumenExtractivo;
  const maxR = op.maxResumenChars ?? 280;
  const grupos: BloquePlegado[][] = [];
  for (let i = 0; i < bloques.length; i += 4) {
    grupos.push(bloques.slice(i, i + 4));
  }
  const resultado: BloquePlegado[] = [];
  for (const g of grupos) {
    if (g.length === 0) continue;
    const desde = g[0].desde;
    const hasta = g[g.length - 1].hasta;
    const turnosDelBloque: Turno[] = [];
    for (const b of g) {
      turnosDelBloque.push(...historial.slice(b.desde, b.hasta));
    }
    const textoResumenes = g.map((b) => b.resumen).join(" | ");
    let resumen = resumidor(turnosDelBloque, maxR);
    if (!resumen || resumen.length === 0) resumen = textoResumenes.slice(0, maxR);
    resultado.push({
      id: idBloque(desde, hasta, nivelDestino),
      nivel: nivelDestino,
      desde,
      hasta,
      resumen: resumen.slice(0, maxR),
    });
  }
  return resultado;
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const resumidor = op.resumidor ?? resumenExtractivo;
  const maxR = op.maxResumenChars ?? 280;
  const recientesChars = op.recientesChars ?? Math.floor(op.presupuestoChars * 0.6);
  
  // Tomar turnos recientes de atrás hacia delante
  const recientes: Turno[] = [];
  let acc = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    const t = historial[i];
    acc += t.texto.length + 4;
    if (acc > recientesChars && recientes.length > 0) break;
    recientes.unshift(t);
  }
  
  const idxInicioAntiguos = historial.length - recientes.length;
  const antiguos = historial.slice(0, idxInicioAntiguos);
  
  let descartadosChars = 0;
  if (antiguos.length === 0) {
    return {
      recientes,
      bloques: [],
      texto: "",
      descartadosChars: 0,
    };
  }
  
  // Agrupar en bloques de nivel 1 de 6 turnos contados desde el índice 0
  const gruposN1 = agruparEnBloques(antiguos, 6);
  let bloques: BloquePlegado[] = gruposN1.map((g, idx) => {
    const desde = idx * 6;
    const hasta = Math.min(desde + 6, antiguos.length);
    return {
      id: idBloque(desde, hasta, 1),
      nivel: 1 as const,
      desde,
      hasta,
      resumen: resumidor(g, maxR).slice(0, maxR),
    };
  });
  
  function tamanoTexto(bs: BloquePlegado[]): number {
    return construirTextoBloques(bs).length;
  }
  
  // Si superan presupuesto - recientes, fusionar
  while (tamanoTexto(bloques) > op.presupuestoChars - recientes.reduce((s, t) => s + t.texto.length + 4, 0) && bloques.length >= 4) {
    if (bloques[0].nivel === 1) {
      bloques = fusionarBloques(historial, bloques, op, 2);
    } else if (bloques[0].nivel === 2) {
      bloques = fusionarBloques(historial, bloques, op, 3);
    } else {
      break;
    }
  }
  
  // Si aún no cabe, recortar bloque más antiguo
  while (tamanoTexto(bloques) > op.presupuestoChars - recientes.reduce((s, t) => s + t.texto.length + 4, 0) && bloques.length > 0) {
    const masAntiguo = bloques[0];
    const diff = tamanoTexto(bloques) - (op.presupuestoChars - recientes.reduce((s, t) => s + t.texto.length + 4, 0));
    descartadosChars += Math.max(0, diff);
    bloques = bloques.slice(1);
    if (bloques.length === 0) break;
  }
  
  const texto = construirTextoBloques(bloques);
  return {
    recientes,
    bloques,
    texto,
    descartadosChars,
  };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  return historial.slice(bloque.desde, bloque.hasta).map((t) => ({ ...t }));
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buscarEnBloques(
  historial: Turno[],
  bloques: BloquePlegado[],
  consulta: string,
  k = 3
): BloquePlegado[] {
  const palabras = normalizar(consulta)
    .split(/\s+/)
    .filter((p) => p.length >= 4);
  if (palabras.length === 0) return [];
  
  const puntuados = bloques.map((bloque) => {
    let puntuacion = 0;
    const textoBloque = normalizar(historial.slice(bloque.desde, bloque.hasta).map((t) => t.texto).join(" "));
    for (const p of palabras) {
      if (textoBloque.includes(p)) puntuacion += 1;
    }
    return { bloque, puntuacion };
  });
  
  const filtrados = puntuados
    .filter((x) => x.puntuacion > 0)
    .sort((a, b) => {
      if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
      return a.bloque.desde - b.bloque.desde;
    })
    .slice(0, k)
    .map((x) => x.bloque);
  
  return filtrados;
}
