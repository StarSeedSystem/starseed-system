'use client';

// Motor de la retícula SiO₂ (MC1012Q/MC1012W2): UNA instancia por módulo y el
// montaje sin UI que la arranca con las capas reales de esta neurona.

import { useEffect } from 'react';
import { useCristal } from '@/lib/malla/cristal/usar-cristal';
import { crearMotorCristal } from '@/lib/malla/cristal/motor';
import { crearDifusor, teselaDeSobre } from '@/lib/malla/cristal/difusion-teselas';
import { senalesDeNodosMesh, senalesDeRutasWebRTC, senalesDeVecinosFaro } from '@/lib/malla/cristal/medidas-locales';
import type { NeuronaReticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';
import { identidadDispositivo } from '@/lib/network/identidad-dispositivo';
import { claseRam } from '@/lib/network/malla-neuronas';
import { getSharedMesh } from '@/lib/network/lan-sync';
import { enviarAPar, onMensajeDePar, vinculosActivos } from '@/lib/network/vinculos-entre-cuentas';
import { crearBucle } from '@/lib/network/bucle-fondo';
import { getMeshState } from '@/ai/astraura/mesh/store';
import { resumirRuta } from '@/lib/network/estadisticas-enlace';
import { tick } from '@/ai/astraura/mesh/logical-clock';
import { signContent, verifyContent } from '@/ai/astraura/mesh/mesh-identity';
import { esAppNativa, puenteNativo } from '@/lib/nativa/puente';

const MEDIOS_LOCALES: NeuronaReticula['medios'] = ['wifi-lan', 'webrtc'];

/** Neurona local con la misma banda de RAM que ya calcula la malla de neuronas. */
function neuronaLocal(): NeuronaReticula {
  try {
    const identidad = identidadDispositivo();
    const banda = claseRam((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    const ramGb = banda === '≤4 GB' ? 4 : banda === '16 GB' ? 16 : banda === '>16 GB' ? 32 : 8;
    return { id: identidad.neuronDeviceId || identidad.meshDeviceId || identidad.syncDeviceId, cuenta: '', capacidad: { ramGb, bateriaPct: null, cargando: false }, medios: MEDIOS_LOCALES };
  } catch {
    return { id: '', cuenta: '', capacidad: { ramGb: 8, bateriaPct: null, cargando: false }, medios: MEDIOS_LOCALES };
  }
}

/** Difusor de teselas por los canales reales que ya existen (malla y vínculos). */
const difundirTesela = crearDifusor({
  broadcastMalla: (texto: string) => { try { return getSharedMesh()?.broadcast(texto) ?? 0; } catch { return 0; } },
  enviarAPares: (texto: string) => { try { for (const v of vinculosActivos()) enviarAPar(v.vinculoId, texto); } catch { /* sin vínculos */ } },
});

/** La firma viaja con `s` y la clave pública `k`: así nadie necesita registro previo. */
async function firmarTesela(tesela: Tesela): Promise<string | null> {
  try { const firma = await signContent(tesela); return firma ? JSON.stringify({ s: firma.s, k: firma.k }) : null; } catch { return null; }
}

/** Intervalo del bucle dentro del rango del contrato (5–60 s). */
function acotarIntervalo(ms: number): number {
  return Number.isFinite(ms) ? Math.min(60_000, Math.max(5_000, ms)) : 15_000;
}

/** Mide lo que ya oyen las capas reales: radar mesh, peers WebRTC y faro nativo. */
async function medirReticula(): Promise<SenalMedida[]> {
  const yo = neuronaLocal().id, ahora = Date.now(), salida: SenalMedida[] = [];
  try {
    salida.push(...senalesDeNodosMesh(yo, getMeshState().nodes.map((n) => ({ id: n.id ?? String(n.num), snr: n.snr, rssi: n.rssi, lastHeard: n.lastHeard })), ahora));
  } catch { /* sin radio LoRa: las demás fuentes siguen */ }
  const malla = getSharedMesh();
  if (malla) {
    const rutas: Array<{ par: string; clase: string; rttMs?: number }> = [];
    for (const peer of malla.getPeers()) {
      if (peer.state !== 'connected' || !peer.channelOpen) continue;
      let rttMs: number | undefined, clase = 'internet-directo';
      try {
        const stats = malla.getStats ? await malla.getStats(peer.deviceId) : null;
        if (stats) {
          const ruta = resumirRuta(stats, ahora);
          rttMs = ruta.rttMs ?? undefined;
          clase = ruta.clase === 'misma-red-local' ? 'misma-lan' : ruta.clase === 'reenviado-turn' ? 'turn' : clase;
        }
      } catch { /* sin estadísticas: el peer sigue siendo una medida viva */ }
      rutas.push({ par: peer.deviceId, clase, rttMs });
    }
    salida.push(...senalesDeRutasWebRTC(yo, rutas, ahora));
  }
  if (esAppNativa()) {
    try {
      const estado = await puenteNativo().antenasEstado();
      if (estado.ok) salida.push(...senalesDeVecinosFaro(yo, estado.valor.vecinos.map((v) => ({ neurona: v.neurona, visto_ms: ahora - Math.max(0, v.visto_hace_s) * 1000 })), ahora));
    } catch { /* la app nativa no respondió: se mide con lo que haya */ }
  }
  return salida;
}

/** Una tesela solo entra si su firma verifica; las falsas se descartan. */
async function firmaValida(tesela: Tesela): Promise<boolean> {
  if (!tesela.firma) return false;
  const cuerpo: Tesela = { ...tesela };
  delete cuerpo.firma;
  try {
    const sobre = JSON.parse(tesela.firma) as { s?: unknown; k?: unknown } | null;
    if (!sobre || typeof sobre.s !== 'string' || !sobre.k || typeof sobre.k !== 'object') return false;
    return await verifyContent(cuerpo, sobre.s, sobre.k as JsonWebKey);
  } catch { return false; }
}

async function recibirTesela(texto: string): Promise<void> {
  const tesela = teselaDeSobre(texto);
  if (!tesela) return;
  try { if (await firmaValida(tesela)) MOTOR.recibir(tesela); } catch { /* tesela mala */ }
}

/** El motor ÚNICO del módulo: se crea una sola vez, sin UI y sin tocar red al importar. */
const MOTOR = crearMotorCristal({
  miNeurona: neuronaLocal, medir: medirReticula, reloj: tick,
  firmar: firmarTesela, difundir: difundirTesela, ahora: () => Date.now(),
});

let montajes = 0;
let bucle: ReturnType<typeof crearBucle> | null = null;
let enlaceMalla: { handle: unknown; quitar: () => void } | null = null;
let quitarPares: (() => void) | null = null;

/** Se engancha al mesh compartido en cuanto exista (puede crearse después del montaje). */
function asegurarEnlaceMalla(): void {
  const malla = getSharedMesh();
  if (!malla || enlaceMalla?.handle === malla) return;
  enlaceMalla?.quitar();
  try { enlaceMalla = { handle: malla, quitar: malla.onPeer({ onMessage: (_peer, data) => { void recibirTesela(data); } }) }; } catch { enlaceMalla = null; }
}

/** Arranca UNA vez el bucle de fondo (líder + visible) y devuelve la baja. */
function iniciarMotorCristal(): () => void {
  montajes += 1;
  if (montajes === 1) {
    asegurarEnlaceMalla();
    try { quitarPares = onMensajeDePar((_vinculo, data) => { void recibirTesela(data); }); } catch { quitarPares = null; }
    bucle = crearBucle({
      nombre: 'reticula-sio2', intervaloMs: acotarIntervalo(MOTOR.intervaloMs()),
      soloLider: true, pausarOculta: true,
      tarea: async () => {
        asegurarEnlaceMalla();
        await MOTOR.vuelta();
        return { siguienteMs: acotarIntervalo(MOTOR.intervaloMs()) };
      },
    });
    bucle.iniciar();
  }
  return () => {
    montajes = Math.max(0, montajes - 1);
    if (montajes > 0) return;
    bucle?.detener(); bucle = null;
    enlaceMalla?.quitar(); enlaceMalla = null;
    quitarPares?.(); quitarPares = null;
  };
}

export function useMotorCristal() {
  return useCristal(MOTOR);
}

export function MotorCristalMount(): null {
  useEffect(() => iniciarMotorCristal(), []);
  return null;
}
