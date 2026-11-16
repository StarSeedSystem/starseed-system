/**
 * compatibilidad — qué se puede enlazar con cada señal y qué falta (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Solo dice «posible» cuando ESTE aparato tiene el dato que lo demuestra; sin dato suficiente
 * devuelve `posible:false` y lo explica: nada se supone. Privacidad (Alex, 14-11,
 * `architecture/mapa-de-senales.md` §2 y §12): aquí no se enlaza una posición exacta.
 * Puro: sin React, sin red, sin `node:*`.
 */
import { BANDAS_CONOCIDAS, bandaDeFrecuencia, etiquetaFrecuencia, type BandaConocida } from "./bandas";
import type { Compatibilidad, Medio, SenalEspectro } from "./tipos";
/** Lo que ESTE aparato declara de sí mismo: radios, región LoRa y si hay un SDR. */
export interface EquipoCompat {
  radios: readonly Medio[];
  regionLora?: string;
  sdr?: boolean;
}
/** Motivo literal cuando falta el dato. */
export const MOTIVO_SIN_DATOS = "sin datos para saberlo";
type RadioEnlazable = "wifi" | "bluetooth" | "lora" | "celular"; type Base = { con: Compatibilidad["con"]; que: string };
const CON_SDR: readonly Medio[] = ["wifi", "bluetooth", "lora", "celular", "sdr"];
/** Región del firmware Meshtastic → banda conocida de `bandas.ts`. */
const REGION_A_BANDA: Readonly<Record<string, string>> = {
  EU_433: "lora-433", UA_433: "lora-433", MY_433: "lora-433",
  EU_868: "lora-868", UA_868: "lora-868", RU: "lora-868", IN: "lora-868", NZ_865: "lora-868",
  US: "lora-915", ANZ: "lora-915", KR: "lora-915", TW: "lora-915", MY_919: "lora-915", SG_923: "lora-915", TH: "lora-915", JP: "lora-915",
  LORA_24: "lora-2.4",
};
/** Transporte que habla cada radio de ESTE aparato en la malla de StarSeed. */
const TRANSPORTES_DE_RADIO: Readonly<Partial<Record<Medio, readonly string[]>>> = {
  bluetooth: ["ble"], lora: ["lora"], wifi: ["local"],
  internet: ["cuenta", "par", "rele"], celular: ["cuenta", "par", "rele"],
  malla: ["local", "nativo", "cuenta", "par", "rele", "serial", "daemon", "simulator"],
};
const ALIAS_TRANSPORTE: Readonly<Record<string, string>> = {
  ble: "ble", bluetooth: "ble", lora: "lora", local: "local", wifi: "local",
  nativo: "nativo", serial: "serial", daemon: "daemon", simulator: "simulator",
  cuenta: "cuenta", internet: "cuenta", par: "par", rele: "rele",
};
const SIN_RADIO: Readonly<Record<RadioEnlazable, string>> = {
  wifi: "este aparato no declara Wi-Fi que el sistema deje usar",
  bluetooth: "este aparato no tiene Bluetooth que el sistema deje usar",
  lora: "este aparato no tiene radio LoRa",
  celular: "este aparato no declara radio celular que el sistema deje usar",
};
const ETIQUETA: Readonly<Record<RadioEnlazable, string>> = { wifi: "Wi-Fi", bluetooth: "Bluetooth", lora: "LoRa", celular: "celular" };

