/**
 * Idea inspirada en billion-context (MIT + atribución); sin código copiado
 */

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

function quitarAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const idx = limpio.search(/[.!?]\s|[.!?]$/);
  if (idx >= 0) {
    return limpio.slice(0, idx + 1).trim();
  }
  return limpio;
}

export function resumenExtractivo(turnos: Turno[], maxChars: number): string {
  if (!turnos.length || maxChars <= 0) return "";
  const partes: string[] = [];
  for (const turno of turnos) {
    const prefijo = turno.rol === "user" ? "U:" : "A:";
    let frase = primeraFrase(turno.texto);
    if (frase.length > 140) {
      // cortar en palabra
      let corte = frase.slice(0, 140);
      const ultimoEspacio = corte.lastIndexOf(" ");
      if (ultimoEspacio > 0) {
        corte = corte.slice(0, ultimoEspacio);
      }
      frase = corte.trim() + "…";
    }
    partes.push(`${prefijo} ${frase}`);
  }
  let resultado = partes.join(" | ");
  if (resultado.length <= maxChars) return resultado;
  // recortar con … si es necesario
  if (maxChars <= 0) return "";
  let recortado = resultado.slice(0, maxChars);
  const ultimoEspacio = recortado.lastIndexOf(" ");
  if (ultimoEspacio > 0 && ultimoEspacio > maxChars - 20) {
    recortado = recortado.slice(0, ultimoEspacio);
  }
  return recortado.trim() + "…";
}

function generarId(nivel: number, desde: number, hasta: number): string {
  return `b${nivel}-${desde}-${hasta}`;
}

function agruparEnBloques(turnos: Turno[], tamanoBloque: number): Array<{ desde: number; hasta: number; turnos: Turno[] }> {
  const bloques: Array<{ desde: number; hasta: number; turnos: Turno[] }> = [];
  if (turnos.length === 0) return bloques;
  for (let i = 0; i < turnos.length; i += tamanoBloque) {
    const desde = i;
    const hasta = Math.min(i + tamanoBloque, turnos.length);
    bloques.push({
      desde,
      hasta,
      turnos: turnos.slice(desde, hasta),
    });
  }
  return bloques;
}

function fusionarBloques(
  bloques: BloquePlegado[],
  turnosOriginales: Turno[],
  nivelObjetivo: 2 | 3,
  presupuestoMax: number,
  resumidor?: (turnos: Turno[], maxChars: number) => string
): BloquePlegado[] {
  if (bloques.length === 0) return bloques;
  const resultado: BloquePlegado[] = [];
  for (let i = 0; i < bloques.length; i += 4) {
    if (i + 4 > bloques.length) {
      // si no llega a fusionar 4, mantener tal cual
      for (let j = i; j < bloques.length; j++) {
        resultado.push(bloques[j]);
      }
      break;
    }
    const grupo = bloques.slice(i, i + 4);
    const desde = grupo[0].desde;
    const hasta = grupo[grupo.length - 1].hasta;
    // crear turnos virtuales desde los resúmenes para pasar al resumidor
    const turnosVirtuales: Turno[] = grupo.map((b) => ({ rol: "assistant", texto: b.resumen }));
    let resumen: string;
    if (resumidor) {
      resumen = resumidor(turnosVirtuales, presupuestoMax);
    } else {
      resumen = resumenExtractivo(turnosVirtuales, presupuestoMax);
    }
    resultado.push({
      id: generarId(nivelObjetivo, desde, hasta),
      nivel: nivelObjetivo,
      desde,
      hasta,
      resumen,
    });
  }
  return resultado;
}

