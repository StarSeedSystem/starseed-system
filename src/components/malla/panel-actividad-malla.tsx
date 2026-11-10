"use client";

/**
 * PanelActividadMalla — «Actividad de la malla» (PTA1110A · 2026-11-10). Contrato: `architecture/red-sin-dependencias.md` §5.3.
 *
 * Qué pasa AHORA por la malla, en llano y sin contenido: los procesos de esta neurona que salen por otra (tipo, sitio,
 * bytes, velocidad, carril) con pausa y cancelación para los grandes; con quién se comparte internet (solo sitios y volumen);
 * la capacidad medida de cada carril y el uso de hoy frente a los topes. También contesta a las dos preguntas pendientes:
 * «usar el internet de mis neuronas» (modo Preguntar) y «descarga grande por un carril lento».
 */

import { useSyncExternalStore } from "react";
import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  cancelarActividad,
  estadoPuerta,
  pausarActividad,
  reanudarActividad,
  responderGrande,
  responderUso,
  suscribirPuerta,
} from "@/lib/malla/puerta/servicio";
import { NOMBRE_USO, bytesTexto, textoIndicador, velocidadTexto } from "@/lib/malla/puerta/actividad";

/** Un proceso es «grande» (admite pausa y cancelar) a partir de esto. */
export const BYTES_PROCESO_GRANDE = 512 * 1024;

