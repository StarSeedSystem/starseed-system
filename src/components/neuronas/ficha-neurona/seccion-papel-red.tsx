"use client";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { settingsFor, setNeuronSettings, type NeuronSettings } from "@/lib/neurons/neurons";

const PAPELES = [
  { key: "relay" as const, label: "Relé", hint: "Reenviar mensajes entre neuronas que no se ven directamente", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg> },
  { key: "servidor" as const, label: "Servidor", hint: "Ofrecer servicios (API, almacenamiento, cómputo) a la red", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="1"/><rect x="2" y="14" width="20" height="8" rx="1"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg> },
  { key: "almacen" as const, label: "Almacén", hint: "Guardar y servir memorias/archivos de otras neuronas", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M4 8v9"/><path d="M20 8v9"/><path d="M8 12h8"/></svg> },
  { key: "computo" as const, label: "Cómputo", hint: "Ejecutar modelos/IA para otras neuronas", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/></svg> },
  { key: "horario" as const, label: "Solo en horario", hint: "Activar roles solo en franjas horarias declaradas", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
  { key: "enchufado" as const, label: "Solo enchufado", hint: "Ofrecer servicios solo con alimentación externa", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 4v16"/><path d="M10 4v16"/><path d="M4 8h16"/><path d="M4 16h16"/></svg> },
  { key: "wifi" as const, label: "Solo Wi‑Fi", hint: "Ofrecer servicios solo en redes de confianza", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.94 0"/><line x1="12" x2="12" y1="20" y2="20"/></svg> },
] as const;

type PapelKey = (typeof PAPELES)[number]["key"];

const DEFAULTS: Record<PapelKey, boolean> = {
  relay: false,
  servidor: false,
  almacen: false,
  computo: false,
  horario: false,
  enchufado: false,
  wifi: false,
};

export interface SeccionPapelRedProps {
  neurona: { id: string };
}

export function SeccionPapelRed({ neurona }: SeccionPapelRedProps) {
  const settings = settingsFor(neurona.id);

  const actualizar = (key: PapelKey, value: boolean) => {
    const patch = { [key]: value } as Partial<NeuronSettings>;
    setNeuronSettings(neurona.id, patch);
  };

  return (
    <div className="space-y-3" data-seccion="papel-red">
      <p className="text-xs text-white/50">Define qué papel juega esta neurona en la red. Todo apagado por defecto.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PAPELES.map((p) => {
          const key = p.key;
          const valor = (settings as Record<string, unknown>)[key] as boolean ?? DEFAULTS[key];
          return (
            <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-emerald-300/80 mt-0.5 flex-shrink-0">{p.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight text-white/85">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{p.hint}</p>
                </div>
              </div>
              <Switch checked={valor} onCheckedChange={(v) => actualizar(key, v)} aria-label={`${p.label} en ${neurona.id}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SeccionPapelRed;