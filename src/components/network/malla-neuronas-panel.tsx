"use client";

/**
 * MallaNeuronasPanel — «Dispositivos de tu malla» + «Neuronas cercanas de
 * otras cuentas» (Ola 366). Lee el estado que ya publica el motor global
 * (`useMallaNeuronasEstado`, montado UNA vez por `MallaNeuronasMount`) — este
 * panel es solo lectura, no arranca ningún poll ni mesh por su cuenta.
 *
 * Mobile-first (390 px), iconos lucide, cursor-pointer, sin emojis.
 */

import { useState } from "react";
import { Laptop, Monitor, RadioTower, Server, Smartphone, Tablet, Wifi, Loader2, XCircle, Radar, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  useMallaNeuronasEstado,
  type DispositivoMallaRow,
  type NeuronaCercanaRow,
} from "@/lib/network/malla-neuronas";
import type { NeuronKind } from "@/lib/neurons/neurons";
import { useTransferenciasArchivo } from "@/lib/network/archivos-malla";
import { EnviarArchivoBoton, TransferenciasArchivoLista } from "@/components/network/transferencias-archivo-panel";
import { findSource } from "@/ai/astraura/free-catalog";

/** Máximo de chips de fuente antes de agrupar el resto en un "+N" (Ola 368). */
const MAX_CHIPS_FUENTES = 4;

/** Etiqueta corta de una fuente del catálogo (o el id crudo si no se encuentra). */
function etiquetaFuente(id: string): string {
  return findSource(id)?.label ?? id;
}

/** Chips "fuentesServibles" de un dispositivo: como mucho 4 + "+N" (Ola 368). */
function FuentesChips({ fuentes }: { fuentes: string[] }) {
  if (!fuentes.length) return null;
  const visibles = fuentes.slice(0, MAX_CHIPS_FUENTES);
  const resto = fuentes.length - visibles.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visibles.map((id) => (
        <Badge key={id} variant="outline" className="border-sky-400/30 text-[9px] text-sky-200/90">
          {etiquetaFuente(id)}
        </Badge>
      ))}
      {resto > 0 && (
        <Badge variant="outline" className="border-foreground/15 text-[9px] text-foreground/50" title={fuentes.slice(MAX_CHIPS_FUENTES).map(etiquetaFuente).join(", ")}>
          +{resto}
        </Badge>
      )}
    </div>
  );
}

function iconoTipo(tipo: NeuronKind) {
  switch (tipo) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    case "laptop":
      return Laptop;
    case "server":
      return Server;
    case "desktop":
      return Monitor;
    default:
      return Monitor;
  }
}

function timeAgo(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

function EnlaceBadge({ enlace }: { enlace: DispositivoMallaRow["enlace"] }) {
  if (enlace.estado === "conectado") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400/50 text-[9px] text-emerald-300">
        <Wifi className="h-3 w-3" /> conectado{typeof enlace.latenciaMs === "number" ? ` · ${enlace.latenciaMs} ms` : ""}
      </Badge>
    );
  }
  if (enlace.estado === "conectando") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-400/40 text-[9px] text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" /> conectando
      </Badge>
    );
  }
  if (enlace.estado === "fallido") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-400/40 text-[9px] text-red-300"
        title={enlace.motivo}
      >
        <XCircle className="h-3 w-3" /> fallido
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] text-foreground/45">
      sin vínculo
    </Badge>
  );
}