export function PanelActividadMalla({ className }: { className?: string }) {
  const s = useSyncExternalStore(suscribirPuerta, estadoPuerta, estadoPuerta);
  const actividad = s.actividad ?? [];
  const carriles = s.carriles ?? [];
  const propios = actividad.filter((a) => a.rol === "cliente");
  const compartiendo = s.compartiendo ?? [];
  const nombrePorId = new Map(compartiendo.map((c) => [c.de, c.nombre]));
  const grupos = new Map<string, { nombre: string; hosts: Set<string>; bytes: number; grupo: string }>();
  for (const c of compartiendo) {
    const g = grupos.get(c.de) ?? { nombre: c.nombre, hosts: new Set<string>(), bytes: 0, grupo: c.grupo };
    if (c.rol === "puerta") g.hosts.add(c.host);
    g.bytes += c.bytes;
    grupos.set(c.de, g);
  }
  const a = s.ajustes;
  const topeMias = a.topesMias.bytesDia;
  const topeOtras = a.topesOtras.bytesDia;
  const pct = (usado: number, tope: number): number => (tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : 0);

  return (
    <div className={cn("space-y-4 text-sm", className)} data-testid="panel-actividad-malla">
      {s.preguntaUso && (
        <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2" role="alertdialog" aria-label="Usar el internet de mis neuronas" data-testid="pregunta-uso">
          <p>
            Esta neurona no tiene internet y <strong>{s.preguntaUso.nombre}</strong> puede prestarle el suyo. ¿Salir por ella?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="cursor-pointer" onClick={() => responderUso(true)}>Usar su internet</Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderUso(false)}>No</Button>
          </div>
        </div>
      )}

      {s.preguntaGrande && (
        <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2" role="alertdialog" aria-label="Descarga grande por un carril lento" data-testid="pregunta-grande">
          <p>
            Una descarga de <strong>{NOMBRE_USO[s.preguntaGrande.tipo]}</strong> desde <code className="text-xs">{s.preguntaGrande.host}</code> va por un carril lento (
            {Math.round(s.preguntaGrande.kbps)} kb/s: ≈ {s.preguntaGrande.segundosPorMiB} s por MiB). Está en pausa hasta que elijas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="cursor-pointer" onClick={() => responderGrande("continuar", false)}>Continuar</Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderGrande("esperar", false)}>Esperar un carril más rápido</Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderGrande("solo-wifi", false)}>Solo con Wi‑Fi</Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Recordar mi elección:</span>
            <button type="button" className="cursor-pointer underline" onClick={() => responderGrande("continuar", true)}>siempre continuar</button>
            <button type="button" className="cursor-pointer underline" onClick={() => responderGrande("esperar", true)}>siempre esperar</button>
            <button type="button" className="cursor-pointer underline" onClick={() => responderGrande("solo-wifi", true)}>siempre solo Wi‑Fi</button>
          </div>
        </div>
      )}

      <section aria-label="Ruta de esta neurona">
        {s.internetPor ? (
          <p className="rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 px-3 py-2 text-emerald-200" data-testid="actividad-ruta">
            {textoIndicador({ nombre: s.internetPor.nombre, enlace: s.internetPor.enlace, saltos: s.internetPor.saltos, bytesPorSegundo: s.bytesPorSegundo })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="actividad-ruta">
            {s.conInternet ? "Esta neurona sale por su propia conexión." : s.puertas.length ? "Sin salida propia: esperando para salir por una puerta cercana." : "Sin salida propia y ninguna neurona cercana presta la suya."}
          </p>
        )}
      </section>

      <section aria-label="Mis procesos por la malla" className="space-y-1.5">
        <h3 className="font-medium">Mis procesos por la malla</h3>
        {propios.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="sin-procesos">Nada sale ahora por otra neurona.</p>
        ) : (
          <ul className="space-y-1.5" data-testid="procesos-propios">
            {propios.map((p) => {
              const grande = p.bytes >= BYTES_PROCESO_GRANDE;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-1.5" data-testid="proceso">
                  <span className="min-w-0">
                    <Badge variant="outline">{NOMBRE_USO[p.tipo]}</Badge>{" "}
                    <code className="text-xs">{p.host}:{p.puerto}</code>
                    <span className="block text-xs text-muted-foreground">
                      {bytesTexto(p.bytes)} · {p.pausada ? (p.esperandoCarril ? "esperando un carril más rápido" : "en pausa") : velocidadTexto(p.bytesPorSegundo)} · {p.enlace}
                    </span>
                  </span>
                  {grande && (
                    <span className="flex gap-1">
                      {p.pausada ? (
                        <Button size="sm" variant="outline" className="cursor-pointer" aria-label="Reanudar" onClick={() => reanudarActividad(p.id)}><Play className="h-3.5 w-3.5" aria-hidden /></Button>
                      ) : (
                        <Button size="sm" variant="outline" className="cursor-pointer" aria-label="Pausar" onClick={() => pausarActividad(p.id)}><Pause className="h-3.5 w-3.5" aria-hidden /></Button>
                      )}
                      <Button size="sm" variant="outline" className="cursor-pointer" aria-label="Cancelar" onClick={() => cancelarActividad(p.id)}><X className="h-3.5 w-3.5" aria-hidden /></Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {grupos.size > 0 && (
        <section aria-label="Compartiendo con" className="space-y-1.5" data-testid="actividad-compartiendo">
          <h3 className="font-medium">Compartiendo con</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {[...grupos.entries()].map(([id, g]) => (
              <li key={id}>
                <strong className="text-foreground">{nombrePorId.get(id) ?? g.nombre}</strong> <Badge variant="outline">{g.grupo === "mias" ? "mi cuenta" : "otra cuenta"}</Badge> · {bytesTexto(g.bytes)}
                {g.hosts.size > 0 ? ` · ${[...g.hosts].slice(0, 6).join(", ")}` : " · solo pasa por aquí"}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Solo se ven sitios y volumen: el contenido va cifrado de punta a punta y no lo ve esta neurona.</p>
        </section>
      )}

      {carriles.length > 0 && (
        <section aria-label="Carriles" className="space-y-1" data-testid="actividad-carriles">
          <h3 className="font-medium">Carriles</h3>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {carriles.map((c) => (
              <li key={c.vecino}>
                {nombrePorId.get(c.vecino) ?? c.vecino.slice(0, 8)} · {c.kbps > 0 ? `${c.kbps} kb/s` : "sin medir"}
                {c.rttMs ? ` · ${c.rttMs} ms` : ""} · {c.tunelesActivos} {c.tunelesActivos === 1 ? "túnel" : "túneles"} · {bytesTexto(c.bytesEnVuelo)} en vuelo
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Uso de hoy" className="space-y-1.5" data-testid="actividad-uso">
        <h3 className="font-medium">Uso de hoy</h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            A mis neuronas: {bytesTexto(s.bytesHoy.mias)} de {bytesTexto(topeMias)}
            <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded bg-white/10" aria-hidden>
              <span className="block h-full bg-[#39FF14]/70" style={{ width: `${pct(s.bytesHoy.mias, topeMias)}%` }} />
            </span>
          </p>
          <p>
            A otras cuentas: {bytesTexto(s.bytesHoy.otras)} de {bytesTexto(topeOtras)}
            <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded bg-white/10" aria-hidden>
              <span className="block h-full bg-[#39FF14]/70" style={{ width: `${pct(s.bytesHoy.otras, topeOtras)}%` }} />
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

export default PanelActividadMalla;