export function plegarHistorial(historial: Turno[], op: OpcionesPliegue): ResultadoPliegue {
  const presupuestoChars = op.presupuestoChars;
  const recientesChars = op.recientesChars !== undefined ? op.recientesChars : Math.floor(presupuestoChars * 0.6);
  const maxResumenChars = op.maxResumenChars !== undefined ? op.maxResumenChars : 200;
  const resumidor = op.resumidor;

  if (historial.length === 0) {
    return {
      recientes: [],
      bloques: [],
      texto: "",
      descartadosChars: 0,
    };
  }

  // Tomar turnos recientes de atrás hacia delante hasta recientesChars
  const recientes: Turno[] = [];
  let charsRecientes = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    const turno = historial[i];
    const tamanoTurno = turno.texto.length + 4; // aproximado
    if (charsRecientes + tamanoTurno > recientesChars && recientes.length > 0) {
      break;
    }
    recientes.unshift(turno);
    charsRecientes += tamanoTurno;
  }

  // Los anteriores se agrupan en bloques de nivel 1 de 6 turnos contados desde el índice 0
  const indiceInicioAnteriores = 0;
  const turnosAnteriores = historial.slice(indiceInicioAnteriores, historial.length - recientes.length);
  let bloques: BloquePlegado[] = [];

  if (turnosAnteriores.length > 0) {
    const gruposNivel1 = agruparEnBloques(turnosAnteriores, 6);
    for (const grupo of gruposNivel1) {
      let resumen: string;
      if (resumidor) {
        resumen = resumidor(grupo.turnos, maxResumenChars);
      } else {
        resumen = resumenExtractivo(grupo.turnos, maxResumenChars);
      }
      bloques.push({
        id: generarId(1, grupo.desde + indiceInicioAnteriores, grupo.hasta + indiceInicioAnteriores),
        nivel: 1,
        desde: grupo.desde + indiceInicioAnteriores,
        hasta: grupo.hasta + indiceInicioAnteriores,
        resumen,
      });
    }
  }

  let descartadosChars = 0;
  // Si los resúmenes superan presupuestoChars - recientes, fusionar
  const calcularTamanoResumidos = () => {
    let total = 0;
    for (const b of bloques) {
      total += b.resumen.length + 20;
    }
    return total;
  };

  // Fusionar hasta que quepa
  while (calcularTamanoResumidos() > presupuestoChars - charsRecientes && bloques.length > 1) {
    // fusionar de 4 en 4 los más antiguos (nivel 2)
    if (bloques.length >= 4) {
      // determinar nivel objetivo
      const nivelActual = bloques[0].nivel;
      const nivelObjetivo = nivelActual === 1 ? 2 : 3;
      bloques = fusionarBloques(bloques, historial, nivelObjetivo, maxResumenChars, resumidor);
      if (nivelObjetivo === 3) break; // ya no fusionamos más
    } else {
      break;
    }
  }

  // Si aun así no cabe, recortar el bloque más antiguo y sumar diferencia a descartadosChars
  while (calcularTamanoResumidos() > presupuestoChars - charsRecientes && bloques.length > 0) {
    const bloqueMasAntiguo = bloques[0];
    const exceso = calcularTamanoResumidos() - (presupuestoChars - charsRecientes);
    if (exceso <= 0) break;
    descartadosChars += exceso;
    // recortar resumen
    const nuevoTamano = Math.max(0, bloqueMasAntiguo.resumen.length - exceso);
    if (nuevoTamano === 0) {
      bloques.shift();
    } else {
      bloqueMasAntiguo.resumen = bloqueMasAntiguo.resumen.slice(0, nuevoTamano).trim() + "…";
    }
  }

  // Construir texto
  let texto = "";
  if (bloques.length > 0) {
    texto = "[RESUMEN DE LO ANTERIOR · solo recordatorio, no lo repitas]";
    for (const bloque of bloques) {
      texto += `\n- (turnos ${bloque.desde}–${bloque.hasta}) ${bloque.resumen}`;
    }
  }

  return {
    recientes,
    bloques,
    texto,
    descartadosChars,
  };
}

export function restaurarBloque(historial: Turno[], bloque: BloquePlegado): Turno[] {
  const resultado: Turno[] = [];
  for (let i = bloque.desde; i < bloque.hasta && i < historial.length; i++) {
    resultado.push(historial[i]);
  }
  return resultado;
}

export function buscarEnBloques(historial: Turno[], bloques: BloquePlegado[], consulta: string, k: number = 3): BloquePlegado[] {
  const consultaLimpia = quitarAcentos(consulta.toLowerCase());
  const palabrasConsulta = consultaLimpia
    .split(/\s+/)
    .filter((p) => p.length >= 4);

  if (palabrasConsulta.length === 0) return [];

  const puntuados: Array<{ bloque: BloquePlegado; puntuacion: number }> = [];

  for (const bloque of bloques) {
    // obtener texto original del bloque
    const turnosBloque = restaurarBloque(historial, bloque);
    let textoOriginal = "";
    for (const turno of turnosBloque) {
      textoOriginal += turno.texto + " ";
    }
    const textoLimpio = quitarAcentos(textoOriginal.toLowerCase());

    let puntuacion = 0;
    for (const palabra of palabrasConsulta) {
      if (textoLimpio.includes(palabra)) {
        puntuacion++;
      }
    }
    if (puntuacion > 0) {
      puntuados.push({ bloque, puntuacion });
    }
  }

  // ordenar estable por puntuación desc
  puntuados.sort((a, b) => {
    if (b.puntuacion !== a.puntuacion) {
      return b.puntuacion - a.puntuacion;
    }
    // orden estable - mantener orden original por índice
    const idxA = bloques.indexOf(a.bloque);
    const idxB = bloques.indexOf(b.bloque);
    return idxA - idxB;
  });

  const resultado: BloquePlegado[] = [];
  for (let i = 0; i < puntuados.length && resultado.length < k; i++) {
    resultado.push(puntuados[i].bloque);
  }
  return resultado;
}
