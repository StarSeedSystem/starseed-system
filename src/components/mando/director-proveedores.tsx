"use client";

/**
 * Pestaña Director del Mando (2/3 · p318G) — proveedores con salud.
 * Una fila por proveedor: nombre, estado, motivo, número de modelos.
 * Botones Apartar/Reactivar y enlace check-in si lo necesita.
 */

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import type { ResumenProveedor } from "@/lib/mando/director-datos";
import { MarcoWidget } from "@/components/dashboard/kit/marco-widget";

function calcularSinCupoHasta(value: number | string | undefined): string {
  if (value === undefined) return "";
  const epoch = typeof value === "string" ? Math.floor(new Date(value).getTime() / 1000) : value;
  if (Number.isNaN(epoch)) return "";
  const d = new Date(epoch * 1000);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

async function accionProveedor(
  accion: string,
  proveedor: string,
  extra: Record<string, unknown> = {}
): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await fetch("/api/mando/director/accion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, proveedor, ...extra }),
    });
    const cuerpo = (await r.json()) as { ok?: boolean; detalle?: string; error?: string };
    return { ok: Boolean(cuerpo.ok), detalle: cuerpo.detalle ?? cuerpo.error ?? `HTTP ${r.status}` };
  } catch {
    return { ok: false, detalle: "No se pudo hablar con el Mando." };
  }
}

function FilaProveedor({ proveedor }: { proveedor: ResumenProveedor }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);

  const onAccion = async (accion: string, extra: Record<string, unknown> = {}) => {
    setOcupado(accion);
    setResultado(null);
    setResultado(await accionProveedor(accion, proveedor.proveedor, extra));
    setOcupado(null);
  };

  const sinCupoHasta = calcularSinCupoHasta(proveedor.sinCupoHasta);
  const estadoTexto =
    proveedor.vivo ? "vivo" : sinCupoHasta ? `sin cupo hasta ${sinCupoHasta}` : "caído";
  const estadoColor = proveedor.vivo ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/20 bg-black/10 px-3 py-2 text-xs" data-testid={`proveedor-${proveedor.proveedor}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground/90">{proveedor.proveedor}</span>
        <span className={`font-semibold ${estadoColor}`}>{estadoTexto}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>{proveedor.modelos} modelo{proveedor.modelos !== 1 ? "s" : ""}</span>
        {proveedor.motivo ? <span>{proveedor.motivo}</span> : null}
      </div>

      {proveedor.necesitaCheckin ? (
        <a
          href="https://apinex.bond/airdrop?tab=quests"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-semibold text-sky-400 hover:underline"
        >
          check-in diario pendiente (lo hace una persona)
        </a>
      ) : null}

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => void onAccion("apartar_proveedor", { horas: 24 })}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PowerOff className="size-3" aria-hidden /> {ocupado === "apartar_proveedor" ? "…" : "Apartar 24 h"}
        </button>
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => void onAccion("reactivar_proveedor")}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Power className="size-3" aria-hidden /> {ocupado === "reactivar_proveedor" ? "…" : "Reactivar"}
        </button>
      </div>

      {resultado ? (
        <p className={`text-[10px] ${resultado.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>{resultado.detalle}</p>
      ) : null}
    </div>
  );
}

export function DirectorProveedores({ proveedores }: { proveedores: ResumenProveedor[] }) {
  return (
    <MarcoWidget titulo="Proveedores" categoria="sistema">
      <div className="flex h-full flex-col gap-2 p-3 overflow-y-auto" data-testid="director-proveedores">
        {proveedores.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">la API no trae proveedores</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {proveedores.map((p) => <FilaProveedor key={p.proveedor} proveedor={p} />)}
          </div>
        )}
      </div>
    </MarcoWidget>
  );
}
