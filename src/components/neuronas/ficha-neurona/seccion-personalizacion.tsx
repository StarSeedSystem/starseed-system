"use client";

/**
 * SeccionPersonalizacion — ficha de neurona › Personalización (NEU1126C): propone un perfil según el aparato
 * (`perfiles-neurona.ts`) con su porqué. Nunca se aplica solo: «Aplicar», «Ajustar» o «Ahora no», y se puede
 * deshacer. No muestra ni cambia permisos de control, terminal o administración.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NEURON_PREFS_KEY, setNeuronSettings, type Neuron, type NeuronSettings } from "@/lib/neurons/neurons";
import {
  entradaDeNeurona, guardadasDe, previoDe, proponerPerfil, sinPisar, type CambiosPerfil, type ClavePerfil,
} from "@/lib/neurons/perfiles-neurona";

const CLAVE_ESTADO = "starseed.neurona.perfil.v1";

export const ETIQUETAS_PERFIL: Record<ClavePerfil, string> = {
  role: "Rol en la red",
  offerCompute: "Ofrecer cómputo",
  offerStorage: "Ofrecer almacenamiento",
  offerPublicInternet: "Ofrecer internet público",
  auroraListening: "Escucha de Aurora",
  syncBrains: "Respaldar memorias de los cerebros",
  releCuando: "Relé de la malla",
};

const TEXTO_RELE = { siempre: "siempre", cargando: "solo cargando", "cargando-wifi": "solo cargando y con Wi‑Fi", nunca: "nunca" } as const;

/** Valor legible de un cambio. Pura. */
export function textoValor(clave: ClavePerfil, valor: unknown): string {
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (clave === "releCuando" && typeof valor === "string" && valor in TEXTO_RELE) return TEXTO_RELE[valor as keyof typeof TEXTO_RELE];
  return String(valor);
}

interface Registro { estado: "aplicado" | "descartado"; previo?: Record<string, unknown> }

function leerRegistro(id: string): Registro | undefined {
  try { return (JSON.parse(localStorage.getItem(CLAVE_ESTADO) ?? "{}") as Record<string, Registro>)[id]; } catch { return undefined; }
}
function guardarRegistro(id: string, r: Registro | undefined): void {
  try {
    const todo = JSON.parse(localStorage.getItem(CLAVE_ESTADO) ?? "{}") as Record<string, Registro>;
    if (r) todo[id] = r; else delete todo[id];
    localStorage.setItem(CLAVE_ESTADO, JSON.stringify(todo));
  } catch { /* defensivo */ }
}

interface Props { neurona: Neuron; alCambiar?: () => void }

export function SeccionPersonalizacion({ neurona, alCambiar }: Props) {
  const [registro, setRegistro] = useState<Registro | undefined>(() => leerRegistro(neurona.id));
  const [ajustando, setAjustando] = useState(false);
  const [elegidos, setElegidos] = useState<Partial<Record<ClavePerfil, boolean>>>({});
  const propuesta = proponerPerfil(entradaDeNeurona(neurona));
  const guardadas = guardadasDe(typeof localStorage === "undefined" ? null : localStorage.getItem(NEURON_PREFS_KEY), neurona.id);
  const libres = sinPisar(propuesta.cambios, guardadas);
  const claves = Object.keys(libres) as ClavePerfil[];

  const aplicar = (cambios: CambiosPerfil) => {
    try { setNeuronSettings(neurona.id, cambios as Partial<NeuronSettings>); } catch { /* defensivo */ }
    const r: Registro = { estado: "aplicado", previo: previoDe(cambios, guardadas) };
    guardarRegistro(neurona.id, r); setRegistro(r); setAjustando(false); alCambiar?.();
  };
  const descartar = () => { const r: Registro = { estado: "descartado" }; guardarRegistro(neurona.id, r); setRegistro(r); setAjustando(false); };
  const deshacer = () => {
    const vuelta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(registro?.previo ?? {})) vuelta[k] = v === null ? undefined : v;
    try { setNeuronSettings(neurona.id, vuelta as Partial<NeuronSettings>); } catch { /* defensivo */ }
    guardarRegistro(neurona.id, undefined); setRegistro(undefined); alCambiar?.();
  };

  if (registro?.estado === "aplicado") {
    return (
      <div className="space-y-2" data-testid="seccion-personalizacion">
        <p className="text-sm">Perfil «{propuesta.titulo}» aplicado.</p>
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={deshacer}>Deshacer</Button>
      </div>
    );
  }
  if (registro?.estado === "descartado" || claves.length === 0) {
    return (
      <div className="space-y-2" data-testid="seccion-personalizacion">
        <p className="text-xs text-muted-foreground">
          {claves.length === 0 ? "No hay nada que proponer: tus preferencias ya cubren este perfil." : "Dijiste «ahora no». Puedes volver a ver la propuesta."}
        </p>
        {claves.length > 0 && <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => { guardarRegistro(neurona.id, undefined); setRegistro(undefined); }}>Ver la propuesta</Button>}
      </div>
    );
  }

  const marcado = (k: ClavePerfil) => elegidos[k] !== false;
  const elegidosCambios = Object.fromEntries(claves.filter(marcado).map((k) => [k, libres[k]])) as CambiosPerfil;

  return (
    <div className="space-y-3" data-testid="seccion-personalizacion">
      <div>
        <p className="break-words text-sm font-medium">Propuesta: {propuesta.titulo}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">{propuesta.porque.map((p) => <li key={p} className="break-words">{p}</li>)}</ul>
      </div>
      <ul className="space-y-1">
        {claves.map((k) => (
          <li key={k} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/40 p-2 text-sm">
            <span className="min-w-0 break-words">{ETIQUETAS_PERFIL[k]}: <strong>{textoValor(k, libres[k])}</strong></span>
            {ajustando && <Switch checked={marcado(k)} aria-label={`Incluir ${ETIQUETAS_PERFIL[k]}`} onCheckedChange={(v) => setElegidos((p) => ({ ...p, [k]: v }))} className="shrink-0 cursor-pointer" />}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {ajustando
          ? <Button size="sm" className="cursor-pointer" onClick={() => aplicar(elegidosCambios)}>Aplicar lo elegido</Button>
          : <Button size="sm" className="cursor-pointer" onClick={() => aplicar(libres)}>Aplicar</Button>}
        {!ajustando && <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setAjustando(true)}>Ajustar</Button>}
        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={descartar}>Ahora no</Button>
      </div>
    </div>
  );
}