function DispositivoRow({ d }: { d: DispositivoMallaRow }) {
  const Icon = iconoTipo(d.tipo);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border p-2.5",
        d.esEsteDispositivo
          ? "border-sky-400/40 bg-sky-400/[0.06]"
          : d.online
            ? "border-foreground/10 bg-foreground/[0.03]"
            : "border-foreground/10 bg-foreground/[0.015] opacity-60",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/70">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{d.nombre}</span>
          {d.esEsteDispositivo && (
            <Badge variant="outline" className="border-sky-400/40 text-[9px] text-sky-300">
              este dispositivo
            </Badge>
          )}
          {!d.esEsteDispositivo && <EnlaceBadge enlace={d.enlace} />}
          {!d.esEsteDispositivo && d.online && d.syncDeviceId && d.enlace.estado === "conectado" && (
            <EnviarArchivoBoton deviceId={d.syncDeviceId} etiqueta={d.nombre} />
          )}
          <Badge
            variant="outline"
            className={cn("text-[9px]", d.online ? "border-emerald-400/30 text-emerald-300" : "text-foreground/40")}
          >
            {d.online ? "en línea" : "desconectada"}
          </Badge>
          {d.ficha?.sirveAstraura && (
            <Badge
              variant="outline"
              className="gap-1 border-violet-400/40 text-[9px] text-violet-300"
              title="Puede relayar Astraura 1.58 a otras neuronas de tu malla por WebRTC (sin túnel)"
            >
              <Brain className="h-3 w-3" />
              Sirve Astraura 1.58{typeof d.ficha.astrauraLatenciaMs === "number" ? ` · ${d.ficha.astrauraLatenciaMs} ms` : ""}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground/45">
          <span className="truncate">{d.plataforma}</span>
          {d.ficha && (
            <>
              <span>· {d.ficha.ramClase}</span>
              <span>· v{d.ficha.versionOS}</span>
              {d.ficha.backendLocal && <span className="text-emerald-300/80">· backend 1.58 local</span>}
            </>
          )}
        </div>
        {!d.esEsteDispositivo && <FuentesChips fuentes={d.ficha?.fuentesServibles ?? []} />}
      </div>
    </div>
  );
}

function CercanaRow({ b }: { b: NeuronaCercanaRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/60">
        <Radar className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{b.etiqueta}</span>
          <Badge variant="outline" className="border-foreground/20 text-[9px] text-foreground/55">
            detectada
          </Badge>
        </div>
        <div className="mt-0.5 text-[10px] text-foreground/45">
          {timeAgo(b.detectadaHaceMs)}
          {b.ofreceInternetPublico && <span> · ofrece internet público</span>}
        </div>
      </div>
      <button
        type="button"
        disabled
        title="Próximamente: vínculo con consentimiento de ambas cuentas"
        className="ml-auto shrink-0 cursor-not-allowed rounded-full border border-foreground/15 px-2.5 py-1 text-[10px] text-foreground/35"
      >
        Solicitar vínculo
      </button>
    </div>
  );
}

export function MallaNeuronasPanel({ compact = false }: { compact?: boolean }) {
  const { misDispositivos, cercanas, loading } = useMallaNeuronasEstado();
  const transferencias = useTransferenciasArchivo();
  const [tab, setTab] = useState<"propios" | "cercanas" | "archivos">("propios");

  const enLinea = misDispositivos.filter((d) => d.online).length;

  return (
    <div className={cn("space-y-3", compact ? "text-[12px]" : "text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        <RadioTower className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-semibold text-foreground">Dispositivos StarSeed</span>
        <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-300">
          {enLinea} en línea
        </Badge>
      </div>
      <p className="text-[10px] leading-snug text-foreground/45">
        Se detectan y se vinculan solos (WebRTC, sin botón) en cuanto dos dispositivos de tu cuenta están en línea a la
        vez. Separado de la radio LoRa: esto no usa ningún hardware, solo tu cuenta como buzón de señalización.
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab("propios")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "propios"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Tu malla ({misDispositivos.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("cercanas")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "cercanas"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Cercanas de otras cuentas ({cercanas.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("archivos")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "archivos"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Archivos ({transferencias.length})
        </button>
      </div>

      {tab === "archivos" ? (
        <TransferenciasArchivoLista />
      ) : tab === "propios" ? (
        <div className="space-y-1.5">
          {loading && misDispositivos.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Detectando tus dispositivos…
            </div>
          ) : misDispositivos.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Sin sesión, o aún no se ha registrado ninguna neurona en esta cuenta.
            </div>
          ) : (
            misDispositivos.map((d) => <DispositivoRow key={d.neuronId} d={d} />)
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {cercanas.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Ninguna neurona de otra cuenta detectada por ahora (radar de faros, últimos minutos).
            </div>
          ) : (
            cercanas.map((b) => <CercanaRow key={b.deviceId} b={b} />)
          )}
        </div>
      )}
    </div>
  );
}

export default MallaNeuronasPanel;
