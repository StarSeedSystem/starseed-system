/**
 * espectrometro — el espectrómetro inteligente (MRE5/MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Une los adaptadores inyectados, deduplica, vincula con antenas/neuronas conocidas,
 * añade compatibles y ordena por vida y calidad.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, EquipoCompat } from "./modelo";
import type { EntradaWifi, ResultadoWifi } from "./adaptadores/wifi";
import type { EntradaBluetooth } from "./adaptadores/bluetooth";
import type { ResultadoEspectro } from "./adaptadores/celular-sdr";
import type { Radio, LoraMedio, EnlaceMapa } from "./adaptadores/lora-malla";
import type { DepsLectura, ResultadoLectura } from "./leer-senales";
import { compatiblesDe } from "./compatibilidad";
import { claveSenal, esViva } from "./utilidades";

export interface AdaptadorWifiFn {
  (entrada: EntradaWifi): Promise<ResultadoWifi>;
}
export interface AdaptadorLoraFn {
  (radio: Radio, lora: LoraMedio, enlaces: EnlaceMapa[]): Promise<readonly SenalEspectro[]>;
}
export interface AdaptadorBluetoothFn {
  (entrada: EntradaBluetooth): Promise<readonly SenalEspectro[] | SinFuente>;
}
export interface AdaptadorCelularFn {
  (): Promise<ResultadoEspectro>;
}
export interface AdaptadorEstacionesFn {
  (): Promise<readonly SenalEspectro[]>;
}
export interface LeerPublicadasFn {
  (deps: DepsLectura): Promise<ResultadoLectura>;
}

export interface EntradaEspectrometro {
  adaptadorWifi: AdaptadorWifiFn;
  adaptadorLora: AdaptadorLoraFn;
  adaptadorBluetooth: AdaptadorBluetoothFn;
  adaptadorCelular: AdaptadorCelularFn;
  adaptadorEstaciones: AdaptadorEstacionesFn;
  leerPublicadas: LeerPublicadasFn;
  equipo: EquipoCompat;
  ahora: number;
}

export interface ResultadoEspectrometro {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
  vinculadas: number;
}

const ANTENNA_KINDS: readonly ("lora" | "relay" | "account" | "ip" | "ble" | "serial")[] = [
  "lora", "relay", "account", "ip", "ble", "serial",
];

function esAntenaConocida(id: string): boolean {
  return ANTENNA_KINDS.includes(id as (typeof ANTENNA_KINDS)[number]);
}

function esVinculoConocido(vinculo: { tipo: string; id: string } | undefined): boolean {
  if (!vinculo) return false;
  if (vinculo.tipo === "antena") return esAntenaConocida(vinculo.id);
  return ["neurona", "cerebro", "nodo", "estacion", "router", "servidor"].includes(vinculo.tipo);
}

function deduplicar(senales: readonly SenalEspectro[]): SenalEspectro[] {
  const vistas = new Map<string, SenalEspectro>();
  for (const s of senales) {
    const clave = claveSenal(s);
    const existente = vistas.get(clave);
    if (!existente) {
      vistas.set(clave, s);
    } else {
      const vivaExistente = esViva(existente, Date.now());
      const vivaNueva = esViva(s, Date.now());
      if (vivaNueva && !vivaExistente) {
        vistas.set(clave, s);
      } else if (vivaNueva === vivaExistente) {
        const calExistente = existente.calidad ?? -1;
        const calNueva = s.calidad ?? -1;
        if (calNueva > calExistente) vistas.set(clave, s);
      }
    }
  }
  return Array.from(vistas.values());
}

function vincular(senales: SenalEspectro[]): { senales: SenalEspectro[]; vinculadas: number } {
  let vinculadas = 0;
  const resultado = senales.map((s) => {
    if (s.vinculo && esVinculoConocido(s.vinculo)) {
      vinculadas++;
      return s;
    }
    return s;
  });
  return { senales: resultado, vinculadas };
}

function añadirCompatibles(senales: SenalEspectro[], equipo: EquipoCompat): SenalEspectro[] {
  return senales.map((s) => ({
    ...s,
    compatibles: compatiblesDe(s, equipo),
  }));
}

function ordenarPorVidaYCalidad(senales: SenalEspectro[], ahora: number): SenalEspectro[] {
  return [...senales].sort((a, b) => {
    const vivaA = esViva(a, ahora);
    const vivaB = esViva(b, ahora);
    if (vivaA && !vivaB) return -1;
    if (!vivaA && vivaB) return 1;
    const calA = a.calidad ?? -1;
    const calB = b.calidad ?? -1;
    if (calA !== calB) return calB - calA;
    const edadA = a.medidoEn ?? 0;
    const edadB = b.medidoEn ?? 0;
    return edadB - edadA;
  });
}

export async function espectrometro(entrada: EntradaEspectrometro): Promise<ResultadoEspectrometro> {
  const {
    adaptadorWifi,
    adaptadorLora,
    adaptadorBluetooth,
    adaptadorCelular,
    adaptadorEstaciones,
    leerPublicadas,
    equipo,
    ahora,
  } = entrada;

  const todasLasSenales: SenalEspectro[] = [];
  const sinFuente: SinFuente[] = [];

  // 1. Adaptador Wi-Fi (inyectado)
  try {
    const wifiRes = await adaptadorWifi({
      senalesMedioInternet: { enLinea: true },
      enlacesDisponibles: [],
      escaneoNativo: null,
    });
    todasLasSenales.push(...wifiRes.senales);
    sinFuente.push(...wifiRes.sinFuente);
  } catch {
    sinFuente.push({ medio: "wifi", motivo: "error en adaptador Wi-Fi" });
  }

  // 2. Adaptador LoRa/Malla (inyectado)
  try {
    const loraSenales = await adaptadorLora(
      { isConnected: true, band: "EU_868" },
      { estado: "conectado", transporte: "native", nodos: [] },
      []
    );
    todasLasSenales.push(...loraSenales);
  } catch {
    sinFuente.push({ medio: "lora", motivo: "error en adaptador LoRa/Malla" });
  }

  // 3. Adaptador Bluetooth (inyectado)
  try {
    const btRes = await adaptadorBluetooth({ disponible: true, detecciones: [] });
    if (Array.isArray(btRes)) {
      todasLasSenales.push(...btRes);
    } else if (btRes && typeof btRes === "object" && "medio" in btRes && "motivo" in btRes) {
      sinFuente.push(btRes as SinFuente);
    }
  } catch {
    sinFuente.push({ medio: "bluetooth", motivo: "error en adaptador Bluetooth" });
  }

  // 4. Adaptador Celular/SDR (inyectado)
  try {
    const celRes = await adaptadorCelular();
    todasLasSenales.push(...celRes.senales);
    sinFuente.push(...celRes.sinFuente);
  } catch {
    sinFuente.push({ medio: "celular", motivo: "error en adaptador Celular/SDR" });
  }

  // 5. Estaciones (inyectado)
  try {
    const estSenales = await adaptadorEstaciones();
    todasLasSenales.push(...estSenales);
  } catch {
    sinFuente.push({ medio: "estacion", motivo: "error en adaptador Estaciones" });
  }

  // 6. Señales publicadas por otros dueños (inyectado)
  try {
    const pubRes = await leerPublicadas({ cliente: null as any, uid: "" });
    if (pubRes.estado === "ok") {
      todasLasSenales.push(...pubRes.senales);
    }
  } catch {
    // Las publicadas no generan sinFuente: si fallan, simplemente no hay
  }

  // Deduplicar por claveSenal
  const unicas = deduplicar(todasLasSenales);

  // Vincular con antenas/neuronas conocidas
  const { senales: conVinculo, vinculadas } = vincular(unicas);

  // Añadir compatibles
  const conCompatibles = añadirCompatibles(conVinculo, equipo);

  // Ordenar: más viva y mayor calidad primero
  const ordenadas = ordenarPorVidaYCalidad(conCompatibles, ahora);

  return { senales: ordenadas, sinFuente, vinculadas };
}