"use client";

/**
 * Pestaña Director del Mando (1/3 · p318F) — directores reales.
 * ─────────────────────────────────────────────────────────────────────────────
 * Una tarjeta por director de `resumenDirectores` (director-datos.ts): pid o
 * «caído», última salida, último mensaje del canal con «hace N min», y un
 * botón «Reiniciar» que habla con `POST /api/mando/director/accion`. Si la
 * API no trae uno de los siete directores conocidos, su tarjeta queda honesta:
 * «sin datos».
 */

import { useState } from "react";
import { RotateCw } from "lucide-react";
import type { ResumenDirector } from "@/lib/mando/director-datos";
import { MarcoWidget } from "@/components/dashboard/kit/marco-widget";

const NOMBRES_DIRECTORES = ["vigilante", "director", "guardia", "eco", "ecoides", "telegram", "mando"] as const;

function textoHace(segundos?: number): string {
    if (segundos === undefined) return "";
    return segundos < 60 ? "hace instantes" : `hace ${Math.round(segundos / 60)} min`;
}

function textoSalida(epoch?: number): string {
    if (!epoch || epoch <= 0) return "sin salida registrada";
    const d = new Date(epoch * 1000);
    return Number.isNaN(d.getTime()) ? "sin salida registrada" : d.toLocaleString("es-ES");
}

async function reiniciarServicio(nombre: string): Promise<{ ok: boolean; detalle: string }> {
    try {
        const r = await fetch("/api/mando/director/accion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accion: "reiniciar_servicio", nombre }),
        });
        const cuerpo = (await r.json()) as { ok?: boolean; detalle?: string; error?: string };
        return { ok: Boolean(cuerpo.ok), detalle: cuerpo.detalle ?? cuerpo.error ?? `HTTP ${r.status}` };
    } catch {
        return { ok: false, detalle: "No se pudo hablar con el Mando." };
    }
}

function TarjetaDirector({ resumen }: { resumen: ResumenDirector }) {
    const [ocupado, setOcupado] = useState(false);
    const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);

    const onReiniciar = async () => {
        setOcupado(true);
        setResultado(null);
        setResultado(await reiniciarServicio(resumen.nombre));
        setOcupado(false);
    };

    return (
        <div
            className="flex flex-col gap-1.5 rounded-xl border border-border/30 bg-black/20 p-3 text-xs"
            data-testid={`director-${resumen.nombre}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold uppercase tracking-wide text-foreground/90">{resumen.nombre}</span>
                <span className={`font-semibold ${resumen.vivo ? "text-emerald-400" : "text-rose-400"}`}>
                    {resumen.vivo ? `pid ${resumen.pid}` : "caído"}
                </span>
            </div>
            <p className="text-[11px] text-muted-foreground/70">Última salida: {textoSalida(resumen.ultimaSalida)}</p>
            <p className="truncate text-[11px] text-muted-foreground/70">
                {resumen.ultimoMensaje ? `«${resumen.ultimoMensaje}» ${textoHace(resumen.hace)}` : "sin mensajes en el canal"}
            </p>
            <button
                type="button"
                disabled={ocupado}
                onClick={() => void onReiniciar()}
                className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RotateCw className={ocupado ? "size-3 animate-spin" : "size-3"} aria-hidden /> {ocupado ? "Reiniciando…" : "Reiniciar"}
            </button>
            {resultado ? (
                <p className={`text-[10px] ${resultado.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>{resultado.detalle}</p>
            ) : null}
        </div>
    );
}

function TarjetaSinDatos({ nombre }: { nombre: string }) {
    return (
        <div
            className="flex flex-col gap-1.5 rounded-xl border border-border/20 bg-black/10 p-3 text-xs opacity-60"
            data-testid={`director-${nombre}`}
        >
            <span className="font-bold uppercase tracking-wide text-foreground/70">{nombre}</span>
            <p className="text-[11px] text-muted-foreground/60">sin datos</p>
        </div>
    );
}

export function DirectorServicios({ directores }: { directores: ResumenDirector[] }) {
    const porNombre = new Map(directores.map((d) => [d.nombre, d]));
    return (
        <MarcoWidget titulo="Directores" categoria="sistema">
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="director-servicios">
                {NOMBRES_DIRECTORES.map((nombre) => {
                    const resumen = porNombre.get(nombre);
                    return resumen ? <TarjetaDirector key={nombre} resumen={resumen} /> : <TarjetaSinDatos key={nombre} nombre={nombre} />;
                })}
            </div>
        </MarcoWidget>
    );
}
