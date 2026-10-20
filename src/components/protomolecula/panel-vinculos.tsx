"use client";

import { useMemo, useState } from "react";
import { Plug, Trash2 } from "lucide-react";
import { decidir } from "@/lib/protomolecula/permisos";
import { siguienteAprender, vinculoAprendido, type EstadoAprender, type EventoAprender } from "@/lib/protomolecula/vinculos-control";
import type { Autor, CandidatoParametro, Vinculo } from "@/lib/protomolecula/vinculos-control";
import type { Ambito, Rol } from "@/lib/protomolecula/tipos";

export interface PanelVinculosProps {
  vinculos: Vinculo[];
  candidatos: CandidatoParametro[];
  autor: Autor;
  rol: Rol | null;
  ambito: Ambito;
  ahora: () => number;
  nuevoId: () => string;
  alCrear?: (v: Vinculo) => void;
  alActualizar?: (id: string, v: Partial<Vinculo>) => void;
  alQuitar?: (id: string) => void;
}

function fuenteLegible(f: Vinculo["fuente"]) {
  if (f.tipo === "gamepad") return `Gamepad ${f.indice ?? 0} ${f.control} ${f.numero}`;
  if (f.tipo === "midi") return `MIDI ${f.dispositivo ?? "*"} ${f.mensaje} ${f.numero ?? ""} canal ${f.canal}`;
  return f.tipo;
}

export default function PanelVinculos({
  vinculos,
  candidatos,
  autor,
  rol,
  ambito,
  ahora,
  nuevoId,
  alCrear,
  alActualizar,
  alQuitar,
}: PanelVinculosProps) {
  const [aprendiendo, setAprendiendo] = useState<Record<string, EstadoAprender>>({});

  const mapa = useMemo(() => {
    const m: Record<string, Vinculo[]> = {};
    for (const v of vinculos) {
      const k = `${v.objetivo.atomoId}::${v.objetivo.parametroId}`;
      (m[k] ??= []).push(v);
    }
    return m;
  }, [vinculos]);

  const puedeVincular = decidir({ rol, origen: "mano", ambito, accion: "vincular-control" });

  const iniciar = (c: CandidatoParametro) => {
    const key = `${c.ref.atomoId}::${c.ref.parametroId}`;
    setAprendiendo(s => ({ ...s, [key]: { fase: "escuchando", objetivo: c.ref, caduca: ahora() + 15000, vistos: {} } }));
  };

  const confirmar = (c: CandidatoParametro) => {
    const key = `${c.ref.atomoId}::${c.ref.parametroId}`;
    const estado = aprendiendo[key];
    if (!estado || estado.fase !== "detectado") return;
    const permiso = decidir({ rol, origen: autor.tipo === "agente" ? "agente" : "mano", ambito, accion: "vincular-control" });
    if (!permiso.permitido) return;
    const id = nuevoId();
    const vinculo = vinculoAprendido(estado as Extract<EstadoAprender, { fase: "detectado" }>, c.parametro, id, autor.id);
    alCrear?.(vinculo);
    setAprendiendo(s => { const n = { ...s }; delete n[key]; return n; });
  };

  const cancelar = (c: CandidatoParametro) => {
    const key = `${c.ref.atomoId}::${c.ref.parametroId}`;
    setAprendiendo(s => { const n = { ...s }; delete n[key]; return n; });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Vínculos</h3>
      <div className="space-y-3">
        {candidatos.map(c => {
          const key = `${c.ref.atomoId}::${c.ref.parametroId}`;
          const lista = mapa[key] ?? [];
          const estado = aprendiendo[key];
          const mensaje = estado?.fase === "escuchando" ? "Mueve el mando…" : estado?.fase === "detectado" ? `detectado: ${fuenteLegible(estado.fuente)}. ¿Confirmas?` : null;
          return (
            <div key={key} className="rounded border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium">{c.parametro.nombre}</span> <span className="text-muted-foreground">· {c.atomo ?? c.ref.atomoId}</span>
                </div>
                <button className="cursor-pointer text-xs underline" onClick={() => iniciar(c)} disabled={!puedeVincular.permitido}>Aprender</button>
              </div>
              {lista.length === 0 && <p className="text-xs text-muted-foreground">Sin vínculos</p>}
              {lista.map(v => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span>{fuenteLegible(v.fuente)} · {v.modo} · {v.activo ? "activo" : "inactivo"} · inv={v.curva.invertir ? "sí" : "no"} · zm={v.curva.zonaMuerta}</span>
                  <button className="cursor-pointer" onClick={() => alQuitar?.(v.id)}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              {mensaje && (
                <div className="flex items-center gap-2 text-xs">
                  <span>{mensaje}</span>
                  <button className="cursor-pointer underline" onClick={() => confirmar(c)}>Confirmar</button>
                  <button className="cursor-pointer underline" onClick={() => cancelar(c)}>Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        <Plug className="inline h-3 w-3" /> HID: próximamente: WebHID requiere permiso por dispositivo
        <br />
        Serie: próximamente: WebSerial requiere permiso por puerto
        <br />
        OSC: próximamente: necesita puente local
      </div>
    </div>
  );
}
// Montaje en PanelProtomolecula lo hace tarea sucesora

