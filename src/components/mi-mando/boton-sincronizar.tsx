"use client";

/**
 * «Sincronizar ahora» + cuándo fue la última vez. Lo usan Inicio y Archivos;
 * la lógica (tres canales, uno a la vez) vive en el contexto compartido para
 * que dos botones nunca lancen dos sincronizaciones a la vez.
 */

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { etiquetaTiempoReal, haceCuantoMs } from "@/lib/mi-mando/avisos";

import { useMiMando } from "./contexto";

export function BotonSincronizar({ compacto = false }: { compacto?: boolean }) {
    const { sincronizacion, sesion } = useMiMando();
    // Reloj de 30 s: basta para que «hace 1 min» avance sin re-renderizar de más.
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="space-y-2">
            {!compacto && (
                <dl className="grid grid-cols-1 gap-1 text-xs text-white/65 sm:grid-cols-2">
                    <div>
                        <dt className="text-white/45">Última sincronización desde este panel</dt>
                        <dd className="font-medium text-white/85">{haceCuantoMs(sincronizacion.ultima, ahora)}</dd>
                    </div>
                    <div>
                        <dt className="text-white/45">Sincronización en tiempo real</dt>
                        <dd className="font-medium text-white/85">{etiquetaTiempoReal(sesion.activa ? sincronizacion.tiempoReal : "no-session")}</dd>
                    </div>
                </dl>
            )}
            {compacto && (
                <p className="text-xs text-white/60">
                    Última vez: <span className="font-medium text-white/85">{haceCuantoMs(sincronizacion.ultima, ahora)}</span>
                </p>
            )}
            <Button
                size="sm"
                variant="outline"
                onClick={() => void sincronizacion.sincronizar()}
                disabled={sincronizacion.enCurso}
                aria-busy={sincronizacion.enCurso}
            >
                {sincronizacion.enCurso ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                {sincronizacion.enCurso ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
            {!sesion.cargando && !sesion.activa && (
                <p className="text-[11px] text-amber-200/80">Sin sesión: todo sigue guardado en este dispositivo, pero no se copia a tu cuenta.</p>
            )}
        </div>
    );
}
