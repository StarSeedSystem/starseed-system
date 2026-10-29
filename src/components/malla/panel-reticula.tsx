'use client';
// Panel «Retícula» de la pestaña Señales: estado vítreo, temperatura media, puentes por coste
// y coordinación de cada neurona. Sin efectos: recibe el estado() del motor (MC1012Q).
import { Flame, Droplets, Snowflake, Hexagon, Router } from 'lucide-react';
import type { Cristal, EstadoVitreo, Medio, Reticula } from '@/lib/malla/cristal/tipos';
import { coordinacionDe } from '@/lib/malla/cristal/tipos';
import { esTitanio, coordinacionTitanio } from '@/lib/malla/cristal/titanio';
import { calidadSenal } from '@/lib/malla/cristal/coste';

/** Estado devuelto por motor.estado() (src/lib/malla/cristal/motor.ts). */
export interface EstadoReticula {
  reticula: Reticula; cristal: Cristal; huella: string;
  vecinosConMismaHuella: number; ultimaVuelta: number;
}
const ETIQUETA_MEDIO: Record<Medio, string> = {
  lora: 'LoRa', ble: 'BLE', 'wifi-lan': 'Wi‑Fi', 'wifi-mesh': 'malla Wi‑Fi',
  webrtc: 'WebRTC', reticulum: 'Reticulum', serie: 'Serie', servidor: 'Servidor', nfc: 'NFC',
};
const TEXTO_ESTADO: Record<EstadoVitreo, string> = {
  fundido: 'fundido: las señales cambian y la red se recoloca',
  subenfriado: 'subenfriado: la red se asienta y aún puede recolocar puentes',
  vitreo: 'vítreo: estable y congelada',
};
const ICONO_ESTADO: Record<EstadoVitreo, typeof Flame> = {
  fundido: Flame, subenfriado: Droplets, vitreo: Snowflake,
};
const COLOR_ESTADO: Record<EstadoVitreo, { texto: string; barra: string }> = {
  fundido: { texto: 'text-amber-500', barra: 'bg-amber-500' },
  subenfriado: { texto: 'text-sky-500', barra: 'bg-sky-500' },
  vitreo: { texto: 'text-cyan-400', barra: 'bg-cyan-400' },
};
const huellaCorta = (h: string): string => (h.length > 8 ? `${h.slice(0, 8)}…` : h || '—');
const temperaturaMedia = (c: Cristal): number => {
  const vals = Object.values(c.temperatura);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
};
interface FilaPuente { a: string; b: string; etiqueta: string; calidadPct: number | null; coste: number; }
function filasPuente(e: EstadoReticula): FilaPuente[] {
  const senales = Object.values(e.reticula.teselas).flatMap((t) => t.senales);
  const calidadDe = (a: string, b: string, medio: Medio): number | null => {
    const s = senales.find((x) => x.de === a && x.a === b && x.medio === medio)
      ?? senales.find((x) => x.de === b && x.a === a && x.medio === medio);
    return s ? Math.round(calidadSenal(s) * 100) : null;
  };
  return e.cristal.puentes.map((p) => ({
    a: p.a, b: p.b, etiqueta: ETIQUETA_MEDIO[p.medio],
    calidadPct: calidadDe(p.a, p.b, p.medio), coste: p.coste,
  })).sort((x, y) => x.coste - y.coste);
}
function filasCoord(e: EstadoReticula): Array<{ id: string; n: number; max: number; ti: boolean }> {
  return Object.values(e.reticula.teselas).map((t) => ({
    id: t.neurona.id,
    n: e.cristal.coordinacion[t.neurona.id] ?? 0,
    max: esTitanio(t.neurona) ? coordinacionTitanio(t.neurona) : coordinacionDe(t.neurona),
    ti: esTitanio(t.neurona),
  }));
}

export function PanelReticula({ estado }: { estado: EstadoReticula }) {
  const color = COLOR_ESTADO[estado.cristal.estado];
  const Icono = ICONO_ESTADO[estado.cristal.estado];
  const pct = Math.round(temperaturaMedia(estado.cristal) * 100);
  const n = estado.vecinosConMismaHuella + 1;
  const m = Object.keys(estado.reticula.teselas).length;
  const puentes = filasPuente(estado);
  const coords = filasCoord(estado);
  const titanios = coords.filter((c) => c.ti).length;
  if (puentes.length === 0) {
    return (
      <section aria-label="Retícula" className="rounded-xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm">
        <h3 className="text-sm font-semibold">Sólido amorfo en tiempo real</h3>
        <p className="mt-2 text-xs text-muted-foreground">aún no llegó ninguna señal de otra neurona</p>
      </section>
    );
  }
  return (
    <section aria-label="Retícula" className="rounded-xl border border-border/40 bg-card/40 p-3 backdrop-blur-sm sm:p-4">
      <header className="flex items-center gap-2">
        <Hexagon className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Sólido amorfo en tiempo real</h3>
        {titanios > 0 && (
          <span data-testid="reticula-titanios" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <Router className="h-3 w-3" aria-hidden="true" />
            {titanios === 1 ? '1 titanio' : `${titanios} titanios`}
          </span>
        )}
      </header>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icono className={`h-3.5 w-3.5 shrink-0 ${color.texto}`} aria-hidden="true" />
        {TEXTO_ESTADO[estado.cristal.estado]}</p>
      <div className="mt-3 rounded-lg border border-border/30 p-2.5">
        <p className="flex items-center justify-between text-xs font-medium">
          <span>Temperatura media</span>
          <span data-testid="reticula-temperatura">{pct} %</span>
        </p>
        <div role="progressbar" aria-label="Temperatura media de la retícula" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/40">
          <div data-testid="reticula-barra-temperatura" className={`h-full ${color.barra}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Fría y estable al 0 %; caliente, con puentes recolocándose, al 100 %.</p>
      </div>
      <div className="mt-2 rounded-lg border border-border/30 p-2.5 text-xs">
        <p className="font-medium">Misma retícula en {n} de {m} neuronas</p>
        <p className="mt-1 text-muted-foreground">huella <code data-testid="reticula-huella">{huellaCorta(estado.huella)}</code></p>
      </div>
      <div className="mt-2">
        <p className="text-xs font-medium">Puentes, del más barato al más caro</p>
        <ul className="mt-1 space-y-1">
          {puentes.map((p, i) => (
            <li key={`${p.a}|${p.b}|${p.etiqueta}`} data-testid={`reticula-puente-${i}`} className="rounded-md border border-border/20 bg-background/20 p-2 text-[11px] break-all sm:text-xs">
              <span className="font-medium">{p.a} ↔ {p.b}</span>
              <span className="text-muted-foreground"> · {p.etiqueta} · {p.calidadPct === null ? 'calidad —' : `calidad ${p.calidadPct} %`} · coste {p.coste.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2">
        <p className="text-xs font-medium">Coordinación de cada neurona frente a su máximo</p>
        <ul className="mt-1 space-y-1 text-[11px] sm:text-xs">
          {coords.map((c) => (
            <li key={c.id} data-testid={`reticula-coord-${c.id}`} className="break-all text-muted-foreground">
              <span className="font-medium text-foreground">{c.id}</span>
              {c.ti && (
                <span data-testid={`reticula-ti-${c.id}`} className="ml-1.5 inline-flex items-center gap-1 text-amber-500">
                  <Router className="h-3 w-3" aria-hidden="true" />
                  Ti · router
                </span>
              )}
              : {c.n}/{c.max} puentes
              {c.ti && (
                <span className="block text-[11px] text-amber-500/90">fija la red: 6 puentes, no se dilata</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
