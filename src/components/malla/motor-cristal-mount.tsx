'use client';
// Motor único SiO₂ (MC1012Q): identidad, medidas reales, firma, difusión y recepción verificada.
import { useEffect } from 'react';
import { crearMotorCristal } from '@/lib/malla/cristal/motor';
import { crearDifusor, teselaDeSobre } from '@/lib/malla/cristal/difusion-teselas';
import { senalesDeNodosMesh, senalesDeRutasWebRTC, senalesDeVecinosFaro } from '@/lib/malla/cristal/medidas-locales';
import type { NeuronaReticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';
import { useCristal } from '@/lib/malla/cristal/usar-cristal';
import { identidadDispositivo, type IdentidadDispositivo } from '@/lib/network/identidad-dispositivo';
import { claseRam, alCambiarResumenMalla } from '@/lib/network/malla-neuronas';
import { getMeshState } from '@/ai/astraura/mesh/store';
import { resumirRuta } from '@/lib/network/estadisticas-enlace';
import { getSharedMesh } from '@/lib/network/lan-sync';
import { vinculosActivos, enviarAPar } from '@/lib/network/vinculos-entre-cuentas';
import { crearBucle } from '@/lib/network/bucle-fondo';
import { tick, observe } from '@/ai/astraura/mesh/logical-clock';
import { signContent, verifyContent } from '@/ai/astraura/mesh/mesh-identity';
import { esAppNativa, puenteNativo } from '@/lib/nativa/puente';

type Motor = ReturnType<typeof crearMotorCristal>;
interface FirmaTesela { s: string; k: JsonWebKey }
const MEDIOS: NeuronaReticula['medios'] = ['wifi-lan', 'webrtc', 'ble', 'lora'];
const RAM_POR_CLASE: Record<string, number> = { '≤4 GB': 4, '8 GB': 8, '16 GB': 16, '>16 GB': 32, desconocida: 4 };

const capacidadDeClase = (clase: string): NeuronaReticula['capacidad'] =>
  ({ ramGb: RAM_POR_CLASE[clase] ?? 4, bateriaPct: null, cargando: false });

function neuronaDeIdentidad(ids: Partial<IdentidadDispositivo> | null | undefined, clase = 'desconocida'): NeuronaReticula | null {
  const id = ids?.neuronDeviceId?.trim();
  if (!id) return null;
  return { id, cuenta: ids?.syncDeviceId?.trim() || id, capacidad: capacidadDeClase(clase), medios: [...MEDIOS] };
}

function miNeurona(): NeuronaReticula {
  const memoria = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  return neuronaDeIdentidad(identidadDispositivo(), claseRam(memoria)) ?? { id: '', cuenta: '', capacidad: capacidadDeClase('desconocida'), medios: [...MEDIOS] };
}

async function medir(): Promise<SenalMedida[]> {
  const ahora = Date.now();
  const yo = miNeurona().id;
  if (!yo) return [];
  const nodos = getMeshState().nodes.map((n) => ({ id: n.id, snr: n.snr, rssi: n.rssi, lastHeard: n.lastHeard }));
  const salida = senalesDeNodosMesh(yo, nodos, ahora);
  const malla = getSharedMesh();
  if (malla) for (const p of malla.getPeers()) {
    if (p.state !== 'connected' || !p.channelOpen) continue;
    let clase = 'internet-directo', rttMs: number | undefined;
    try {
      const stats = await malla.getStats?.(p.deviceId);
      const ruta = stats ? resumirRuta(stats, ahora) : null;
      if (ruta) { clase = ruta.clase === 'misma-red-local' ? 'misma-lan' : clase; rttMs = ruta.rttMs ?? undefined; }
    } catch { /* sin estadísticas: el enlace sigue contando, sin RTT */ }
    salida.push(...senalesDeRutasWebRTC(yo, [{ par: p.deviceId, clase, rttMs }], ahora));
  }
  if (esAppNativa()) {
    const r = await puenteNativo().antenasEstado();
    if (r.ok) salida.push(...senalesDeVecinosFaro(yo, r.valor.vecinos.map((v) => ({ neurona: v.neurona, visto_ms: ahora - Math.max(0, v.visto_hace_s) * 1000 })), ahora));
  }
  return salida;
}

async function firmarTesela(t: Tesela): Promise<string | null> {
  try {
    const f = await signContent(t);
    return f ? JSON.stringify({ s: f.s, k: f.k } satisfies FirmaTesela) : null;
  } catch { return null; }
}

async function teselaFirmadaValida(t: Tesela): Promise<boolean> {
  if (!t.firma) return false;
  const { firma, ...cuerpo } = t;
  try {
    const f = JSON.parse(firma) as Partial<FirmaTesela>;
    return typeof f.s === 'string' && !!f.k && await verifyContent(cuerpo, f.s, f.k);
  } catch { return false; }
}

const difusor = crearDifusor({
  broadcastMalla: (texto: string) => getSharedMesh()?.broadcast(texto) ?? 0,
  enviarAPares: (texto: string) => { for (const v of vinculosActivos()) enviarAPar(v.vinculoId, texto); },
});
const motor: Motor = crearMotorCristal({
  miNeurona, medir, reloj: tick, firmar: firmarTesela,
  difundir: (t) => { if (t.origen) difusor(t); }, ahora: () => Date.now(),
});
let mallaEnganchada: ReturnType<typeof getSharedMesh> = null;
let desenganchar: (() => void) | null = null;
function recibir(data: string): void {
  const t = teselaDeSobre(data);
  if (t) void teselaFirmadaValida(t).then((ok) => { if (ok) { observe(t.reloj); motor.recibir(t); } });
}
function engancharReceptor(): void {
  const malla = getSharedMesh();
  if (!malla || (malla === mallaEnganchada && desenganchar)) return;
  desenganchar?.();
  mallaEnganchada = malla;
  desenganchar = malla.onPeer({ onMessage: (_id, data) => recibir(data) });
}

export function MotorCristalMount() {
  useEffect(() => {
    const baja = alCambiarResumenMalla(engancharReceptor);
    engancharReceptor();
    const bucle = crearBucle({
      nombre: 'retícula SiO₂ · motor',
      intervaloMs: motor.intervaloMs(),
      tarea: async () => { engancharReceptor(); await motor.vuelta(); return { siguienteMs: motor.intervaloMs() }; },
    });
    bucle.iniciar();
    return () => { baja(); bucle.detener(); };
  }, []);
  return null;
}

export function useMotorCristal(): ReturnType<Motor['estado']> {
  return useCristal(motor);
}
