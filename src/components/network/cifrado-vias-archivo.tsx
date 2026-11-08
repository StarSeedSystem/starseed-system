"use client";

/**
 * cifrado-vias-archivo — la franja compacta de un archivo que viaja por la malla (MPT1108B · 2026-11-08):
 *   · el candado «Cifrado de archivo» (o el aviso «Sin cifrado de archivo»);
 *   · el reparto vivo por vías («Red local 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %») y la velocidad total;
 *   · al terminar, «Verificado (SHA-256)».
 * Solo pinta lo que el motor ya anotó en el estado de la transferencia: nada se inventa. Sin datos, no pinta nada.
 */

import { Lock, ShieldAlert, ShieldCheck, Split } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DatosCifradoVias {
  cifradoArchivo?: "archivo" | "sin-cifrado-de-archivo";
  repartoVias?: string;
  velocidadBps?: number;
  /** El SHA-256 del archivo completo ya coincidió. */
  verificado?: boolean;
}

/** «1,2 MB/s», «340 KB/s»… Puro. */
export function textoVelocidad(bps: number | undefined): string | null {
  if (typeof bps !== "number" || !Number.isFinite(bps) || bps <= 0) return null;
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${Math.round(bps / 1024)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1).replace(".", ",")} MB/s`;
}

export function CifradoViasArchivo({ cifradoArchivo, repartoVias, velocidadBps, verificado, className }: DatosCifradoVias & { className?: string }) {
  const vel = textoVelocidad(velocidadBps);
  if (!cifradoArchivo && !repartoVias && !vel && !verificado) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-white/70", className)} data-testid="cifrado-vias-archivo">
      {cifradoArchivo === "archivo" && (
        <span className="inline-flex items-center gap-1 text-[#6ee7b7]" title="El archivo va cifrado de punta a punta: ni los relés ni los servidores ven su contenido." data-testid="candado-archivo">
          <Lock className="h-3 w-3" aria-hidden /> Cifrado de archivo
        </span>
      )}
      {cifradoArchivo === "sin-cifrado-de-archivo" && (
        <span className="inline-flex items-center gap-1 text-[#fbbf24]" title="El otro aparato es de una versión anterior: el archivo solo va protegido por el enlace, no de punta a punta." data-testid="aviso-sin-cifrado">
          <ShieldAlert className="h-3 w-3" aria-hidden /> Sin cifrado de archivo
        </span>
      )}
      {repartoVias && (
        <span className="inline-flex min-w-0 items-center gap-1" title="Por dónde van los trozos ahora mismo" data-testid="reparto-vias">
          <Split className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{repartoVias}</span>
        </span>
      )}
      {vel && <span data-testid="velocidad-total">{vel}</span>}
      {verificado && (
        <span className="inline-flex items-center gap-1 text-[#6ee7b7]" data-testid="verificado-sha">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Verificado (SHA-256)
        </span>
      )}
    </div>
  );
}
