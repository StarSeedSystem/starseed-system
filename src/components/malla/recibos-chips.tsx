import { Clock, Check, CheckCircle, Eye, Globe, Share2, PhoneCall, Radio, PhoneOff, AlertTriangle } from 'lucide-react';
import type { Recibo } from '@/lib/malla/cristal/recibos';
import type { Medio } from '@/lib/malla/cristal/tipos';

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
    </span>
  );
}