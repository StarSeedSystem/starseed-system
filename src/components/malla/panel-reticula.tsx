'use client';

import { Wifi, Thermometer, Hexagon, Users } from 'lucide-react';
import type { Reticula, Cristal, EstadoVitreo } from '@/lib/malla/cristal/tipos';
import { coordinacionDe } from '@/lib/malla/cristal/tipos';

export interface EstadoReticula {
  reticula: Reticula;
  cristal: Cristal;
  huella: string;
  vecinosConMismaHuella: number;
  ultimaVuelta: number;
}

export const textoEstadoVitreo = (e: EstadoVitreo): string => {
  switch (e) {
    case 'fundido': return 'fundido: las señales cambian y la red se recoloca';
    case 'subenfriado': return 'subenfriado: la red se está asentando';
    case 'vitreo': return 'vítreo: estable y congelada';
    default: return e;
  }
};

export const sentidoTemperatura = (t: number): string => {
  if (t >= 0.6) return 'Red caliente: los puentes se recolocan libremente y se añade redundancia.';
  if (t >= 0.25) return 'Red templada: los puentes se estabilizan y la histéresis crece.';
  return 'Red fría: los puentes se congelan y solo cambian si hay uno claramente mejor.';
};

export const calidadPuente = (coste: number): number =>
  Math.round(Math.max(0, Math.min(1, 1 - coste)) * 100);

export const huellaCorta = (huella: string): string => huella.slice(0, 8);

const medioTexto: Record<string, string> = {
  lora: 'LoRa', ble: 'BLE', 'wifi-lan': 'Wi‑Fi LAN', webrtc: 'WebRTC',
  'wifi-mesh': 'malla Wi‑Fi', reticulum: 'Reticulum', serie: 'serie',
  servidor: 'servidor', nfc: 'NFC',
};

export function PanelReticula({ estado }: { estado: EstadoReticula | null }) {
  if (!estado) return null;
  const { reticula, cristal, huella, vecinosConMismaHuella } = estado;
  const teselas = Object.values(reticula.teselas);
  const total = teselas.length;
  const tempMedia = total
    ? Object.values(cristal.temperatura).reduce((s, t) => s + t, 0) / Math.max(1, Object.keys(cristal.temperatura).length)
    : 0.5;
  if (total === 0) {
    return (
      <section aria-label="Retícula" className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
        <h3 className="flex items-center gap-2 font-medium text-foreground">
          <Wifi className="h-4 w-4" /> Sólido amorfo en tiempo real
        </h3>
        <p className="mt-2">Aún no llegó ninguna señal de otra neurona.</p>
      </section>
    );
  }
  const puentes = [...cristal.puentes].sort((a, b) => a.coste - b.coste);
  return (
    <section aria-label="Retícula" className="space-y-3 rounded-xl border bg-card/60 p-4">
      <h3 className="flex items-center gap-2 font-medium">
        <Wifi className="h-4 w-4" /> Sólido amorfo en tiempo real
      </h3>
      <p className="text-sm text-muted-foreground">{textoEstadoVitreo(cristal.estado)}</p>
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" /> Temperatura</span>
          <span>{Math.round(tempMedia * 100)} %</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted/40" role="progressbar" aria-valuenow={Math.round(tempMedia * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(tempMedia * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{sentidoTemperatura(tempMedia)}</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Users className="h-4 w-4" />
        <span>Misma retícula en {vecinosConMismaHuella + 1} de {total} neuronas</span>
        <code className="text-xs text-muted-foreground">{huellaCorta(huella)}</code>
      </div>
      <ul aria-label="Puentes" className="space-y-1 text-sm">
        {puentes.map((p) => (
          <li key={`${p.a}|${p.b}|${p.medio}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1">
            <span className="truncate">{p.a} ↔ {p.b}</span>
            <span className="flex whitespace-nowrap gap-2 text-xs text-muted-foreground">
              <span>{medioTexto[p.medio] ?? p.medio}</span>
              <span>{calidadPuente(p.coste)} %</span>
              <span>coste {p.coste.toFixed(2)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <h4 className="flex items-center gap-1 text-sm font-medium"><Hexagon className="h-3 w-3" /> Coordinación</h4>
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {teselas.map((t) => {
            const objetivo = coordinacionDe(t.neurona);
            const actual = cristal.coordinacion[t.origen] ?? 0;
            return (
              <li key={t.origen}>
                {t.origen}: {actual} de {objetivo} puentes
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
