// src/lib/mando/salud-proceso.ts
// Salud de tareas y agentes del Mando: un número 1-10 y una frase.
// Módulo PURO: sin fechas del sistema (el "ahora" entra por parámetro),
// sin disco, sin red, sin procesos lanzados.
export type Señal = "bien" | "vigilar" | "mal";
export interface Salud { puntos: number; motivo: string; señal: Señal; }
export interface EntradaSalud {
  estado?: string; etapa?: string; segundosEnEtapa?: number;
  bytesEscritos?: number; registroCrece?: boolean; intentosModelo?: number;
  reparacionAutomatica?: boolean; revisionBloqueante?: boolean;
}

export function saludDeTarea(t: EntradaSalud, ahoraMs: number): Salud {
  // El "ahora" entra como parámetro: el módulo nunca lee Date.now().
  // Eso hace que la misma entrada con el mismo ahora devuelva el mismo
  // resultado, comprobable sin reloj.
  const estado = (t.estado || "").trim().toLowerCase();
  const etapa = (t.etapa || "").trim().toLowerCase();
  const segundos = Math.max(0, t.segundosEnEtapa ?? 0);
  const bytes = Math.max(0, t.bytesEscritos ?? 0);
  const registroCrece = !!t.registroCrece;
  const intentos = Math.max(0, t.intentosModelo ?? 0);
  const reparo = !!t.reparacionAutomatica;
  const bloqueante = !!t.revisionBloqueante;

  // Bottom: "sin cambios" o "rechazada" = la tarea no produjo nada útil.
  // La salud cae al mínimo porque no hay avance que valorar.
  if (estado === "sin cambios" || estado === "rechazada") {
    return { puntos: 1, motivo: "tarea rechazada o sin cambios", señal: "mal" };
  }

  // Reparación automática: el trabajo falló una vez y se corrigió solo.
  // Resta puntos porque el modelo no acertó a la primera, pero mantiene
  // un mínimo (3) porque la reparación es un avance, no fracaso total.
  if (reparo) {
    const base = Math.max(3, 6 - intentos);
    return { puntos: base, motivo: "reparó las pruebas al segundo intento", señal: base <= 5 ? "vigilar" : "bien" };
  }

  // Revisión bloqueante: pasó la escritura pero requiere intervención
  // humana. No es tan malo como un rechazo, pero tampoco está sano.
  if (bloqueante) return { puntos: 4, motivo: "revisión bloqueante: hay que rehacerla", señal: "mal" };

  // Silencio: sin bytes y sin registro creciendo indica que el agente
  // no avanza (colgado o atascado). El peso baja 1 punto cada 120 s:
  // cuanto más silencio, más baja la salud.
  const silencio = bytes === 0 && !registroCrece;
  if (silencio) {
    const puntosSilencio = Math.max(2, 8 - Math.floor(segundos / 120));
    return { puntos: puntosSilencio, motivo: `lleva ${Math.round(segundos / 60)} min sin escribir un byte`, señal: puntosSilencio <= 4 ? "mal" : "vigilar" };
  }

  // Intentos de modelo gastados: cada intento consumido baja la salud
  // porque indica que el modelo no pudo resolverlo solo.
  if (intentos > 0) {
    const puntosIntentos = Math.max(3, 9 - intentos);
    return { puntos: puntosIntentos, motivo: intentos === 1 ? "un intento de modelo gastado" : `${intentos} modelos gastados`, señal: puntosIntentos <= 5 ? "vigilar" : "bien" };
  }

  // Producción activa: bytes o registro creciendo, sin señales negativas.
  // Es el caso óptimo: el agente está escribiendo y generando contenido.
  if (bytes > 0 || registroCrece) return { puntos: 10, motivo: "escribiendo y produciendo", señal: "bien" };

  // Neutro: etapa conocida pero sin señales claras. Salud media con vigilancia.
  return { puntos: 5, motivo: `etapa «${etapa || "desconocida"}» sin señales claras`, señal: "vigilar" };
}

export function saludDeAgente(tareas: EntradaSalud[], ahoraMs: number): Salud {
  // Un agente es tan sano como su tarea más enferma: si una está atascada
  // o rechazada, todo el agente debe vigilarse. Esto evita que una tarea
  // bloqueante se oculte detrás de otras sanas.
  if (tareas.length === 0) return { puntos: 5, motivo: "sin tareas asignadas", señal: "vigilar" };
  let peor: Salud | null = null;
  for (const t of tareas) {
    const s = saludDeTarea(t, ahoraMs);
    if (peor === null || s.puntos < peor.puntos) peor = s;
  }
  const puntos = peor ? peor.puntos : 5;
  const motivoBase = peor ? peor.motivo : "sin tareas asignadas";
  // Si hay mezcla de sanas (≥8) y mudas (≤4), reflejar que hay algo que vigilar.
  const sanas = tareas.filter((t) => saludDeTarea(t, ahoraMs).puntos >= 8).length;
  const mudas = tareas.filter((t) => saludDeTarea(t, ahoraMs).puntos <= 4).length;
  if (sanas > 0 && mudas > 0) return { puntos, motivo: `una sana y una muda: ${motivoBase}`, señal: puntos <= 5 ? "mal" : "vigilar" };
  return { puntos, motivo: motivoBase, señal: peor ? peor.señal : "vigilar" };
}
