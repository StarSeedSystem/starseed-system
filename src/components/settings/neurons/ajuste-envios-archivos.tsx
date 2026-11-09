"use client";

/**
 * AjusteEnviosArchivos — Ajustes › Neuronas › Medios: «Envíos de archivos» (PTA1108C · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.2. Enlaza con los ajustes que ya existen en código
 * (`ajustes-vias-archivo.ts`, localStorage `starseed.archivos.vias.v1`):
 *   · Cifrado de archivo de punta a punta: activo, siempre (informativo; no hay interruptor para apagarlo).
 *   · Multitrayecto: Automático / Solo directo.
 *   · Relés: mis neuronas (encendido, con batería mínima y datos al día), relé de StarSeed para trozos sellados (encendido)
 *     y relés de terceros (apagado).
 *   · Envíos sellados recientes con el reparto por vía que anotó el motor.
 * Presentación pura (`EnviosArchivosVista`) + envoltorio con los ajustes reales y el estado de las transferencias.
 */

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { guardarAjustesVias, leerAjustesVias, type AjustesViasArchivo } from "@/lib/malla/ajustes-vias-archivo";
import { useTransferenciasArchivo, type EstadoTransferencia } from "@/lib/network/archivos-malla";

const MIB = 1024 * 1024;
const BATERIAS = [0.2, 0.3, 0.5, 0.7];
const TOPES_DIA = [64 * MIB, 256 * MIB, 1024 * MIB, 4096 * MIB];

export const textoTope = (b: number): string => (b >= 1024 * MIB ? `${Math.round(b / 1024 / MIB)} GiB` : `${Math.round(b / MIB)} MiB`);

/** Las últimas transferencias cifradas de archivo (las más nuevas primero). Puro. */
export function enviosSelladosRecientes(ts: readonly EstadoTransferencia[], max = 5): EstadoTransferencia[] {
  return ts
    .filter((t) => t.cifradoArchivo === "archivo" && t.fase !== "pendiente-aceptar")
    .slice()
    .sort((a, b) => b.actualizadoMs - a.actualizadoMs)
    .slice(0, max);
}

const FASE: Record<string, string> = { completada: "completado", error: "con error", cancelada: "cancelado", rechazada: "rechazado" };

interface VistaProps {
  ajustes: AjustesViasArchivo;
  onCambiar: (parche: Partial<AjustesViasArchivo>) => void;
  transferencias: readonly EstadoTransferencia[];
}

