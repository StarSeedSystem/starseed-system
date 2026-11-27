"use client";

/**
 * SeccionPapelRed — ficha de neurona › Papel en la red (NEU1126B): rol (cerebro, servidor o ambos) y lo que
 * ofrece a la red (cómputo, almacenamiento, internet público, puerto). Mismos ajustes guardados que hoy
 * (`role`, `offerCompute`, `offerStorage`, `offerPublicInternet`, `publicPort`); no se inventa ninguno.
 */

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { setNeuronSettings, settingsFor, type Neuron, type NeuronRole, type NeuronSettings } from "@/lib/neurons/neurons";

export const ROLES_RED: readonly { id: NeuronRole; texto: string; ayuda: string }[] = [
  { id: "cerebro", texto: "Cerebro", ayuda: "Cómputo y contexto (IA local, sentidos)." },
  { id: "servidor", texto: "Servidor", ayuda: "Almacén y servicios (archivos, memorias)." },
  { id: "ambos", texto: "Ambos", ayuda: "Cerebro y servidor a la vez (lo predeterminado)." },
];

export const OFERTAS_RED: readonly { clave: "offerCompute" | "offerStorage" | "offerPublicInternet"; texto: string; ayuda: string }[] = [
  { clave: "offerCompute", texto: "Ofrecer cómputo a la red", ayuda: "CPU, GPU y memoria de esta neurona." },
  { clave: "offerStorage", texto: "Ofrecer almacenamiento a la red", ayuda: "Disco de esta neurona." },
  { clave: "offerPublicInternet", texto: "Ofrecer internet público", ayuda: "A los servidores comunitarios del OS." },
];

/** Rol vigente: sin dato guarda «ambos». Pura. */
export function rolDe(ajustes: Pick<NeuronSettings, "role">): NeuronRole {
  return ajustes.role ?? "ambos";
}

/** Puerto válido (1–65535) o `undefined` si el texto está vacío o no vale. Pura. */
export function puertoValido(texto: string): number | undefined {
  const n = Number(texto.trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
}

interface Props {
  neurona: Neuron;
  alCambiar?: () => void;
}

export function SeccionPapelRed({ neurona, alCambiar }: Props) {
  const [ajustes, setAjustes] = useState<NeuronSettings>(() => settingsFor(neurona.id));
  const [puerto, setPuerto] = useState(ajustes.publicPort ? String(ajustes.publicPort) : "");

  const poner = (parche: Partial<NeuronSettings>) => {
    try { setNeuronSettings(neurona.id, parche); } catch { /* defensivo */ }
    setAjustes(settingsFor(neurona.id));
    alCambiar?.();
  };
  const rol = rolDe(ajustes);
  const puertoOk = puerto.trim() === "" || puertoValido(puerto) !== undefined;

  return (
    <div className="space-y-4" data-testid="seccion-papel-red">
      <div role="radiogroup" aria-label="Rol de la neurona" className="grid gap-1 sm:grid-cols-3">
        {ROLES_RED.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={rol === r.id}
            onClick={() => poner({ role: r.id })}
            className={`cursor-pointer rounded-md border p-2 text-left transition-colors duration-200 ${rol === r.id ? "border-emerald-400/50 bg-emerald-500/15" : "border-border/40 hover:bg-white/5"}`}
          >
            <span className="block break-words text-sm font-medium">{r.texto}</span>
            <span className="block break-words text-[11px] text-muted-foreground">{r.ayuda}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-1">
        {OFERTAS_RED.map((o) => {
          const id = `papel-${neurona.id}-${o.clave}`;
          return (
            <li key={o.clave} className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border/40 p-2">
              <div className="min-w-0">
                <label id={id} className="block break-words text-sm">{o.texto}</label>
                <p className="break-words text-[11px] text-muted-foreground">{o.ayuda}</p>
              </div>
              <Switch checked={ajustes[o.clave] === true} aria-labelledby={id} onCheckedChange={(v) => poner({ [o.clave]: v })} className="shrink-0 cursor-pointer" />
            </li>
          );
        })}
      </ul>

      <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); if (puertoOk) poner({ publicPort: puertoValido(puerto) }); }}>
        <label htmlFor={`papel-puerto-${neurona.id}`} className="text-xs text-muted-foreground">Puerto del servicio (vínculos privados)</label>
        <Input
          id={`papel-puerto-${neurona.id}`}
          inputMode="numeric"
          value={puerto}
          onChange={(e) => setPuerto(e.target.value)}
          onBlur={() => { if (puertoOk && puertoValido(puerto) !== ajustes.publicPort) poner({ publicPort: puertoValido(puerto) }); }}
          aria-invalid={!puertoOk}
          placeholder="Por ejemplo: 8080"
          className="h-8 max-w-[10rem]"
        />
        {!puertoOk && <p role="alert" className="text-[11px] text-amber-500">Escribe un número entre 1 y 65535.</p>}
      </form>
    </div>
  );
}
