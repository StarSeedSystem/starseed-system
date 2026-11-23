/**
 * conectores/triangulacion-contenido — planificador inteligente y triangulación multiantena P2P
 * para publicar, distribuir, almacenar y transmitir cualquier dato en StarSeed OS.
 *
 * Separa:
 *  1) Plano de control y descubrimiento (Reticulum/LXMF, MeshCore, Meshtastic, BLE).
 *  2) Plano de datos y flujos en vivo en paralelo (Wi-Fi Direct, Red local LAN, Titanio, WebRTC).
 *  3) Triangulación geográfica/topológica entre neuronas públicas/comunidad con aislamiento estricto de capa privada.
 *
 * Módulo PURO: sin red ni DOM.
 */

import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import { fichaDeTipo } from "./fichas";
import type { TipoConector } from "./tipos";
import {
  ordenarProtocolosPorTarea,
  type AjustesMallaUniversal,
  type ConfigProtocoloMalla,
} from "./protocolos-universales";

export type CapaRed = "publica" | "privada" | "comunidad";
export type DestinoPublicacion = "pagina" | "grupo" | "comunidad" | "canal-directo" | "archivo";
export type TipoContenidoMesh = "texto" | "imagen" | "audio" | "video" | "documento" | "modelo-ia" | "binario-libre";

export interface SolicitudTriangulacion {
  contenidoId: string;
  capa: CapaRed;
  destino: DestinoPublicacion;
  tipo: TipoContenidoMesh;
  formato: string;
  bytesTotal: number;
  requiereEnVivo?: boolean;
}

export interface EnlaceCandidato extends Omit<EnlaceDisponible, "tipo"> {
  tipo: TipoConector;
}

export interface NodoAlmacenCandidato {
  neuronaId: string;
  etiqueta: string;
  esPublico: boolean;
  perteneceACuenta: boolean;
  perteneceAComunidad?: string;
  enlaces: EnlaceCandidato[];
  espacioLibreMb: number;
  cargaPct: number;
  disponibleAhora: boolean;
}

export interface AsignacionNodoTriangulado {
  neuronaId: string;
  etiqueta: string;
  protocolosAsignados: string[];
  cuotaMbAsignada: number;
  puntuacion: number;
  motivo: string;
}

export interface SegmentoAntena {
  protocoloId: string;
  desdeByte: number;
  hastaByte: number;
  bytes: number;
}

export interface PlanTriangulacionContenido {
  viable: boolean;
  motivo?: string;
  capa: CapaRed;
  viaControl: ConfigProtocoloMalla | null;
  viasDatos: ConfigProtocoloMalla[];
  nodosReplicacion: AsignacionNodoTriangulado[];
  segmentos: SegmentoAntena[];
  redundancia: number;
  autoReparable: boolean;
  estrategia: string;
}

function redundanciaDeseada(s: SolicitudTriangulacion): number {
  if (s.capa === "privada") return s.bytesTotal > 256 * 1024 ? 2 : 1;
  if (s.destino === "canal-directo" || s.destino === "comunidad" || s.destino === "pagina") {
    return s.bytesTotal > 2 * 1024 * 1024 ? 3 : 2;
  }
  return 2;
}

function esElegibleEnCapa(nodo: NodoAlmacenCandidato, capa: CapaRed): boolean {
  if (!nodo.disponibleAhora || nodo.espacioLibreMb <= 0) return false;
  if (capa === "privada") return nodo.perteneceACuenta;
  if (capa === "comunidad") return nodo.perteneceACuenta || Boolean(nodo.perteneceAComunidad) || nodo.esPublico;
  return nodo.esPublico || nodo.perteneceACuenta;
}

function tipoEnlaceCompatible(enlace: EnlaceCandidato, proto: ConfigProtocoloMalla): boolean {
  const t: string = enlace.tipo;
  const ruta: string = enlace.ruta ?? "";
  if (proto.familia === "red-local" && (t === "local" || t === "nativo")) return true;
  if (proto.familia === "wifi-direct" && (t === "wifi-direct" || t === "local" || ruta === "misma-red-local")) return true;
  if (proto.familia === "webrtc" && (t === "par" || t === "cuenta")) return true;
  if (proto.familia === "reticulum" && (t === "reticulum" || t === "lora")) return true;
  if ((proto.familia === "meshtastic" || proto.familia === "meshcore") && (t === "lora" || t === proto.familia)) return true;
  if (proto.familia === "titanio" && (t === "titanio" || t === "local" || t === "par")) return true;
  return t === proto.id || t === proto.familia;
}

