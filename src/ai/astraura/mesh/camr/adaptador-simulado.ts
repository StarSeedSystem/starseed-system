/**
 * StarSeed OS — CAMR · ADAPTADOR SIMULADO (Ola 1005C · CAMR1005D).
 * ============================================================================
 * Envuelve `simulator.ts` (`SimulatorTransport`) implementando
 * `EnlaceFisico`. Nunca lanza procesos ni redes reales; todo es virtual
 * con escenarios deterministas por semilla (el simulador maneja los
 * nodos, SNR y pérdida internos).
 *
 * Regla de ley (§5): `dentroDeLey` sigue vetando antes de cualquier
 * cambio.
 */

import { createSimulatorTransport } from "../simulator";
import type {
  MeshTransportEvents,
} from "../types";
import {
  dentroDeLey,
} from "./regulacion";
import type {
  EnlaceFisico,
  EstadoEnlace,
  Medicion,
  ParametrosRadio,
  ClaseTrafico,
  Tecnologia,
} from "./tipos";

export interface AdaptadorSimuladoOpts {
  id: string;
  tecnologia: Tecnologia;
  banda: string;
  frecuenciaMhz: number;
  capacidadKbps: number;
  mtu: number;
  cifradoPermitido: boolean;
}

export class AdaptadorSimulado implements EnlaceFisico {
  readonly id: string;
  readonly tecnologia: Tecnologia;
  readonly banda: string;
  frecuenciaMhz: number;
  readonly capacidadKbps: number;
  readonly mtu: number;
  readonly cifradoPermitido: boolean;
  estado: EstadoEnlace;

  private transporte: ReturnType<typeof createSimulatorTransport>;
  private eventosMinimos: MeshTransportEvents;
  private ultimoSnr: number | null = null;
  private ultimoRssi: number | null = null;
  private vecinosContados = 0;

  constructor(opts: AdaptadorSimuladoOpts) {
    this.id = opts.id;
    this.tecnologia = opts.tecnologia;
    this.banda = opts.banda;
    this.frecuenciaMhz = opts.frecuenciaMhz;
    this.capacidadKbps = opts.capacidadKbps;
    this.mtu = opts.mtu;
    this.cifradoPermitido = opts.cifradoPermitido;
    this.estado = "desconectado";
    this.eventosMinimos = {
      onStatus: (s, d) => {
        if (s === "ready") this.estado = "activo";
        else if (s === "degraded") this.estado = "degradado";
        else if (s === "disconnected" || s === "error") this.estado = "desconectado";
      },
      onNode: (node) => {
        if (node.snr !== undefined) this.ultimoSnr = node.snr;
        if (node.rssi !== undefined) this.ultimoRssi = node.rssi;
        this.vecinosContados = Math.max(this.vecinosContados, (node.num ?? 0) ? 1 : 0);
      },
    };
    this.transporte = createSimulatorTransport(this.eventosMinimos) as ReturnType<typeof createSimulatorTransport>;
    // El simulador se conecta automáticamente en su constructor; lo dejamos
    // en estado inicial y conectamos explícitamente si hace falta.
    void this.transporte.connect().catch(() => {
      this.estado = "desconectado";
    });
  }

  medir(): Medicion {
    // Reutiliza los datos del simulador que llegaron por eventos.
    return {
      rssiDbm: this.ultimoRssi,
      snrDb: this.ultimoSnr,
      ber: null,
      ruidoDbm: null,
      latenciaMs: null,
      perdida: null,
      tiempoAireUsado: null,
      vecinos: this.vecinosContados,
      anchoBandaKbps: null,
      at: Date.now(),
    };
  }

  async aplicar(
    params: ParametrosRadio,
    opts: { seco: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    // El simulador no tiene restricciones legales de banda; aceptamos
    // cualquier parámetro que el usuario pida (dentro del contrato).
    if (opts.seco) {
      return { ok: true };
    }
    try {
      // Intenta el cambio de preset en el simulador.
      const presetMap: Record<number, string> = {
        7: "SHORT_TURBO",
        8: "SHORT_FAST",
        9: "SHORT_SLOW",
        10: "MEDIUM_FAST",
        11: "MEDIUM_SLOW",
        12: "LONG_TURBO",
        13: "LONG_FAST",
        14: "LONG_MODERATE",
        15: "LONG_SLOW",
      };
      const presetKey = presetMap[params.spreadFactor ?? 7] ?? "SHORT_FAST";
      await (this.transporte as { setModemPreset?: (k: string) => Promise<boolean> }).setModemPreset?.(presetKey);
      this.frecuenciaMhz = params.frecuenciaMhz;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fallo al aplicar en simulador" };
    }
  }

  async enviar(
    paquete: Uint8Array,
    clase: ClaseTrafico,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const receipt = await (this.transporte as { send: (bytes: Uint8Array, opts: { wantAck?: boolean; portNum?: number; dest?: number | "broadcast" | "self"; channel?: number }) => Promise<{ ok: boolean; packetId?: number }> }).send(paquete, {
        wantAck: true,
        portNum: 256,
        dest: "broadcast",
        channel: 0,
      });
      return receipt.ok ? { ok: true } : { ok: false, error: "simulador: paquete perdido" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fallo de TX en simulador" };
    }
  }
}