function Interruptor({ id, marcado, onChange, titulo, detalle }: { id: string; marcado: boolean; onChange: (v: boolean) => void; titulo: string; detalle: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
      <input id={id} type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[#39FF14]" />
      <span>
        <span className="font-medium">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{detalle}</span>
      </span>
    </label>
  );
}

export function EnviosArchivosVista({ ajustes: a, onCambiar, transferencias }: VistaProps) {
  const recientes = enviosSelladosRecientes(transferencias);
  return (
    <Card className="bg-background/40 backdrop-blur-sm" data-testid="ajuste-envios-archivos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-[#39FF14]" aria-hidden /> Medios · Envíos de archivos
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Un archivo se cifra en tu neurona antes de salir y solo lo abre la neurona que lo recibe. Los trozos pueden viajar a la vez por varias vías; los relés solo llevan texto cifrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 px-3 py-2 text-emerald-200" data-testid="estado-cifrado-archivo" role="status">
          <strong>Cifrado de archivo de punta a punta: activo.</strong>
          <span className="block text-xs text-emerald-200/80">
            Siempre encendido: no se puede apagar. Si el otro aparato es antiguo y no sabe abrir archivos cifrados, el envío se marca «sin cifrado de archivo» y se avisa.
          </span>
        </p>

        <fieldset className="space-y-1.5" aria-label="Multitrayecto">
          <legend className="mb-1 font-medium">Multitrayecto</legend>
          {(
            [
              { id: "automatico", nombre: "Automático", detalle: "Usa a la vez todas las vías permitidas que llegan al destino (red local, Wi‑Fi directo, Bluetooth, relés)." },
              { id: "directas", nombre: "Solo directo", detalle: "Solo enlaces directos entre las dos neuronas; nunca relés." },
            ] as const
          ).map((m) => (
            <label key={m.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors", a.modo === m.id ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 hover:border-white/25")}>
              <input type="radio" name="envios-modo" checked={a.modo === m.id} onChange={() => onCambiar({ modo: m.id })} className="mt-1 accent-[#39FF14]" />
              <span>
                <span className="font-medium">{m.nombre}</span>
                <span className="block text-xs text-muted-foreground">{m.detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1.5" aria-label="Relés" disabled={a.modo === "directas"}>
          <legend className="mb-1 font-medium">Relés {a.modo === "directas" && <span className="text-xs font-normal text-muted-foreground">(apagados con «Solo directo»)</span>}</legend>
          <Interruptor
            id="envios-rele-neuronas"
            marcado={a.releNeuronas}
            onChange={(v) => onCambiar({ releNeuronas: v })}
            titulo="Mis neuronas como relé"
            detalle="Otra neurona mía hace de salto para mis archivos. Con los topes de abajo."
          />
          {a.releNeuronas && (
            <div className="flex flex-wrap items-center gap-3 pl-7 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                Batería mínima
                <select
                  aria-label="Batería mínima para hacer de salto"
                  value={String(BATERIAS.includes(a.bateriaMinSalto) ? a.bateriaMinSalto : BATERIAS[1])}
                  onChange={(e) => onCambiar({ bateriaMinSalto: Number(e.target.value) })}
                  className="rounded border border-white/15 bg-background px-1.5 py-0.5"
                >
                  {BATERIAS.map((b) => (
                    <option key={b} value={String(b)}>
                      {Math.round(b * 100)} %
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Datos al día
                <select
                  aria-label="Datos que presto al día como salto"
                  value={String(TOPES_DIA.includes(a.maxBytesSaltoDia) ? a.maxBytesSaltoDia : TOPES_DIA[1])}
                  onChange={(e) => onCambiar({ maxBytesSaltoDia: Number(e.target.value) })}
                  className="rounded border border-white/15 bg-background px-1.5 py-0.5"
                >
                  {TOPES_DIA.map((t) => (
                    <option key={t} value={String(t)}>
                      {textoTope(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <Interruptor
            id="envios-rele-starseed"
            marcado={a.releServidor}
            onChange={(v) => onCambiar({ releServidor: v })}
            titulo="Relé de StarSeed para trozos sellados"
            detalle={`Solo texto cifrado, hasta ${textoTope(a.maxBytesRele)} por vía. Cuando no hay camino directo, el relé también lleva las confirmaciones de vuelta.`}
          />
          <Interruptor
            id="envios-rele-terceros"
            marcado={a.releTerceros}
            onChange={(v) => onCambiar({ releTerceros: v })}
            titulo="Relés de terceros"
            detalle="Apagado por defecto. Un tercero ve el tamaño y la hora de cada trozo, nunca el contenido."
          />
        </fieldset>

        <div data-testid="envios-recientes">
          <p className="mb-1 font-medium">Envíos sellados recientes</p>
          {recientes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no has enviado ni recibido archivos sellados en esta sesión.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {recientes.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="max-w-[40%] truncate font-medium text-foreground/80" title={t.nombre}>
                    {t.nombre}
                  </span>
                  <Badge variant="outline">{t.rol === "enviar" ? "enviado" : "recibido"}</Badge>
                  <span>{FASE[t.fase] ?? "en curso"}</span>
                  <span>{t.repartoVias ?? t.via ?? "una sola vía"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Con los ajustes reales (localStorage) y las transferencias vivas del motor. */
export function AjusteEnviosArchivos() {
  const [ajustes, setAjustes] = useState<AjustesViasArchivo>(() => leerAjustesVias());
  const transferencias = useTransferenciasArchivo();
  useEffect(() => {
    const alAlmacen = (e: StorageEvent): void => {
      if (e.key === null || e.key === "starseed.archivos.vias.v1") setAjustes(leerAjustesVias());
    };
    window.addEventListener("storage", alAlmacen);
    return () => window.removeEventListener("storage", alAlmacen);
  }, []);
  const cambiar = useCallback((parche: Partial<AjustesViasArchivo>) => setAjustes(guardarAjustesVias(parche)), []);
  return <EnviosArchivosVista ajustes={ajustes} onCambiar={cambiar} transferencias={transferencias} />;
}