/** Reparte el flujo de bytes entre múltiples vías/antenas simultáneas de forma proporcional a su MTU y prioridad. */
export function dividirSegmentosParaAntenas(
  bytesTotal: number,
  vias: readonly ConfigProtocoloMalla[],
): SegmentoAntena[] {
  const total = Math.max(0, Math.floor(bytesTotal));
  if (total === 0 || vias.length === 0) return [];
  if (vias.length === 1) {
    return [{ protocoloId: vias[0].id, desdeByte: 0, hastaByte: total, bytes: total }];
  }
  const pesos = vias.map((v) => Math.max(1, v.prioridad) * Math.max(1, Math.min(64_000, v.mtuBytes)));
  const sumaPesos = pesos.reduce((acc, p) => acc + p, 0);
  const segmentos: SegmentoAntena[] = [];
  let cursor = 0;
  vias.forEach((via, i) => {
    const restante = total - cursor;
    const bytes = i === vias.length - 1 ? restante : Math.min(restante, Math.max(1, Math.floor((total * pesos[i]) / sumaPesos)));
    if (bytes > 0) {
      segmentos.push({ protocoloId: via.id, desdeByte: cursor, hastaByte: cursor + bytes, bytes });
      cursor += bytes;
    }
  });
  return segmentos;
}

/** Planifica la transmisión multiantena y replicación triangulada según capa, tipo de contenido y nodos vivos. */
export function planificarTriangulacionContenido(
  solicitud: SolicitudTriangulacion,
  ajustes: AjustesMallaUniversal,
  candidatos: readonly NodoAlmacenCandidato[],
): PlanTriangulacionContenido {
  const capaObjetivo = solicitud.capa === "privada" ? "privada" : "publica";
  const ordenControl = ordenarProtocolosPorTarea(ajustes, "senal-control", capaObjetivo);
  const ordenDatos = ordenarProtocolosPorTarea(
    ajustes,
    solicitud.requiereEnVivo || solicitud.tipo === "video" || solicitud.tipo === "audio" ? "flujo-vivo" : "contenido-pesado",
    capaObjetivo,
  );
  const viaControl = ordenControl[0] ?? ordenDatos[0] ?? null;

  const viasAltaCapacidad = ordenDatos.filter((p) =>
    solicitud.bytesTotal > p.mtuBytes ? p.rol !== "control-bajo-consumo" || p.mtuBytes >= 1400 : true,
  );
  const poolDatos = viasAltaCapacidad.length > 0 ? viasAltaCapacidad : ordenDatos;
  const maxSimultaneas = ajustes.modoMultiAntenaSimultanea ? 3 : 1;
  const viasDatos = poolDatos.slice(0, maxSimultaneas);

  if (viasDatos.length === 0 && !viaControl) {
    return {
      viable: false,
      motivo: "sin-protocolos-habilitados-para-capa",
      capa: solicitud.capa,
      viaControl: null,
      viasDatos: [],
      nodosReplicacion: [],
      segmentos: [],
      redundancia: 0,
      autoReparable: false,
      estrategia: "inactivo",
    };
  }

  const elegibles = candidatos.filter((c) => esElegibleEnCapa(c, solicitud.capa));
  const tamMb = Math.max(0.01, Math.round((solicitud.bytesTotal / (1024 * 1024)) * 100) / 100);

  const puntuados: AsignacionNodoTriangulado[] = elegibles
    .map((nodo) => {
      const protocolosAsignados = viasDatos
        .filter((p) => nodo.enlaces.some((e) => e.abierto && tipoEnlaceCompatible(e, p)))
        .map((p) => p.id);
      const viasEfectivas =
        protocolosAsignados.length > 0
          ? protocolosAsignados
          : viasDatos.slice(0, 1).map((p) => p.id);
      const mejorFicha = nodo.enlaces.map((e) => fichaDeTipo(e.tipo, e as EnlaceDisponible)).find((f) => f.llevaFlujos);
      const bonoFlujo = solicitud.requiereEnVivo && mejorFicha ? 25 : 0;
      const bonoPublico = solicitud.capa === "publica" && nodo.esPublico ? 15 : 0;
      const penalCarga = Math.min(40, Math.round(nodo.cargaPct * 0.4));
      const puntuacion =
        viasEfectivas.length * 25 +
        Math.min(30, Math.round(nodo.espacioLibreMb / 256)) +
        bonoFlujo +
        bonoPublico -
        penalCarga;
      return {
        neuronaId: nodo.neuronaId,
        etiqueta: nodo.etiqueta,
        protocolosAsignados: viasEfectivas,
        cuotaMbAsignada: Math.min(nodo.espacioLibreMb, Math.max(1, Math.ceil(tamMb))),
        puntuacion,
        motivo: solicitud.capa === "privada" ? "neurona-propia-aislada" : nodo.esPublico ? "nodo-publico-triangulado" : "respaldo-comunidad",
      };
    })
    .sort((a, b) => b.puntuacion - a.puntuacion);

  const meta = redundanciaDeseada(solicitud);
  const nodosReplicacion = puntuados.slice(0, Math.max(1, meta));
  const segmentos = dividirSegmentosParaAntenas(solicitud.bytesTotal, viasDatos);
  const estrategia =
    viasDatos.length > 1
      ? "multiantena-paralela-triangulada"
      : viasDatos.length === 1
        ? "via-directa-unica"
        : "senalizacion-bajo-consumo";

  return {
    viable: true,
    capa: solicitud.capa,
    viaControl,
    viasDatos,
    nodosReplicacion,
    segmentos,
    redundancia: nodosReplicacion.length,
    autoReparable: ajustes.autoEnrutamientoInteligente && nodosReplicacion.length >= 2,
    estrategia,
  };
}
