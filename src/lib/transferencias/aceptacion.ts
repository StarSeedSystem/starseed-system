/**
 * StarSeed OS — Aceptación de transferencias entrantes (FMT1119B).
 * ============================================================================
 * Módulo PURO: lógica de decisión para aceptar/rechazar archivos, carpetas y
 * sincronizaciones de cerebro que llegan por la malla, Wi-Fi, Syncthing, etc.
 * Sin red, sin disco, sin efectos secundarios. Solo entrada → salida.
 */

export type TipoTransferencia = "archivo" | "carpeta" | "sincronizacion-cerebro";

export type MedioTransferencia =
  | "mesh"
  | "wifi"
  | "syncthing"
  | "bluetooth"
  | "usb"
  | "servidor"
  | "otro";

export interface TransferenciaEntrante {
  id: string;
  tipo: TipoTransferencia;
  nombre: string;
  tamaño: number;
  tipoReal: string;
  extension: string;
  neuronaOrigen: string;
  medio: MedioTransferencia;
  fingerprintOrigen: string;
  timestamp: number;
}

export interface NeuronaReconocida {
  id: string;
  nombre: string;
  aceptacionAutomatica: boolean;
  fingerprint: string;
}

export interface SolicitudAceptacion {
  id: string;
  tipo: TipoTransferencia;
  nombre: string;
  tamaño: number;
  tipoReal: string;
  extension: string;
  neuronaOrigen: string;
  medio: MedioTransferencia;
  fingerprintOrigen: string;
  timestamp: number;
  requiereConfirmacion: boolean;
}

export type MotivoDecision =
  | "neurona-reconocida-auto"
  | "requiere-confirmacion"
  | "neurona-desconocida"
  | "confirmacion-manual-aceptar"
  | "confirmacion-manual-rechazar";

export interface DecisionAceptacion {
  aceptada: boolean;
  motivo: MotivoDecision;
  porConfirmacionManual: boolean;
  solicitud?: SolicitudAceptacion;
}

const TIPOS_VALIDOS: readonly TipoTransferencia[] = [
  "archivo",
  "carpeta",
  "sincronizacion-cerebro",
] as const;

export function tipoTransferenciaValido(tipo: string): tipo is TipoTransferencia {
  return TIPOS_VALIDOS.includes(tipo as TipoTransferencia);
}

export function crearSolicitudAceptacion(
  transferencia: TransferenciaEntrante
): SolicitudAceptacion {
  return {
    id: transferencia.id,
    tipo: transferencia.tipo,
    nombre: transferencia.nombre,
    tamaño: transferencia.tamaño,
    tipoReal: transferencia.tipoReal,
    extension: transferencia.extension,
    neuronaOrigen: transferencia.neuronaOrigen,
    medio: transferencia.medio,
    fingerprintOrigen: transferencia.fingerprintOrigen,
    timestamp: transferencia.timestamp,
    requiereConfirmacion: true,
  };
}

export function evaluarAceptacionAutomatica(
  transferencia: TransferenciaEntrante,
  neuronasReconocidas: readonly NeuronaReconocida[]
): boolean {
  const neurona = neuronasReconocidas.find(
    (n) => n.id === transferencia.neuronaOrigen && n.fingerprint === transferencia.fingerprintOrigen
  );

  if (!neurona) return false;
  if (!neurona.aceptacionAutomatica) return false;

  return true;
}

export function decidirAceptacion(
  transferencia: TransferenciaEntrante,
  neuronasReconocidas: readonly NeuronaReconocida[],
  confirmacionManual: boolean | null
): DecisionAceptacion {
  const solicitud = crearSolicitudAceptacion(transferencia);
  const autoAceptar = evaluarAceptacionAutomatica(transferencia, neuronasReconocidas);

  if (autoAceptar) {
    return {
      aceptada: true,
      motivo: "neurona-reconocida-auto",
      porConfirmacionManual: false,
    };
  }

  const neuronaConocida = neuronasReconocidas.find(
    (n) => n.id === transferencia.neuronaOrigen && n.fingerprint === transferencia.fingerprintOrigen
  );

  if (confirmacionManual !== null) {
    return {
      aceptada: confirmacionManual,
      motivo: confirmacionManual ? "confirmacion-manual-aceptar" : "confirmacion-manual-rechazar",
      porConfirmacionManual: true,
      solicitud,
    };
  }

  if (neuronaConocida) {
    return {
      aceptada: false,
      motivo: "requiere-confirmacion",
      porConfirmacionManual: true,
      solicitud,
    };
  }

  return {
    aceptada: false,
    motivo: "neurona-desconocida",
    porConfirmacionManual: true,
    solicitud,
  };
}