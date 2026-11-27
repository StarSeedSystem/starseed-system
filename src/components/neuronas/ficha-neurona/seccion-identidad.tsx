"use client";

/**
 * SeccionIdentidad — ficha de neurona › Identidad (NEU1126B): nombre de la neurona, nombre de ESTE aparato
 * (solo en la neurona de este aparato), tipo/icono y color público. No quita nada de lo que ya existía en
 * Cerebros › Neuronas ni en Cuenta › Neuronas: usa las mismas funciones de `lib/neurons`.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  nombreEsteAparato,
  renombrarEsteAparato,
  setNeuronKind,
  setNeuronName,
  settingsFor,
  type Neuron,
  type NeuronKind,
} from "@/lib/neurons/neurons";
import { PALETA_COLOR_PUBLICO, colorDe } from "@/lib/neurons/color-publico";
import { ponerColorPublico } from "@/lib/neurons/color-publico-ajuste";

export const TIPOS_ICONO: readonly { valor: NeuronKind; texto: string }[] = [
  { valor: "desktop", texto: "Escritorio" },
  { valor: "laptop", texto: "Portátil" },
  { valor: "mobile", texto: "Móvil" },
  { valor: "tablet", texto: "Tableta" },
  { valor: "server", texto: "Servidor" },
  { valor: "other", texto: "Otro" },
];

/** Nombre limpio: sin espacios dobles y de 60 letras como mucho. Pura. */
export function nombreLimpio(t: string): string {
  return t.replace(/\s+/g, " ").trim().slice(0, 60);
}

interface Props {
  neurona: Neuron;
  /** Se llama tras guardar algo, para que la lista se vuelva a leer. */
  alCambiar?: () => void;
}

export function SeccionIdentidad({ neurona, alCambiar }: Props) {
  const [nombre, setNombre] = useState(neurona.name);
  const [aparato, setAparato] = useState("");
  const [tipo, setTipo] = useState<NeuronKind>(settingsFor(neurona.id).icono ?? neurona.kind);
  const [color, setColor] = useState(colorDe(neurona.id, settingsFor(neurona.id).colorPublico));
  const [aviso, setAviso] = useState("");
  const esta = !!neurona.isThisDevice;

  useEffect(() => {
    setNombre(neurona.name);
    if (esta) setAparato(nombreEsteAparato());
  }, [neurona.name, esta]);

  const guardarNombre = () => {
    const n = nombreLimpio(nombre);
    if (!n || n === neurona.name) return;
    try { setNeuronName(neurona.id, n); } catch { /* defensivo */ }
    setAviso("Nombre de la neurona guardado.");
    alCambiar?.();
  };

  const guardarAparato = async () => {
    const ok = await renombrarEsteAparato(nombreLimpio(aparato));
    setAviso(ok ? "Nombre de este aparato guardado." : "No se pudo guardar el nombre del aparato.");
    alCambiar?.();
  };

  const elegirTipo = (v: NeuronKind) => {
    setTipo(v);
    setNeuronKind(neurona.id, v);
    alCambiar?.();
  };

  const elegirColor = (c: string) => {
    const puesto = ponerColorPublico(neurona.id, c);
    if (puesto) setColor(puesto);
    alCambiar?.();
  };

  return (
    <div className="space-y-4">
      <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); guardarNombre(); }}>
        <label htmlFor={`ficha-nombre-${neurona.id}`} className="text-xs text-muted-foreground">Nombre de la neurona</label>
        <div className="flex flex-wrap gap-2">
          <Input id={`ficha-nombre-${neurona.id}`} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} className="h-8 min-w-0 flex-1 basis-40" />
          <Button type="submit" size="sm" variant="outline" className="cursor-pointer">Guardar nombre</Button>
        </div>
      </form>

      {esta && (
        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); void guardarAparato(); }}>
          <label htmlFor="ficha-nombre-aparato" className="text-xs text-muted-foreground">Nombre de este aparato</label>
          <div className="flex flex-wrap gap-2">
            <Input id="ficha-nombre-aparato" value={aparato} maxLength={60} onChange={(e) => setAparato(e.target.value)} placeholder="Por ejemplo: Móvil de Maggasukha" className="h-8 min-w-0 flex-1 basis-40" />
            <Button type="submit" size="sm" variant="outline" className="cursor-pointer">Guardar nombre del aparato</Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        <label htmlFor={`ficha-tipo-${neurona.id}`} className="text-xs text-muted-foreground">Tipo de aparato (icono)</label>
        <select
          id={`ficha-tipo-${neurona.id}`}
          value={tipo}
          onChange={(e) => elegirTipo(e.target.value as NeuronKind)}
          className="h-8 w-full max-w-xs cursor-pointer rounded-md border border-border/40 bg-background/60 px-2 text-sm"
        >
          {TIPOS_ICONO.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
        </select>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">Color público</legend>
        <div className="flex flex-wrap gap-2">
          {PALETA_COLOR_PUBLICO.map((p) => (
            <button
              key={p.color}
              type="button"
              aria-label={`Color ${p.nombre}`}
              aria-pressed={p.color === color}
              onClick={() => elegirColor(p.color)}
              className={`h-7 w-7 cursor-pointer rounded-full border-2 ${p.color === color ? "border-white" : "border-transparent"}`}
              style={{ backgroundColor: p.color }}
            />
          ))}
        </div>
      </fieldset>

      {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
    </div>
  );
}