function radiosDe(equipo: EquipoCompat): readonly Medio[] {
  return Array.isArray(equipo.radios) ? equipo.radios : [];
}
function esRadioEnlazable(m: Medio): m is RadioEnlazable {
  return m === "wifi" || m === "bluetooth" || m === "lora" || m === "celular";
}
function compatibilidadRadio(senal: SenalEspectro, equipo: EquipoCompat): Compatibilidad | null {
  const medio = senal.medio;
  if (!esRadioEnlazable(medio)) return null;
  const base: Base = { con: medio, que: `enlazar por ${ETIQUETA[medio]}` };
  if (!radiosDe(equipo).includes(medio)) return { ...base, posible: false, motivo: SIN_RADIO[medio] };
  if (medio === "lora") return compatibilidadLora(senal, equipo, base);
  return { ...base, posible: true, motivo: `este aparato declara radio ${ETIQUETA[medio]} que el sistema deja usar` };
}
function compatibilidadLora(senal: SenalEspectro, equipo: EquipoCompat, base: Base): Compatibilidad {
  const region = equipo.regionLora?.trim().toUpperCase();
  if (!region) return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: este aparato no declara su región LoRa` };
  const id = REGION_A_BANDA[region];
  const banda: BandaConocida | undefined = id ? BANDAS_CONOCIDAS[id] : undefined;
  if (!banda) return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: la región «${region}» no tiene banda conocida` };
  const khz = senal.frecuenciaKhz;
  if (khz === null || !Number.isFinite(khz) || khz <= 0) return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: la señal no dice su frecuencia` };
  if (!bandaDeFrecuencia(khz)) return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: ${Math.round(khz)} kHz no cae en ninguna banda conocida` };
  if (khz < banda.inicioKhz || khz > banda.finKhz) {
    return { ...base, posible: false, motivo: `tu región LoRa es ${region} (${etiquetaFrecuencia(banda.centroKhz)}) y esa señal está en ${etiquetaFrecuencia(khz)}: no se pueden enlazar` };
  }
  return { ...base, posible: true, motivo: `las dos usan la misma banda ${banda.etiqueta} (región ${region})` };
}
/** En una señal de malla, `banda` dice qué transporte habla. */
function compatibilidadMalla(senal: SenalEspectro, equipo: EquipoCompat): Compatibilidad {
  const base: Base = { con: "neurona", que: "enlazar con una neurona" };
  const transporte = ALIAS_TRANSPORTE[senal.banda.trim().toLowerCase()];
  if (!transporte) return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: esa señal no dice por qué transporte viaja` };
  const hablados = new Set<string>();
  for (const radio of radiosDe(equipo)) for (const t of TRANSPORTES_DE_RADIO[radio] ?? []) hablados.add(t);
  if (!hablados.has(transporte)) return { ...base, posible: false, motivo: `este aparato no habla el transporte «${transporte}» que usa esa señal` };
  return { ...base, posible: true, motivo: `ambas hablan el transporte «${transporte}»; el enlace no revela una posición exacta` };
}
function compatibilidadEstacion(senal: SenalEspectro): Compatibilidad {
  const base: Base = { con: "estacion", que: "ver la estación" };
  switch (senal.capa) {
    case "propia":
      return { ...base, posible: true, motivo: "es tu estación: la capa propia te deja verla" };
    case "publica":
      return { ...base, posible: true, motivo: "está publicada; en la capa pública solo se ve lo que su dueño publicó, nunca una posición exacta" };
    case "comunidad":
      return { ...base, posible: true, motivo: "su dueño la comparte con la comunidad; se ve solo lo que publicó, nunca una posición exacta" };
    case "privada":
      return { ...base, posible: false, motivo: "es una estación privada que no es tuya: sin su invitación o su llave no se puede ver" };
    default:
      return { ...base, posible: false, motivo: `${MOTIVO_SIN_DATOS}: la capa externa no dice si esta estación se puede ver` };
  }
}
function compatibilidadSdr(senal: SenalEspectro, equipo: EquipoCompat): Compatibilidad | null {
  if (!CON_SDR.includes(senal.medio)) return null;
  const posible = equipo.sdr === true;
  return {
    con: "sdr", que: "escuchar la señal con un SDR", posible,
    motivo: posible ? "este aparato tiene un SDR conectado que puede escuchar esa banda" : "este aparato no tiene un SDR para escuchar esa banda",
  };
}
export function compatiblesDe(senal: SenalEspectro, equipo: EquipoCompat): Compatibilidad[] {
  if (!senal || typeof senal !== "object" || !equipo || typeof equipo !== "object") return [];
  const out: Compatibilidad[] = [];
  if (senal.medio === "malla") out.push(compatibilidadMalla(senal, equipo));
  else if (senal.medio === "estacion") out.push(compatibilidadEstacion(senal));
  else {
    const radio = compatibilidadRadio(senal, equipo);
    if (radio) out.push(radio);
  }
  const sdr = compatibilidadSdr(senal, equipo);
  if (sdr) out.push(sdr);
  return out;
}
