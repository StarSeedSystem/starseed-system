"use client";

/**
 * motor-cristal-mount — el motor ÚNICO de la retícula SiO₂ (malla cristalina, MC1012W),
 * singleton a nivel de módulo sobre el motor puro de MC1012Q. Mide con las capas reales
 * (radar mesh, malla de neuronas WebRTC y, en la app nativa, el faro UDP); firmas y
 * difusión por el mesh compartido y los vínculos entre cuentas; recibos con firma verificada.
 */
import { useEffect } from "react";
import { crearMotorCristal } from "@/lib/malla/cristal/motor";
import { crearDifusor, teselaDeSobre } from "@/lib/malla/cristal/difusion-teselas";
import { senalesDeNodosMesh, senalesDeRutasWebRTC, senalesDeVecinosFaro, type NodoMeshMedido, type RutaWebRTCMedida, type VecinoFaroMedido } from "@/lib/malla/cristal/medidas-locales";
import type { NeuronaReticula, SenalMedida, Tesela } from "@/lib/malla/cristal/tipos";
import { claseRam, snapshotMallaNeuronas, type ClaseRam } from "@/lib/network/malla-neuronas";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { getSharedMesh } from "@/lib/network/lan-sync";
import { crearBucle } from "@/lib/network/bucle-fondo";
import { signContent, verifyContent } from "@/ai/astraura/mesh/mesh-identity";
import { tick, observe } from "@/ai/astraura/mesh/logical-clock";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import { enviarAPar, onMensajeDePar, vinculosActivos } from "@/lib/network/vinculos-entre-cuentas";
import { getMeshState } from "@/ai/astraura/mesh/store";
import { useCristal } from "@/lib/malla/cristal/usar-cristal";
/** Estado de la retícula que pinta PanelReticula (misma figura que motor.estado()). */
type Motor = ReturnType<typeof crearMotorCristal>;
export type EstadoCristal = ReturnType<Motor["estado"]>;
const RAM_GB: Record<ClaseRam, number> = { "≤4 GB": 4, "8 GB": 8, "16 GB": 16, ">16 GB": 32, desconocida: 8 };

function miId(): string {
  try { const id = identidadDispositivo(); return id.meshDeviceId || id.neuronDeviceId || getMeshState().self?.id || "neurona-local"; }
  catch { return "neurona-local"; }
}

function miNeurona(): NeuronaReticula {
  const nav = typeof navigator === "undefined" ? null : navigator as Navigator & { deviceMemory?: number };
  return { id: miId(), cuenta: "", medios: [], capacidad: { ramGb: RAM_GB[claseRam(nav?.deviceMemory)], bateriaPct: null, cargando: false } };
}

/** Medidas de las capas reales; sin ninguna (sin WebRTC, sin nativo) lista vacía. Nunca lanza. */
async function medir(): Promise<SenalMedida[]> {
  const yo = miId(), ahora = Date.now(), salida: SenalMedida[] = [];
  try {
    salida.push(...senalesDeNodosMesh(yo, getMeshState().nodes.map((n) => ({ id: n.id ?? "", snr: n.snr, rssi: n.rssi, lastHeard: n.lastHeard })), ahora));
  } catch { /* sin radar de radio */ }
  try {
    salida.push(...senalesDeRutasWebRTC(yo, snapshotMallaNeuronas().misDispositivos.filter((f) => f.enlace.estado === "conectado" && f.syncDeviceId).map((f) => ({ par: f.syncDeviceId ?? "", clase: f.enlace.ruta?.clase === "misma-red-local" ? "misma-lan" : "internet-directo", rttMs: f.enlace.latenciaMs ?? f.enlace.ruta?.rttMs ?? undefined })), ahora));
  } catch { /* sin malla de neuronas WebRTC */ }
  if (esAppNativa()) try {
    const est = await puenteNativo().antenasEstado();
    if (est.ok) salida.push(...senalesDeVecinosFaro(yo, est.valor.vecinos.map((v) => ({ neurona: v.neurona, visto_ms: est.valor.medido_ms - v.visto_hace_s * 1000 })), ahora));
  } catch { /* sin faro nativo: las demás medidas bastan */ }
  return salida;
}
let miPublica: JsonWebKey | null = null;

async function firmar(t: Tesela): Promise<string | null> {
  try {
    const r = await signContent(t);
    miPublica = r?.k ?? null; // la clave sale con el sobre para que el receptor verifique
    return r?.s ?? null;
  } catch { return null; }
}

const conClave = (texto: string): string => {
  try { return miPublica ? JSON.stringify({ ...JSON.parse(texto), k: miPublica }) : texto; }
  catch { return texto; }
};

const difusor = crearDifusor({
  broadcastMalla: (texto: string) => getSharedMesh()?.broadcast(conClave(texto)) ?? 0,
  enviarAPares: (texto: string) => {
    for (const v of vinculosActivos()) enviarAPar(v.vinculoId, conClave(texto));
  },
});

const esClavePublica = (x: unknown): x is JsonWebKey =>
  typeof x === "object" && x !== null && typeof (x as JsonWebKey).x === "string" && typeof (x as JsonWebKey).y === "string";
/** Solo teselas firmadas por quien las envió entran en la retícula. */
async function teselaEntrante(texto: string): Promise<void> {
  try {
    const t = teselaDeSobre(texto);
    if (!t || t.origen === miId()) return;
    const clave = (JSON.parse(texto) as { k?: unknown }).k;
    const { firma, ...sinFirma } = t;
    if (!firma || !esClavePublica(clave) || !(await verifyContent(sinFirma, firma, clave))) return;
    observe(t.reloj); motor?.recibir(t);
  } catch { /* texto ajeno, corrupto o firma inválida: se descarta */ }
}

let motor: Motor | null = null;

function motorCristal(): Motor {
  if (!motor) {
    motor = crearMotorCristal({
      miNeurona, medir, reloj: tick, firmar,
      difundir: (t: Tesela) => difusor(t), ahora: () => Date.now(),
    });
  }
  return motor;
}
let bucle: ReturnType<typeof crearBucle> | null = null;
let bajaMalla: (() => void) | null = null;

function arrancar(): () => void {
  const m = motorCristal();
  const bajaPares = onMensajeDePar((_, texto: string) => void teselaEntrante(texto));
  if (!bucle) {
    bucle = crearBucle({
      nombre: "cristal-reticula",
      consulta: "vuelta de la retícula SiO₂ (sin Supabase)",
      intervaloMs: m.intervaloMs(),
      tarea: async () => {
        bajaMalla ??= getSharedMesh()?.onPeer({ onMessage: (_, texto: string) => void teselaEntrante(texto) }) ?? null;
        await motorCristal().vuelta();
        return { siguienteMs: motorCristal().intervaloMs() }; // cadencia por estado vítreo (5–60 s)
      },
    });
    bucle.iniciar(); // solo pestaña líder y solo con el aparato visible
  }
  return () => { bajaPares(); bajaMalla?.(); bajaMalla = null; bucle?.detener(); bucle = null; };
}

/** useMotorCristal — el estado() del motor ÚNICO, vivo (degrada a retícula vacía). */
export function useMotorCristal(): EstadoCristal {
  return useCristal(motorCristal());
}

/** MotorCristalMount — sin UI: arranca el motor al montarse y lo detiene al desmontarse. */
export function MotorCristalMount(): null {
  useEffect(() => arrancar(), []);
  return null;
}
