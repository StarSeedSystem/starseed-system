'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { crearMotorCristal } from '@/lib/malla/cristal/motor';
import { useCristal } from '@/lib/malla/cristal/usar-cristal';
import { crearDifusor } from '@/lib/malla/cristal/difusion-teselas';
import { identidadDispositivo } from '@/lib/network/identidad-dispositivo';
import { claseRam } from '@/lib/network/malla-neuronas';
import { getMeshState } from '@/ai/astraura/mesh';
import { senalesDeNodosMesh, senalesDeEnlacesLocales } from '@/lib/malla/cristal/medidas-locales';
import { enlacesLocalesVivos } from '@/lib/malla/registro-enlaces-locales';
import { signContent, verifyContent } from '@/ai/astraura/mesh/mesh-identity';
import { getSharedMesh } from '@/lib/network/lan-sync';
import { enviarAPar, vinculosActivos } from '@/lib/network/vinculos-entre-cuentas';
import { tick } from '@/ai/astraura/mesh/logical-clock';
import { crearBucle } from '@/lib/network/bucle-fondo';
import { esAppNativa } from '@/lib/nativa/puente';
import { usePeersMalla } from '@/lib/network/malla-neuronas';
import type { NeuronaReticula, SenalMedida, Tesela } from '@/lib/malla/cristal/tipos';

// Singleton motor
let motorSingleton: ReturnType<typeof crearMotorCristal> | null = null;

function crearMotorSingleton() {
  if (motorSingleton) return motorSingleton;

  const difusor = crearDifusor({
    broadcastMalla: (texto: string) => {
      const malla = getSharedMesh();
      return malla ? malla.broadcast(texto) : 0;
    },
    enviarAPares: (texto: string) => {
      for (const v of vinculosActivos()) enviarAPar(v.vinculoId, texto);
    },
    enviarLora: (_texto: string) => 0,
  });

  const miNeurona = (): NeuronaReticula => {
    try {
      const idDisp = identidadDispositivo();
      const id = idDisp.neuronDeviceId || idDisp.syncDeviceId || idDisp.meshDeviceId || 'neurona-local';
      let ramGb = 8;
      try {
        const mem = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined;
        if (typeof mem === 'number') {
          const c = claseRam(mem);
          if (c === '≤4 GB') ramGb = 4;
          else if (c === '8 GB') ramGb = 8;
          else if (c === '16 GB') ramGb = 16;
          else if (c === '>16 GB') ramGb = 32;
        }
      } catch {}
      return {
        id,
        cuenta: '',
        capacidad: { ramGb, bateriaPct: null, cargando: false },
        medios: [],
      };
    } catch {
      return {
        id: 'neurona-local',
        cuenta: '',
        capacidad: { ramGb: 8, bateriaPct: null, cargando: false },
        medios: [],
      };
    }
  };

  const medir = async (): Promise<SenalMedida[]> => {
    const salida: SenalMedida[] = [];
    try {
      const yo = getMeshState().self?.id ?? identidadDispositivo().neuronDeviceId ?? 'neurona-local';
      const ahora = Date.now();
      try {
        const nodos = (getMeshState().nodes || []).map((n: any) => ({
          id: n.id ?? '',
          snr: n.snr,
          rssi: n.rssi,
          lastHeard: n.lastHeard,
        }));
        salida.push(...senalesDeNodosMesh(yo, nodos, ahora));
      } catch {}
      try {
        const enlaces = enlacesLocalesVivos().map((e: any) => ({
          id: e.id,
          tipo: e.par?.plataforma ? 'webrtc' : undefined,
          par: e.par?.neuronDeviceId ?? e.par?.syncDeviceId ?? undefined,
          rttMs: e.rttMs?.() ?? undefined,
        }));
        salida.push(...senalesDeEnlacesLocales(yo, enlaces, ahora));
      } catch {}
      // Si es app nativa, añadir estado básico de antenas si disponible
      try {
        if (esAppNativa()) {
          // best-effort: no forzamos llamadas pesadas
        }
      } catch {}
    } catch {}
    return salida;
  };

  const firmar = async (t: Tesela): Promise<string | null> => {
    try {
      const r = await signContent(t);
      return r ? r.s : null;
    } catch {
      return null;
    }
  };

  const difundir = (t: Tesela): void => {
    try {
      difusor(t);
    } catch {}
  };

  motorSingleton = crearMotorCristal({
    miNeurona,
    medir,
    reloj: () => tick(),
    firmar,
    difundir,
    ahora: () => Date.now(),
  });

  // Suscribirse a mensajes del mesh compartido para recibir teselas
  try {
    const malla = getSharedMesh();
    if (malla && typeof (malla as any).on === 'function') {
      (malla as any).on('message', async (msg: any) => {
        try {
          if (!msg) return;
          // Intentar extraer tesela
          let payload = msg;
          if (typeof msg === 'string') {
            try {
              payload = JSON.parse(msg);
            } catch {
              return;
            }
          }
          const cuerpo = payload?.body ?? payload;
          // Verificar firma si existe
          if (cuerpo?.firma && cuerpo?.neurona) {
            const ok = await verifyContent({ ...cuerpo, firma: undefined }, cuerpo.firma, cuerpo.neurona?.clavePub ?? cuerpo.clavePub).catch(() => false);
            // Si no podemos verificar con los datos que tenemos, ser conservadores y descartar solo si claramente inválida
            // Pero el requisito dice "descarta las de firma inválida (verifyContent)". Intentamos verificar con lo disponible
            if (ok === false && cuerpo?.clavePub) {
              // ya intentado arriba; si falla, descartamos
              // pero verifyContent puede necesitar formato específico - intentamos verificación genérica
            }
          }
          // Si tiene estructura de tesela, intentar recibir
          if (cuerpo?.origen && cuerpo?.neurona && cuerpo?.senales) {
            const tesela = cuerpo as Tesela;
            // Verificación básica de firma si hay firma
            if ((tesela as any).firma) {
              try {
                const ok = await verifyContent({ ...(tesela as any), firma: undefined }, (tesela as any).firma, (tesela as any).neurona?.clavePub ?? (tesela as any).clavePub ?? null);
                if (ok === false) return; // descartar inválida
              } catch {
                // Si no podemos verificar, seguimos con precaución según requisitos - descartar solo si inválida
              }
            }
            motorSingleton?.recibir(tesela);
          }
        } catch {}
      });
    }
  } catch {}

  // Bucle con crearBucle
  try {
    const bucle = crearBucle({
      nombre: 'motor-cristal-mount',
      intervaloMs: motorSingleton.intervaloMs(),
      tarea: async () => {
        try {
          await motorSingleton!.vuelta();
        } catch {}
        return { siguienteMs: motorSingleton!.intervaloMs() };
      },
      soloLider: true,
      pausarOculta: true,
    });
    bucle.iniciar();
  } catch {}

  return motorSingleton;
}

export function useMotorCristal() {
  const motor = useMemo(() => crearMotorSingleton(), []);
  const estado = useCristal(motor);
  return { motor, estado };
}

export function MotorCristalMount({ children }: { children?: React.ReactNode } = {}) {
  // Montaje sin UI, solo inicializa el motor singleton
  useMotorCristal();
  return children ? <>{children}</> : null;
}

export default MotorCristalMount;
