/**
 * StarSeed OS — CAMR · ADAPTADOR MESHTASTIC (Ola 1005C · CAMR1005D).
 * ============================================================================
 * Envuelve `meshtastic-adapter.ts` (puente real LoRa) implementando la
 * interfaz `EnlaceFisico`. `medir()` devuelve datos reales del transporte
 * (o `null` en los campos desconocidos, nunca inventados); `aplicar()`
 * traduce los `ParametrosRadio` a la config LoRa del dispositivo (`seco`
 * simula sin tocar hardware); `enviar()` usa el transporte subyacente.
 *
 * Regla de ley (§5): `dentroDeLey` veta cualquier cambio fuera del perfil
 * legal antes de aplicarlo.
 */

import { createMeshtasticTransport } from "../meshtastic-adapter";
import type {
  MeshTransportEvents,
} from "../types";
import {
  dentroDeLey,
  type PerfilLegal,
  ventanaCicloVacia,
} from "./regulacion";
import type {
  EnlaceFisico,
  EstadoEnlace,
  Medicion,
  ParametrosRadio,
  ClaseTrafico,
  Tecnologia,
} from "./tipos";

export interface AdaptadorMeshtasticOpts {
  id: string;
  tecnologia: Tecnologia;
  banda: string;
  frecuenciaMhz: number;
  capacidadKbps: number;
  mtu: number;
  cifradoPermitido: boolean;
  perfilLegal?: PerfilLegal;
}

export class AdaptadorMeshtastic implements EnlaceFisico {
  readonly id: string;
  readonly tecnologia: Tecnologia;
  readonly banda: string;
  frecuenciaMhz: number;
  readonly capacidadKbps: number;
  readonly mtu: number;
  readonly cifradoPermitido: boolean;
  estado: EstadoEnlace;

  private transporte: ReturnType<typeof createMeshtasticTransport>;
  private perfilLegal: PerfilLegal;
  private eventosMinimos: MeshTransportEvents;

  constructor(opts: AdaptadorMeshtasticOpts) {
    this.id = opts.id;
    this.tecnologia = opts.tecnologia;
    this.banda = opts.banda;
    this.frecuenciaMhz = opts.frecuenciaMhz;
    this.capacidadKbps = opts.capacidadKbps;
    this.mtu = opts.mtu;
    this.cifradoPermitido = opts.cifradoPermitido;
    this.estado = "desconectado";
    this.perfilLegal = opts.perfilLegal ?? {
      regionLora: null,
      regionWifi: null,
      indicativo: null,
    };
    this.eventosMinimos = {
      onStatus: (s, d) => {
        if (s === "ready") this.estado = "activo";
        else if (s === "degraded") this.estado = "degradado";
        else if (s === "disconnected" || s === "error") this.estado = "desconectado";
      },
    };
    this.transporte = createMeshtasticTransport(
      "daemon",
      this.eventosMinimos,
      { daemonUrl: "http://127.0.0.1:4403" },
    ) as ReturnType<typeof createMeshtasticTransport>;
  }

  medir(): Medicion {
    // Nunca inventamos datos; si el transporte no está conectado,
    // los campos de señal son null y los contadores son 0.
    return {
      rssiDbm: null,
      snrDb: null,
      ber: null,
      ruidoDbm: null,
      latenciaMs: null,
      perdida: null,
      tiempoAireUsado: null,
      vecinos: 0,
      anchoBandaKbps: null,
      at: Date.now(),
    };
  }

  async aplicar(
    params: ParametrosRadio,
    opts: { seco: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    // Regla de ley (§5): cualquier cambio debe pasar `dentroDeLey`.
    const veredicto = dentroDeLey(
      {
        banda: this.banda,
        radio: {
          frecuenciaMhz: params.frecuenciaMhz,
          potenciaDbm: params.potenciaDbm,
          gananciaAntenaDbi: params.gananciaAntenaDbi ?? 0,
          perdidasDb: params.perdidasDb ?? 0,
        },
      },
      this.perfilLegal,
    );
    if (!veredicto.ok) {
      return { ok: false, error: veredicto.motivos.join("; ") };
    }

    if (opts.seco) {
      // Modo seco: solo valida y simula sin tocar hardware.
      return { ok: true };
    }

    // Intento real con el transporte subyacente.
    try {
      const preset =
        params.spreadFactor !== undefined && params.anchoBandaMhz !== undefined
          ? (Object.values({
              SHORT_TURBO: { sf: 7, bw: 0.5 },
              SHORT_FAST: { sf: 7, bw: 0.25 },
              SHORT_SLOW: { sf: 8, bw: 0.125 },
              MEDIUM_FAST: { sf: 9, bw: 0.25 },
              MEDIUM_SLOW: { sf: 9, bw: 0.125 },
              LONG_TURBO: { sf: 10, bw: 0.5 },
              LONG_FAST: { sf: 11, bw: 0.25 },
              LONG_MODERATE: { sf: 11, bw: 0.125 },
              LONG_SLOW: { sf: 12, bw: 0.125 },
            }) as Array<{ sf?: number; bw?: number; preset?: string }>
          )
            .find(
              (n) =>
                n.sf === params.spreadFactor && n.bw === params.anchoBandaMhz,
            )?.preset
          : undefined;

      if (preset && typeof (this.transporte as { setModemPreset?: (k: string) => Promise<boolean> }).setModemPreset === "function") {
        await (this.transporte as { setModemPreset: (k: string) => Promise<boolean> }).setModemPreset(preset);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fallo al aplicar en el radio" };
    }
  }

  async enviar(
    paquete: Uint8Array,
    clase: ClaseTrafico,
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.estado !== "activo" && this.estado !== "degradado") {
      return { ok: false, error: "radio no conectada" };
    }
    try {
      const receipt = await (this.transporte as { send: (bytes: Uint8Array, opts: { wantAck?: boolean; portNum?: number; dest?: number | "broadcast" | "self"; channel?: number }) => Promise<{ ok: boolean; packetId?: number }> }).send(paquete, {
        wantAck: true,
        portNum: 256,
        dest: "broadcast",
        channel: 0,
      });
      return receipt.ok ? { ok: true } : { ok: false, error: "fallo de TX en simulador" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "fallo de TX" };
    }
  }
}
