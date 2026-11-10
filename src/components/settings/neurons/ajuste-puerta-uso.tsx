"use client";

/**
 * AjusteUsoMalla — Ajustes › Neuronas › Medios › Internet compartido: USAR el internet de mis neuronas (PTA1110A · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Automático por defecto; todo se puede afinar:
 *   · «Usar el internet de mis neuronas»: Automático / Preguntar / Nunca;
 *   · qué puede usarlo: navegación, datos de StarSeed, descargas grandes, actualizaciones, IA, capas;
 *   · por qué carriles: Bluetooth, Wi‑Fi directo, red local;
 *   · los puertos (web corriente siempre; el resto: Preguntar / Nunca / Siempre) y el tope de uso diario.
 */

import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cambiarAjustesPuerta, estadoPuerta } from "@/lib/malla/puerta/servicio";
import { NOMBRE_USO } from "@/lib/malla/puerta/actividad";
import {
  PUERTOS_WEB_POR_DEFECTO,
  TIPOS_USO,
  type AjustesPuerta,
  type Carril,
  type EleccionGrande,
  type ModoUso,
  type PoliticaOtrosPuertos,
  type TipoUso,
} from "@/lib/malla/puerta/politica";

const MODOS: Array<{ id: ModoUso; nombre: string; detalle: string }> = [
  { id: "automatico", nombre: "Automático", detalle: "Sin internet propio, sale solo por la mejor neurona cercana y te avisa." },
  { id: "preguntar", nombre: "Preguntar", detalle: "Antes de salir por otra neurona, te pregunta una vez." },
  { id: "nunca", nombre: "Nunca", detalle: "No usa el internet de otras neuronas." },
];
const NOMBRE_CARRIL: Record<Carril, string> = { bluetooth: "Bluetooth", wifiP2p: "Wi‑Fi directo", redLocal: "Red local" };
const OTROS: Array<{ id: PoliticaOtrosPuertos; nombre: string }> = [
  { id: "preguntar", nombre: "Preguntar" },
  { id: "nunca", nombre: "Nunca" },
  { id: "siempre", nombre: "Siempre" },
];
const GRANDES: Array<{ id: EleccionGrande; nombre: string }> = [
  { id: "preguntar", nombre: "Preguntar" },
  { id: "continuar", nombre: "Continuar" },
  { id: "esperar", nombre: "Esperar un carril rápido" },
  { id: "solo-wifi", nombre: "Solo con Wi‑Fi" },
];

export function AjusteUsoMalla({ a }: { a: AjustesPuerta }) {
  const cambiar = (f: (x: AjustesPuerta) => AjustesPuerta): void => cambiarAjustesPuerta(f);
  const diaMib = Math.round(a.topesMias.bytesDia / 1024 / 1024);
  return (
    <fieldset className="space-y-3 rounded-lg border border-white/10 px-3 py-3" aria-label="Usar el internet de mis neuronas" data-testid="ajuste-uso-malla">
      <legend className="px-1 font-medium">Usar el internet de mis neuronas</legend>

      <div className="space-y-1.5">
        {MODOS.map((m) => (
          <label key={m.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors", a.modoUso === m.id ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 hover:border-white/25")}>
            <input
              type="radio"
              name="puerta-modo-uso"
              checked={a.modoUso === m.id}
              onChange={() => cambiar((x) => ({ ...x, modoUso: m.id, usarPuertas: m.id !== "nunca" }))}
              className="mt-1 accent-[#39FF14]"
            />
            <span>
              <span className="font-medium">{m.nombre}</span>
              <span className="block text-xs text-muted-foreground">{m.detalle}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-1" data-testid="usos-malla">
        <p className="text-xs font-medium">Qué puede usarlo</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TIPOS_USO.map((t: TipoUso) => (
            <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="checkbox" checked={a.usos[t]} onChange={(e) => cambiar((x) => ({ ...x, usos: { ...x.usos, [t]: e.target.checked } }))} className="accent-[#39FF14]" />
              {t === "descargas" ? "descargas grandes" : NOMBRE_USO[t]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1" data-testid="carriles-malla">
        <p className="text-xs font-medium">Por qué carriles</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(NOMBRE_CARRIL) as Carril[]).map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="checkbox" checked={a.carriles[c]} onChange={(e) => cambiar((x) => ({ ...x, carriles: { ...x.carriles, [c]: e.target.checked } }))} className="accent-[#39FF14]" />
              {NOMBRE_CARRIL[c]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1" data-testid="puertos-malla">
        <p className="text-xs font-medium">Puertos</p>
        <p className="text-xs text-muted-foreground">Siempre abiertos a sitios públicos: {PUERTOS_WEB_POR_DEFECTO.join(", ")}. Nunca: correo saliente, SMB, escritorio remoto, telnet. Cualquier otro puerto:</p>
        <div className="flex flex-wrap gap-2">
          {OTROS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="radio" name="puerta-otros-puertos" checked={a.otrosPuertos === o.id} onChange={() => cambiar((x) => ({ ...x, otrosPuertos: o.id }))} className="accent-[#39FF14]" />
              {o.nombre}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1" data-testid="grande-malla">
        <p className="text-xs font-medium">Descargas grandes por un carril lento</p>
        <div className="flex flex-wrap gap-2">
          {GRANDES.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input type="radio" name="puerta-grande" checked={a.grandeLento === o.id} onChange={() => cambiar((x) => ({ ...x, grandeLento: o.id }))} className="accent-[#39FF14]" />
              {o.nombre}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          Tope diario que presto a mis neuronas (MiB)
          <input
            type="number"
            min={0}
            step={128}
            value={diaMib}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              cambiar((x) => ({ ...x, topesMias: { ...x.topesMias, bytesDia: v * 1024 * 1024 } }));
            }}
            className="w-24 rounded border border-white/15 bg-transparent px-2 py-0.5"
            aria-label="Tope diario en MiB"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={a.compartirIaNeurona}
            onChange={(e) => cambiar((x) => ({ ...x, compartirIaNeurona: e.target.checked }))}
            className="accent-[#39FF14]"
          />
          Compartir la IA de esta neurona con las mías
        </label>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer"
        onClick={() => {
          try {
            estadoPuerta();
            window.dispatchEvent(new CustomEvent("starseed:abrir-actividad-malla"));
          } catch {
            /* sin ventana */
          }
        }}
      >
        <Activity className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Actividad de la malla
      </Button>
    </fieldset>
  );
}

export default AjusteUsoMalla;
