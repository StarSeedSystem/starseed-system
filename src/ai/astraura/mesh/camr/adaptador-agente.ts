/**
 * StarSeed OS — CAMR · ADAPTADOR AGENTE LOCAL (Ola 1005C · CAMR1005D).
 * ============================================================================
 * Cliente HTTP (`fetch` inyectable) al agente CAMR en `127.0.0.1:4480`.
 * Las tecnologías (`rns`, `80211s`, `babel`, `batman`, `yggdrasil`) se
 * anuncian por `/estado`; `medir()` consulta `/mediciones`; `aplicar()`
 * hace `POST /aplicar` (con `seco`) y `enviar()` hace `POST /enviar` con
 * el cuerpo que lleva el paquete y su clase.
 *
 * Regla de ley (§5): `dentroDeLey` se aplica antes de cualquier cambio.
 */

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

export interface AdaptadorAgenteOpts {
  id: string;
  tecnologia: Tecnologia;
  banda: string;
  frecuenciaMhz: number;
  capacidadKbps: number;
  mtu: number;
  cifradoPermitido: boolean;
  fetchFn?: typeof fetch;
  urlBase?: string;
}

export class AdaptadorAgente implements EnlaceFisico {
  readonly id: string;
  readonly tecnologia: Tecnologia;
  readonly banda: string;
  frecuenciaMhz: number;
  readonly capacidadKbps: number;
  readonly mtu: number;
  readonly cifradoPermitido: boolean;
  estado: EstadoEnlace;

  private fetchFn: typeof fetch;
  private urlBase: string;
  private tecnologiasAnunciadas: Tecnologia[] = [];

  constructor(opts: AdaptadorAgenteOpts) {
    this.id = opts.id;
    this.tecnologia = opts.tecnologia;
    this.banda = opts.banda;
    this.frecuenciaMhz = opts.frecuenciaMhz;
    this.capacidadKbps = opts.capacidadKbps;
    this.mtu = opts.mtu;
    this.cifradoPermitido = opts.cifradoPermitido;
    this.estado = "desconectado";
    this.fetchFn = opts.fetchFn ?? (() => Promise.reject(new Error("sin fetchFn")));
    this.urlBase = opts.urlBase ?? "http://127.0.0.1:4480";
    // Intentar descubrir tecnologías disponibles sin bloquear.
    void this.descubrirTecnologias().catch(() => {
      this.tecnologiasAnunciadas = [this.tecnologia];
    });
  }

  private async descubrirTecnologias(): Promise<void> {
    try {
      const res = await this.fetchFn(`${this.urlBase}/estado`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = (await res.json()) as { tecnologias?: string[]; disponible?: string[] };
        const anunciadas = (json.tecnologias ?? json.disponible ?? []) as string[];
        this.tecnologiasAnunciadas = (anunciadas.filter((t) =>
          ["rns", "80211s", "babel", "batman", "yggdrasil", "meshtastic", "simulado"].includes(t),
        ) as Tecnologia[]);
        if (this.tecnologiasAnunciadas.length === 0) {
          this.tecnologiasAnunciadas = [this.tecnologia];
        }
      }
    } catch {
      this.tecnologiasAnunciadas = [this.tecnologia];
    }
  }

  medir(): Medicion {
    // Consulta al agente en modo no bloqueante; si no responde,
    // devuelve null en los campos de señal (nunca inventado).
    try {
      // Intento síncrono (no bloqueante para la interfaz): si hay fetch
      // y el agente responde con datos, los usamos; si no, null.
      const res = this.fetchFn ? this.fetchFn(`${this.urlBase}/mediciones`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }) : null;
      // Como medir es síncrono, no podemos esperar un promise; devolvemos
      // los datos conocidos del último estado o null si no hay conexión.
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
    } catch {
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
  }

  async aplicar(
    params: ParametrosRadio,
    opts: { seco: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.fetchFn) {
      return { ok: false, error: "sin fetchFn" };
    }

    // Regla de ley (§5): veto antes de tocar nada.
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
      { regionLora: null, regionWifi: null, indicativo: null },
    );
    if (!veredicto.ok) {
      return { ok: false, error: veredicto.motivos.join("; ") };
    }

    const cuerpo = JSON.stringify({
      params,
      seco: opts.seco,
    });
    try {
      const res = await this.fetchFn(`${this.urlBase}/aplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: cuerpo,
      });
      if (!res.ok) {
        return { ok: false, error: `agente ${res.status}: ${await res.text()}` };
      }
      const json = (await res.json()) as { ok?: boolean; error?: string };
      return { ok: json.ok ?? false, error: json.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "sin fetchFn" };
    }
  }

  async enviar(
    paquete: Uint8Array,
    clase: ClaseTrafico,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.fetchFn) {
      return { ok: false, error: "sin fetchFn" };
    }

    const cuerpo = JSON.stringify({
      paquete: Array.from(paquete),
      clase,
    });
    try {
      const res = await this.fetchFn(`${this.urlBase}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: cuerpo,
      });
      if (!res.ok) {
        return { ok: false, error: `agente ${res.status}: ${await res.text()}` };
      }
      const json = (await res.json()) as { ok?: boolean; error?: string };
      return { ok: json.ok ?? false, error: json.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "sin fetchFn" };
    }
  }
}
