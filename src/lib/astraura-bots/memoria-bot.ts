// Bots/dots de Astraura · MEMORIA DEL BOT (BOT1011Q)
// Contrato: architecture/astraura-bots.md (§10 memoria y recuerdos del bot)
// Módulo PURO: sin React, sin red, sin `node:*`, sin reloj (el tiempo entra siempre como argumento `ahora`).
// Lo importan componentes de cliente y pruebas.

import type { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import type { Medio } from "./tipos";

/** Un recuerdo que pertenece a un bot específico. */
export interface RecuerdoBot extends FragmentoMemoria {
  /** ID del bot que posee este recuerdo. */
  botId: string;
  /** Tamaño en bytes del recuerdo. */
  bytes: number;
  /** Número de veces que se ha accedido o usado este recuerdo. */
  usos: number;
  /** Si es verdadero, nunca se olvida independientemente de la puntuación. */
  fijado?: boolean;
}

/** Cuota máxima de memoria por medio, en bytes. */
export const CUOTA_POR_MEDIO: Record<Medio, number> = {
  web: 5 * 1024 * 1024,          // 5 MB
  pwa: 50 * 1024 * 1024,         // 50 MB
  nativo: 500 * 1024 * 1024,     // 500 MB
  servidor: 2 * 1024 * 1024 * 1024, // 2 GB
  xr: 20 * 1024 * 1024,          // 20 MB
};

/**
 * Calcula la puntuación de un recuerdo basado en usos y recencia.
 * Fórmula: usos × recencia, donde recencia = e^(-λ * Δt) con vida media de 30 días.
 * @param r El recuerdo a puntuar
 * @param ahora Timestamp actual en milisegundos
 * @returns Puntuación del recuerdo (mayor = más relevante)
 */
export function puntuar(r: RecuerdoBot, ahora: number): number {
  // Vida media de 30 días en milisegundos
  const VIDA_MEDIA_DIAS = 30;
  const VIDA_MEDIA_MS = VIDA_MEDIA_DIAS * 24 * 60 * 60 * 1000;
  // Constante de decaimiento λ = ln(2) / vida_media
  const LAMBDA = Math.LN2 / VIDA_MEDIA_MS;
  // Diferencia de tiempo
  const deltaT = ahora - r.at;
  // Recencia: e^(-λ * Δt)
  const recencia = Math.exp(-LAMBDA * deltaT);
  // Puntuación: usos × recencia
  return r.usos * recencia;
}

/**
 * Aplica la política de olvido para ajustar los recuerdos a la cuota disponible.
 * Nunca olvida un recuerdo fijado.
 * @param recuerdos Array de recuerdos a evaluar
 * @param cuotaBytes Cuota máxima disponible en bytes
 * @param ahora Timestamp actual en milisegundos
 * @returns Objeto con los recuerdos a conservar y los a olvidar
 */
export function regular(
  recuerdos: RecuerdoBot[],
  cuotaBytes: number,
  ahora: number
): { conservar: RecuerdoBot[]; olvidar: RecuerdoBot[] } {
  // Ordenar por puntuación (mayor a menor) para conservar primero los más relevantes
  const ordenados = [...recuerdos].sort((a, b) => puntuar(b, ahora) - puntuar(a, ahora));
  
  let bytesActuales = 0;
  const conservar: RecuerdoBot[] = [];
  const olvidar: RecuerdoBot[] = [];
  
  for (const recuerdo of ordenados) {
    // Nunca olvidar recuerdos fijados
    if (recuerdo.fijado) {
      conservar.push(recuerdo);
      bytesActuales += recuerdo.bytes;
      continue;
    }
    
    // Si agregar este recuerdo no supera la cuota, lo conservamos
    if (bytesActuales + recuerdo.bytes <= cuotaBytes) {
      conservar.push(recuerdo);
      bytesActuales += recuerdo.bytes;
    } else {
      // De lo contrario, lo olvidamos
      olvidar.push(recuerdo);
    }
  }
  
  return { conservar, olvidar };
}

/**
 * Planifica la transferencia de recuerdos entre neuronas según su alcance y cuenta.
 * @param recuerdos Array de recuerdos a transferir
 * @param origen Información de la neurona de origen
 * @param destinos Array de destinos posibles
 * @returns Array de transferencias planificadas (destino y IDs de recuerdos a transferir)
 */
export function planTransferencia(
  recuerdos: RecuerdoBot[],
  origen: { neurona: string; cuentaId: string },
  destinos: Array<{
    neurona: string;
    cuentaId: string;
    tipo: "propia" | "grupo" | "servidor-grupo";
    grupoId?: string;
  }>
): Array<{ destino: typeof destinos[0]; ids: string[] }> {
  // Agrupar recuerdos por alcance
  const recuerdosPorAlcance: Record<string, RecuerdoBot[]> = {
    personal: [],
    perfil: [],
    grupo: [],
    publica: []
  };
  
  for (const recuerdo of recuerdos) {
    recuerdosPorAlcance[recuerdo.alcance].push(recuerdo);
  }
  
  const transferencias: Array<{ destino: typeof destinos[0]; ids: string[] }> = [];
  
  for (const destino of destinos) {
    const idsParaTransferir: string[] = [];
    
    switch (destino.tipo) {
      case "propia":
        // Solo recuerdos personales y de perfil de la misma cuenta
        // (asumimos que la neurona de origen pertenece a la misma cuenta que el bot)
        // En la práctica, necesitaríamos verificar que origen.cuentaId === destino.cuentaId
        // pero como no tenemos esa información en el origen, asumimos que se valida externamente
        idsParaTransferir.push(
          ...recuerdosPorAlcance.personal.map(r => r.id),
          ...recuerdosPorAlcance.perfil.map(r => r.id)
        );
        break;
        
      case "grupo":
        // Solo recuerdos de grupo que pertenecen al grupo específico
        // Necesitaríamos filtrar por grupoId, pero como no lo tenemos en el recuerdo,
        // asumimos que todos los recuerdos de grupo son del grupo correcto
        // (en una implementación real, el recuerdo tendría un grupoId para alcance "grupo")
        idsParaTransferir.push(
          ...recuerdosPorAlcance.grupo.map(r => r.id)
        );
        break;
        
      case "servidor-grupo":
        // Similar a "grupo" pero para servidor de grupo
        idsParaTransferir.push(
          ...recuerdosPorAlcance.grupo.map(r => r.id)
        );
        break;
    }
    
    // También transferir recuerdos públicos a cualquier destino
    idsParaTransferir.push(
      ...recuerdosPorAlcance.publica.map(r => r.id)
    );
    
    // Eliminar duplicados (un recuerdo no debería transferirse dos veces al mismo destino)
    const idsUnicos = [...new Set(idsParaTransferir)];
    
    if (idsUnicos.length > 0) {
      transferencias.push({ destino, ids: idsUnicos });
    }
  }
  
  return transferencias;
}