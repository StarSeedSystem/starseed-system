"use client";

/**
 * Panel de parámetros de la Protomolécula: un control por parámetro (deslizador + valor exacto,
 * interruptor, opciones o botón), agrupado por átomo. El deslizador da vista previa en vivo por
 * `alGesto` y solo al soltar emite UNA `Operacion` (origen "mano"). Contrato: §11 y PM1010F0E.
 */
import * as React from "react";
import type {
  Accion, Autor, CandidatoParametro, EstadoValores, Operacion, ParametroRef,
} from "@/lib/protomolecula/tipos";
import { formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ControlNumerico } from "./control-numerico";

export interface PanelParametrosProps {
  candidatos: CandidatoParametro[];
  valores: EstadoValores;
  autor: Autor;
  alOperar: (op: Operacion) => void;
  /** Vista previa en vivo mientras se arrastra: NO queda en el historial. */
  alGesto?: (ref: ParametroRef, valor: number) => void;
  soloLectura?: boolean;
  ahora?: () => number;
  nuevoId?: () => string;
}

const idAleatorio = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PanelParametros({
  candidatos, valores, autor, alOperar, alGesto, soloLectura = false,
  ahora = () => Date.now(), nuevoId = idAleatorio,
}: PanelParametrosProps) {
  const emitir = (ref: ParametroRef, accion: Accion) =>
    alOperar({ id: nuevoId(), objetivo: ref, accion, autor, origen: "mano", t: ahora() });

  const grupos = React.useMemo(() => {
    const porAtomo = new Map<string, CandidatoParametro[]>();
    for (const c of candidatos) {
      const clave = c.atomo ?? c.ref.atomoId;
      porAtomo.set(clave, [...(porAtomo.get(clave) ?? []), c]);
    }
    return [...porAtomo.entries()];
  }, [candidatos]);

  if (candidatos.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Esta molécula aún no tiene herramientas. Añade una desde «Añadir herramienta»
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grupos.map(([atomo, lista]) => (
        <section key={atomo} aria-label={atomo} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{atomo}</h3>
          {lista.map((c) => (
            <ControlParametro
              key={`${c.ref.atomoId}::${c.ref.parametroId}`}
              candidato={c}
              valores={valores}
              soloLectura={soloLectura}
              emitir={emitir}
              alGesto={alGesto}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

interface ControlProps {
  candidato: CandidatoParametro;
  valores: EstadoValores;
  soloLectura: boolean;
  emitir: (ref: ParametroRef, accion: Accion) => void;
  alGesto?: (ref: ParametroRef, valor: number) => void;
}

function ControlParametro({ candidato, valores, soloLectura, emitir, alGesto }: ControlProps) {
  const { ref, parametro: p } = candidato;
  const valor = valorActual(valores, ref, p);
  const texto = formatearValor(p, valor);
  const idCampo = `pm-${ref.atomoId}-${ref.parametroId}`;

  if (p.tipo === "numero" || p.tipo === "entero") {
    return (
      <ControlNumerico
        idCampo={idCampo} nombre={p.nombre} texto={texto} valor={Number(valor)}
        min={p.min} max={p.max} paso={p.paso} entero={p.tipo === "entero"}
        soloLectura={soloLectura}
        alArrastrar={alGesto ? (v: number) => alGesto(ref, v) : undefined}
        alFijar={(v: number) => emitir(ref, { tipo: "exacta", valor: v })}
      />
    );
  }
  if (p.tipo === "booleano") {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={idCampo} className="cursor-pointer">{p.nombre}</Label>
        <Switch
          id={idCampo} checked={Boolean(valor)} disabled={soloLectura}
          aria-valuetext={texto} className="cursor-pointer transition-colors duration-150"
          onCheckedChange={(v) => emitir(ref, { tipo: "exacta", valor: v })}
        />
      </div>
    );
  }
  if (p.tipo === "opcion") {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={idCampo} className="cursor-pointer">{p.nombre}</Label>
        <Select value={String(valor)} disabled={soloLectura}
          onValueChange={(v) => emitir(ref, { tipo: "exacta", valor: v })}>
          <SelectTrigger id={idCampo} className="cursor-pointer transition-colors duration-150">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(p.opciones ?? []).map((o) => (
              <SelectItem key={o} value={o} className="cursor-pointer">{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <Button
      type="button" variant="secondary" disabled={soloLectura}
      aria-label={p.nombre} className="cursor-pointer transition-colors duration-200"
      onClick={() => emitir(ref, { tipo: "disparo" })}
    >
      {p.nombre}
    </Button>
  );
}
