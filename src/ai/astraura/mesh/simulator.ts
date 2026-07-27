"use client";

/**
 * StarSeed OS — Red Mesh · SIMULADOR (Adenda 97 · SOP §9).
 * ============================================================================
 * Transporte VIRTUAL: una mini-malla de nodos simulados con SNR/batería que
 * derivan con el tiempo, pérdida de paquetes configurable y eco de nuestros
 * propios sobres (un "nodo espejo" reenvía lo que emitimos, con pérdida).
 *
 * Para qué sirve (honesto): probar la UI, el router, el codec y las reglas
 * por neurona SIN hardware LoRa — y como modo demo del panel Red Mesh. No
 * transmite NADA por radio.
 *
 * SSR-safe y defensivo. NUNCA lanza.
 */

import type {
  MeshNodeInfo,
  MeshSendOptions,
  MeshSendReceipt,
  MeshTransport,
  MeshTransportEvents,
  MeshTransportKind,
} from "./types";

interface SimNode {
  info: MeshNodeInfo;
  /** Deriva del SNR por tick (paseo aleatorio acotado). */
  drift: number;
}

const SIM_NAMES: Array<[string, string]> = [
  ["Sangha Azotea", "AZTA"],
  ["Neurona Huerto", "HRTO"],
  ["Faro del Valle", "FARO"],
  ["Casa Comunal", "CASA"],
  ["Nodo Errante", "ERRA"],
  ["Antena Cerro", "CERR"],
];

export class SimulatorTransport implements MeshTransport {
  readonly kind: MeshTransportKind = "simulator";
  events: MeshTransportEvents;

  /** Pérdida de paquetes simulada 0..1 (por defecto 12 %). */
  lossRate = 0.12;

  private nodes: SimNode[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private packetSeq = 1;
  private connected = false;

  constructor(events: MeshTransportEvents) {
    this.events = events;
  }

  private emitStatus(s: Parameters<NonNullable<MeshTransportEvents["onStatus"]>>[0], d?: string): void {
    try {
      this.events.onStatus?.(s, d);
    } catch {
      /* */
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.emitStatus("connecting");
    // Nodo local (self) + 4-6 vecinos.
    const count = 4 + Math.floor(Math.random() * 3);
    const now = Date.now();
    this.nodes = [];
    try {
      this.events.onNode?.({
        num: 0xa5a5a5,
        id: "!starseed",
        longName: "Esta neurona (simulada)",
        shortName: "YO",
        isSelf: true,
        lastHeard: now,
        channelUtilization: 3,
        airUtilTx: 0.4,
        batteryLevel: 101,
      });
    } catch {
      /* */
    }
    for (let i = 0; i < count; i++) {
      const [longName, shortName] = SIM_NAMES[i % SIM_NAMES.length];
      const info: MeshNodeInfo = {
        num: 0x100000 + i,
        id: `!sim${(0x100000 + i).toString(16)}`,
        longName,
        shortName,
        hwModel: i % 2 ? "HELTEC_V3" : "TBEAM",
        role: i === 0 ? "ROUTER" : "CLIENT",
        lastHeard: now - Math.floor(Math.random() * 60_000),
        presence: "online",
        snr: 4 + Math.random() * 8,
        rssi: -95 + Math.random() * 25,
        batteryLevel: 40 + Math.floor(Math.random() * 60),
        hopsAway: i < 2 ? 0 : 1 + Math.floor(Math.random() * 2),
      };
      this.nodes.push({ info, drift: (Math.random() - 0.5) * 0.6 });
      try {
        this.events.onNode?.(info);
      } catch {
        /* */
      }
    }
    this.emitStatus("ready", "malla simulada");
    this.tickTimer = setInterval(() => this.tick(), 5_000);
  }

  private tick(): void {
    if (!this.connected) return;
    const now = Date.now();
    for (const n of this.nodes) {
      // Paseo aleatorio del SNR (acotado −20..12) + batería que baja despacio.
      n.drift += (Math.random() - 0.5) * 0.4;
      n.drift = Math.max(-1, Math.min(1, n.drift));
      const snr = Math.max(-20, Math.min(12, (n.info.snr ?? 5) + n.drift));
      n.info.snr = snr;
      if (typeof n.info.batteryLevel === "number" && n.info.batteryLevel > 5 && Math.random() < 0.3) {
        n.info.batteryLevel -= 1;
      }
      // Un nodo "se oye" este tick con probabilidad ligada a su SNR.
      const heardP = 0.35 + (snr + 20) / 64; // SNR alto → casi seguro
      if (Math.random() < heardP) {
        n.info.lastHeard = now;
        try {
          this.events.onNode?.({ ...n.info });
        } catch {
          /* */
        }
      }
    }
    // Telemetría del propio radio: utilización que respira.
    try {
      this.events.onSelfTelemetry?.({
        channelUtilization: 2 + Math.random() * 9,
        airUtilTx: 0.2 + Math.random() * 1.4,
      });
    } catch {
      /* */
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.nodes = [];
    this.emitStatus("disconnected");
  }

  /** (Adenda 98) Emula el cambio de preset: re-informa la config al instante. */
  async setModemPreset(presetKey: string): Promise<boolean> {
    if (!this.connected) return false;
    try {
      this.events.onLoraConfig?.({ regionKey: null, presetKey });
    } catch {
      /* */
    }
    return true;
  }

  async send(bytes: Uint8Array, opts: MeshSendOptions): Promise<MeshSendReceipt> {
    if (!this.connected) return { ok: false, error: "simulador desconectado" };
    const packetId = this.packetSeq++;
    // Eco espejo: un vecino "reemite" nuestro sobre con pérdida y latencia LoRa.
    const lost = Math.random() < this.lossRate;
    if (!lost) {
      const echoFrom = this.nodes[0]?.info.num ?? 0x100000;
      const copy = bytes.slice();
      setTimeout(() => {
        if (!this.connected) return;
        try {
          this.events.onAppPayload?.(copy, { from: echoFrom, packetId });
          if (opts.wantAck) this.events.onAck?.(packetId, true);
        } catch {
          /* */
        }
      }, 800 + Math.random() * 2_200);
    } else if (opts.wantAck) {
      setTimeout(() => {
        try {
          this.events.onAck?.(packetId, false);
        } catch {
          /* */
        }
      }, 3_000);
    }
    return { ok: true, packetId };
  }
}

export function createSimulatorTransport(events: MeshTransportEvents): SimulatorTransport {
  return new SimulatorTransport(events);
}
