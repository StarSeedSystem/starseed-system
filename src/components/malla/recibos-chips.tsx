'use client';

import { useCallback, useMemo } from 'react';
import { Clock, Check, CheckCircle, Eye, Globe, Share2, PhoneCall, Radio, PhoneOff, AlertTriangle } from 'lucide-react';
import type { Recibo } from '@/lib/malla/cristal/recibos';
import type { Medio, NeuronaReticula, Tesela, SenalMedida } from '@/lib/malla/cristal/tipos';
import { crearMotorCristal } from '@/lib/malla/cristal/motor';
import { useCristal } from '@/lib/malla/cristal/usar-cristal';
import { getMeshState } from '@/ai/astraura/mesh/store';
import { identidadDispositivo } from '@/lib/network/identidad-dispositivo';
import { enviarMensaje } from '@/lib/malla/transporte-universal';
import { signContent } from '@/ai/astraura/mesh/mesh-identity';
import type { SobreMensaje } from '@/lib/malla/transporte-universal';
import type { NodoMeshMedido, EnlaceLocalMedido } from '@/lib/malla/cristal/medidas-locales';
import { senalesDeNodosMesh, senalesDeEnlacesLocales } from '@/lib/malla/cristal/medidas-locales';
import { enlacesLocalesVivos } from '@/lib/malla/registro-enlaces-locales';
import type { EnlaceLocalVivo } from '@/lib/malla/registro-enlaces-locales';

const medioTexto = (medio: Medio | null): string => {
  if (!medio) return '';
  switch (medio) {
    case 'lora': return 'LoRa';
    case 'ble': return 'BLE';
    case 'wifi-lan': return 'Wi‑Fi';
    case 'webrtc': return 'WebRTC';
    case 'wifi-mesh': return 'malla Wi‑Fi';
    case 'reticulum': return 'Reticulum';
    case 'serie': return 'Serie';
    case 'servidor': return 'Servidor';
    case 'nfc': return 'NFC';
    default: return medio;
  }
};

const iconoPorEstado = (estado: Recibo['estado']) => {
  switch (estado) {
    case 'preparado': return Clock;
    case 'enviado': return Check;
    case 'recibido': return CheckCircle;
    case 'leido': return Eye;
    case 'publicado': return Globe;
    case 'propagado': return Share2;
    case 'llamando': return PhoneCall;
    case 'en-directo': return Radio;
    case 'terminada': return PhoneOff;
    case 'fallido': return AlertTriangle;
    default: return Clock;
  }
};

const textoPorEstado = (estado: Recibo['estado']): string => {
  switch (estado) {
    case 'preparado': return 'Preparado';
    case 'enviado': return 'Enviado';
    case 'recibido': return 'Recibido';
    case 'leido': return 'Leído';
    case 'publicado': return 'Publicado';
    case 'propagado': return 'Propagado';
    case 'llamando': return 'Llamando';
    case 'en-directo': return 'En directo';
    case 'terminada': return 'Terminada';
    case 'fallido': return 'Fallido';
    default: return 'Desconocido';
  }
};

export function RecibosChips({ recibo }: { recibo: Recibo }) {
  // Create dependencies for the crystal motor
  const miNeurona = useCallback((): NeuronaReticula => {
    const state = getMeshState();
    const self = state.self;
    return {
      id: self?.id ?? '',
      cuenta: '',
      capacidad: {
        ramGb: 8,
        bateriaPct: null,
        cargando: false
      },
      medios: []
    };
  }, []); // Assuming getMeshState is stable (imported)

  const medir = useCallback(async (): Promise<SenalMedida[]> => {
    const state = getMeshState();
    const yo = state.self?.id ?? '';
    const ahora = Date.now();
    const salida: SenalMedida[] = [];

    // Mesh nodes
    try {
      const nodos: NodoMeshMedido[] = state.nodes.map(n => ({
        id: n.id ?? '',
        snr: n.snr,
        rssi: n.rssi,
        lastHeard: n.lastHeard
      }));
      salida.push(...senalesDeNodosMesh(yo, nodos, ahora));
    } catch (e) {
      console.warn('Failed to get mesh nodes for cristal medir', e);
    }

    // Local enlaces
    try {
      const locales = enlacesLocalesVivos();
       const enlacesMedido: EnlaceLocalMedido[] = locales.map((e: EnlaceLocalVivo) => ({
         id: e.id,
         tipo: e.par.plataforma ? 'webrtc' : undefined,
         par: e.par.neuronDeviceId ?? e.par.syncDeviceId ?? undefined,
         rttMs: e.rttMs() ?? undefined
       }));
      salida.push(...senalesDeEnlacesLocales(yo, enlacesMedido, ahora));
    } catch (e) {
      console.warn('Failed to get local enlaces for cristal medir', e);
    }

    return salida;
  }, []); // Assuming getMeshState, enlacesLocalesVivos, senalesDeNodosMesh, senalesDeEnlacesLocales are stable

  const reloj = useCallback((): number => Date.now(), []);
  const ahoraFunc = useCallback((): number => Date.now(), []);

  const firmar = useCallback(async (t: Tesela): Promise<string | null> => {
    try {
      const result = await signContent(t);
      return result ? result.s : null;
    } catch {
      return null;
    }
  }, []); // Assuming signContent is stable

  const difundir = useCallback((t: Tesela): void => {
    try {
      const sobre: SobreMensaje = {
        t: 'tu.msg',
        v: 1,
        id: crypto.randomUUID(),
        c: 'tesela',
        b: t,
        de: { s: identidadDispositivo().syncDeviceId }
      };
      enviarMensaje({}, 'tesela', sobre, {});
    } catch (e) {
      console.warn('Failed to disseminate tesela', e);
    }
  }, []); // Assuming enviarMensaje, identidadDispositivo, crypto.randomUUID are stable

  const motor = useMemo(() => crearMotorCristal({
    miNeurona,
    medir,
    reloj,
    firmar,
    difundir,
    ahora: ahoraFunc
  }), [miNeurona, medir, reloj, firmar, difundir, ahoraFunc]);

  const estado = useCristal(motor);

  const Icon = iconoPorEstado(recibo.estado);
  const medio = medioTexto(recibo.medio);
  const estadoTexto = textoPorEstado(recibo.estado);
  const rutaTexto = recibo.ruta.length > 0 ? recibo.ruta.join(' → ') : '';
  const ariaLabel = medio
    ? `por ${medio}: ${rutaTexto}`
    : rutaTexto
    ? `ruta: ${rutaTexto}`
    : `estado: ${estadoTexto}`;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted/20 text-muted-foreground"
      aria-label={ariaLabel}
    >
      <Icon className="h-3 w-3" />
      <span className="whitespace-nowrap">{estadoTexto}</span>
      {medio && <span className="whitespace-nowrap">{medio}</span>}
      {/* Debug: show crystal motor state */}
      {/* <div className="text-xs mt-1">{JSON.stringify(estado)}</div> */}
    </span>
  );
}