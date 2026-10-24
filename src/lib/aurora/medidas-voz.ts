"use client";

import { safeGet, safeSet } from "@/lib/safe-storage";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

export interface MedidaVoz {
  neurona: string;
  motor: string;
  tipo:
    | "primer-sonido"
    | "tiempo-real-oido"
    | "tiempo-real-voz"
    | "correccion";
  valor: number;
  timestamp: number;
}

const CLAVE = "starseed.voz.medidas.v2";

export function leerMedidas(neurona?: string): MedidaVoz[] {
  try {
    const raw = safeGet(CLAVE);
    if (!raw) return [];
    const todas = JSON.parse(raw) as MedidaVoz[];
    if (!Array.isArray(todas)) return [];
    return neurona ? todas.filter((m) => m.neurona === neurona) : todas;
  } catch {
    return [];
  }
}

export function anotarMedida(p: {
  neurona?: string;
  motor: string;
  tipo: MedidaVoz["tipo"];
  valor: number;
}): void {
  try {
    const destino = p.neurona ?? neuronDeviceIdActual();
    const ts = Date.now();
    const medida: MedidaVoz = { neurona: destino, motor: p.motor, tipo: p.tipo, valor: p.valor, timestamp: ts };
    const todas = leerMedidas();
    const actualizadas = [...todas, medida];
    safeSet(CLAVE, JSON.stringify(actualizadas));
  } catch {
    // sin almacenamiento
  }
}

export function medidasDe(neurona: string): {
  mediaMovil: number;
  p90: number;
  recientes: number;
} | null {
  const medidas = leerMedidas(neurona);
  if (!medidas.length) return null;

  const ultimos50 = medidas.slice(-50);

  const valores = ultimos50.map((m) => m.valor).filter((v) => typeof v === "number" && isFinite(v));
  if (!valores.length) return null;

  const media = valores.reduce((a, b) => a + b, 0) / valores.length;

  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.ceil(ordenados.length * 0.9) - 1;
  const p90 = ordenados[Math.max(0, idx)];

  return { mediaMovil: media, p90, recientes: valores.length };
}

export function migrarDeV1(): void {
  try {
    const viejo = safeGet("starseed.voz.medidas.v1") as any;
    if (!viejo) return;
    const datos = Array.isArray(viejo) ? viejo : [];
    const convertidas = datos
      .filter((d: any) => typeof d === "object" && typeof d.valor === "number" && typeof d.timestamp === "number")
      .map((d: any) => ({
        neurona: d.neurona || neuronDeviceIdActual(),
        motor: d.motor || "",
        tipo: d.tipo || "correccion",
        valor: d.valor,
        timestamp: d.timestamp,
      } as MedidaVoz));
    if (convertidas.length) {
      safeSet(CLAVE, JSON.stringify(convertidas));
      safeSet("starseed.voz.medidas.v1", "");
    }
  } catch {
    // migrar sin almacenamiento
  }
}

migrarDeV1();
