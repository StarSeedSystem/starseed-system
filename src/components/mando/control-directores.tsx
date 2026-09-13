"use client";

/**
 * Pestaña Director del Mando (3/3 · p318H) — composición real.
 * Carga GET /api/mando/director al montar y cada 20 s (con limpieza del
 * intervalo y un error honesto si la API no responde), pinta la cabecera
 * con las cifras clave y monta las cuatro secciones ya reales (servicios,
 * agentes vivos, pendientes, proveedores) más una tarjeta de escalada
 * frente a sus topes configurados. Nada inventado: todo sale de la API.
 */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DirectorServicios } from "@/components/mando/director-servicios";
import { DirectorAgentesVivos, type ResumenAgentesVivos } from "@/components/mando/director-agentes-vivos";
import { DirectorPendientes } from "@/components/mando/director-pendientes";
import { DirectorProveedores } from "@/components/mando/director-proveedores";
import { MarcoWidget } from "@/components/dashboard/kit/marco-widget";
import { DEFAULTS, fusionar } from "@/lib/mando/director-config";
import type { ResumenDirector, ResumenPendientes, ResumenProveedor } from "@/lib/mando/director-datos";

interface RespuestaDirector {
    agentes: ResumenAgentesVivos;
    pendientes: ResumenPendientes;
    proveedores: ResumenProveedor[];
    directores: ResumenDirector[];
    escalada: { gastoHoy: number };
    config: Record<string, unknown>;
}

const INTERVALO_MS = 20_000;
const ERROR_LECTURA = "no se pudo leer /api/mando/director";

function Medidor({ etiqueta, valor, tono }: { etiqueta: string; valor: number | string; tono?: string }) {
    return (
        <div>
            <p className={`text-lg font-black ${tono ?? "text-foreground/90"}`}>{valor}</p>
            <p className="text-[10px] text-muted-foreground/70">{etiqueta}</p>
        </div>
    );
}

export function ControlDirectores() {
    const [datos, setDatos] = useState<RespuestaDirector | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        const cargar = async () => {
            try {
                const r = await fetch("/api/mando/director", { cache: "no-store" });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const cuerpo = (await r.json()) as RespuestaDirector;
                if (vivo) { setDatos(cuerpo); setError(null); }
            } catch {
                if (vivo) setError(ERROR_LECTURA);
            }
        };
        void cargar();
        const id = setInterval(() => void cargar(), INTERVALO_MS);
        return () => { vivo = false; clearInterval(id); };
    }, []);

    if (!datos) {
        return (
            <div className="rounded-xl border border-border/30 bg-black/20 p-4 text-sm text-muted-foreground/70" data-testid="control-directores">
                {error ? (
                    <span className="text-rose-400/80">{error}</span>
                ) : (
                    <span className="inline-flex items-center gap-2"><RefreshCw className="size-4 animate-spin" aria-hidden /> Cargando director…</span>
                )}
            </div>
        );
    }

    const config = fusionar(DEFAULTS, datos.config);
    const proveedoresVivos = datos.proveedores.filter((p) => p.vivo).length;

    return (
        <div className="flex flex-col gap-3" data-testid="control-directores">
            {error ? <p className="text-xs text-rose-400/80">{error}</p> : null}
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/30 bg-black/20 p-3 text-center sm:grid-cols-3 xl:grid-cols-6">
                <Medidor etiqueta="vivos" valor={datos.agentes.vivos} />
                <Medidor etiqueta="esperando aprobación" valor={datos.agentes.esperandoAprobacion} />
                <Medidor etiqueta="colgados" valor={datos.agentes.colgados} tono="text-rose-400" />
                <Medidor etiqueta="listas" valor={datos.pendientes.listas} />
                <Medidor etiqueta="bloqueadas" valor={datos.pendientes.bloqueadas.length} />
                <Medidor etiqueta="proveedores" valor={`${proveedoresVivos}/${datos.proveedores.length}`} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <DirectorServicios directores={datos.directores} />
                <DirectorAgentesVivos agentes={datos.agentes} />
                <DirectorPendientes pendientes={datos.pendientes} />
                <DirectorProveedores proveedores={datos.proveedores} />
            </div>

            <MarcoWidget titulo="Escalada" categoria="sistema">
                <div className="flex flex-col gap-1 p-3 text-xs" data-testid="director-escalada">
                    <p className="text-foreground/90">Gasto hoy: <span className="font-bold">{datos.escalada.gastoHoy}</span></p>
                    <p className="text-muted-foreground/70">
                        Tope haiku/día: {config.escalada.tope_haiku_dia} · Tope sonnet/día: {config.escalada.tope_sonnet_dia}
                        {config.escalada.activa ? "" : " · escalada desactivada"}
                    </p>
                </div>
            </MarcoWidget>
        </div>
    );
}
