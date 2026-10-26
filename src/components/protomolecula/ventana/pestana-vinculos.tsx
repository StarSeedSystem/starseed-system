"use client";
/**
 * Ventana de la Protomolécula · pestaña «Vínculos»: mandos (MIDI y Gamepad) para mover los parámetros de la
 * molécula abierta. Conectar, «Aprender» (mueve el mando y confirma), quitar. Lo que aún no existe (HID, serie,
 * OSC, pulsómetro) se dice, no se esconde.
 */
import { Cable, Gamepad2, Music2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { decidir } from "@/lib/protomolecula/permisos";
import type { FuenteControl, Vinculo } from "@/lib/protomolecula/vinculos-control";
import type { PestanaVentana } from "./tipos";
import { useVinculosVentana } from "./use-vinculos-ventana";

const boton = "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-xs font-medium transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80";

export function fuenteLegible(f: FuenteControl): string {
  if (f.tipo === "midi") return `MIDI ${f.dispositivo ?? "cualquier aparato"} · ${f.mensaje}${f.numero !== undefined ? ` ${f.numero}` : ""} · canal ${f.canal}`;
  if (f.tipo === "gamepad") return `Gamepad ${(f.indice ?? 0) + 1} · ${f.control === "eje" ? "eje" : "botón"} ${f.numero}`;
  if (f.tipo === "sensor") return `Sensor ${f.sensorId}`;
  return f.tipo.toUpperCase();
}

export function PestanaVinculos({ moleculaId, irAPestana }: { moleculaId?: string; irAPestana: (p: PestanaVentana) => void }) {
  const v = useVinculosVentana(moleculaId);
  const permiso = v.molecula ? decidir({ rol: "dueno", origen: "mano", ambito: v.molecula.ambito, accion: "vincular-control" }) : null;
  const escuchando = v.aprender.fase === "escuchando";
  const objetivoActivo = v.aprender.fase === "escuchando" || v.aprender.fase === "detectado" ? `${v.aprender.objetivo.atomoId}::${v.aprender.objetivo.parametroId}` : null;

  return (
    <div className="flex flex-col gap-3" data-testid="pestana-vinculos">
      <section aria-label="Conectar mandos" className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="font-headline text-sm font-semibold tracking-wide">Conectar mandos</p>
        <p className="mt-0.5 text-[11px] leading-snug text-white/60">El navegador pide permiso al conectar. Funcionan mientras esta ventana esté abierta.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void v.conectarMidi()} className={boton}><Music2 className="h-4 w-4" aria-hidden="true" />Conectar MIDI</button>
          <button type="button" onClick={v.conectarGamepad} className={boton}><Gamepad2 className="h-4 w-4" aria-hidden="true" />Conectar Gamepad</button>
        </div>
        <div className="mt-2 space-y-1 text-xs" role="status">
          {v.mandos.midi.length > 0 && <p>MIDI: {v.mandos.midi.join(", ")}</p>}
          {v.mandos.avisoMidi && <p className="text-white/70">{v.mandos.avisoMidi}</p>}
          {v.mandos.gamepad.length > 0 && <p>Gamepad: {v.mandos.gamepad.join(", ")}</p>}
          {v.mandos.avisoGamepad && <p className="text-white/70">{v.mandos.avisoGamepad}</p>}
        </div>
      </section>

      {v.error ? (
        <p role="alert" className="rounded-2xl border border-[#DC143C]/50 bg-[#DC143C]/10 px-3 py-2 text-xs">{v.error}</p>
      ) : v.cargando ? (
        <p role="status" className="px-1 text-xs text-white/60">Abriendo la molécula…</p>
      ) : v.candidatos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
          <p>Esta molécula aún no tiene parámetros que vincular. Añade una herramienta y vuelve.</p>
          <button type="button" onClick={() => irAPestana("controles")} className={cn(boton, "mt-2")}>Ir a Controles</button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Parámetros vinculables">
          {v.candidatos.map((c) => {
            const clave = `${c.ref.atomoId}::${c.ref.parametroId}`;
            const suyos = v.vinculos.filter((x: Vinculo) => x.objetivo.atomoId === c.ref.atomoId && x.objetivo.parametroId === c.ref.parametroId);
            const activo = objetivoActivo === clave;
            return (
              <li key={clave} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1"><span className="font-medium">{c.parametro.nombre}</span> <span className="text-white/60">· {c.atomo ?? c.ref.atomoId}</span></p>
                  <button
                    type="button"
                    onClick={() => v.aprenderParametro(c.ref)}
                    disabled={!permiso?.permitido || escuchando}
                    title={permiso && !permiso.permitido ? permiso.motivo : "Pulsa y mueve el mando que quieras vincular"}
                    className={boton}
                  >
                    Aprender
                  </button>
                </div>
                {suyos.length === 0 && !activo && <p className="mt-1 text-white/50">Sin vínculos</p>}
                {suyos.map((x) => (
                  <div key={x.id} className="mt-1 flex items-center gap-2">
                    <Cable className="h-3.5 w-3.5 shrink-0 text-[#00F0FF]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{fuenteLegible(x.fuente)} · {x.modo}</span>
                    <button type="button" onClick={() => v.quitarVinculo(x.id)} aria-label={`Quitar el vínculo de ${c.parametro.nombre}`} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {activo && v.aprender.fase === "escuchando" && (
                  <div role="status" className="mt-2 flex items-center gap-2">
                    <span className="flex-1 text-[#00F0FF]">Mueve el mando que quieres vincular…</span>
                    <button type="button" onClick={v.cancelarAprender} className={boton}>Cancelar</button>
                  </div>
                )}
                {activo && v.aprender.fase === "detectado" && (
                  <div role="status" className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex-1">Detectado: {fuenteLegible(v.aprender.fuente)}. ¿Confirmas?</span>
                    <button type="button" onClick={v.confirmarAprender} className={cn(boton, "bg-[#10B981] text-[#0A0F1D] hover:bg-[#10B981]/90")}>Confirmar</button>
                    <button type="button" onClick={v.cancelarAprender} className={boton}>Cancelar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {v.aprender.fase === "cancelado" && v.aprender.motivo === "caducado" && <p role="status" className="px-1 text-xs text-white/70">No llegó ningún movimiento a tiempo. Vuelve a pulsar «Aprender».</p>}
      {v.aviso && <p role="status" className="px-1 text-xs text-white/80">{v.aviso}</p>}
      {permiso && !permiso.permitido && <p className="px-1 text-xs text-white/70">{permiso.motivo}</p>}
      <p className="px-1 text-[11px] leading-snug text-white/50">HID, puerto serie, OSC y pulsómetro aún no se vinculan desde aquí: necesitan permiso por aparato o un puente local.</p>
    </div>
  );
}

export default PestanaVinculos;
