"use client";

/**
 * CTL1117J · S3 · la VENTANA de aviso de que otra neurona pide ver o controlar ESTA (decisión 2 del dueño, 17-11).
 * Se monta UNA vez a nivel de app (dentro de `AnfitrionControl`, como el timbre de llamadas en `MontajeLlamadas`) y pinta los avisos de
 * `aviso-peticion.ts`. Es un aviso: NUNCA enciende, acepta ni concede nada. Su botón solo abre el ajuste local, donde decide la persona.
 */

import { useEffect, useSyncExternalStore } from "react";
import { avisosPeticionAbiertos, cerrarAvisoPeticion, suscribirAvisosPeticion, type AvisoPeticion } from "@/lib/control-remoto/aviso-peticion";

function useAvisos(): readonly AvisoPeticion[] {
    return useSyncExternalStore(suscribirAvisosPeticion, avisosPeticionAbiertos, avisosPeticionAbiertos);
}

function abrirAjuste(ruta: string) {
    try {
        void import("@/lib/notifications/avisos-mensajes").then((m) => m.abrirRuta(ruta));
    } catch {
        /* sin navegación: el aviso sigue en el centro de notificaciones */
    }
}

export function AvisoPeticionControl({ avisos }: { avisos?: readonly AvisoPeticion[] }) {
    const vivos = useAvisos();
    const lista = avisos ?? vivos;
    // Un aviso de estado «abierta» no se queda para siempre; los que piden algo esperan a que la persona los cierre.
    useEffect(() => {
        const ts = lista.filter((a) => a.estado === "abierta").map((a) => setTimeout(() => cerrarAvisoPeticion(a.id), 60_000));
        return () => ts.forEach(clearTimeout);
    }, [lista]);
    if (lista.length === 0) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147482000] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-end sm:pr-5" data-testid="avisos-peticion-control">
            {lista.map((a) => (
                <div key={a.id} role="alertdialog" aria-labelledby={`${a.id}-t`} aria-describedby={`${a.id}-c`} className="pointer-events-auto w-full max-w-sm space-y-2 rounded-xl border border-[#FFBF00]/60 bg-[#14110a]/95 p-3 text-[12px] text-white/85 shadow-xl" data-testid="aviso-peticion-control">
                    <p id={`${a.id}-t`} className="text-[13px] font-semibold text-[#FFBF00]">
                        {a.titulo}
                    </p>
                    <p id={`${a.id}-c`} className="text-white/75">
                        {a.cuerpo}
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                        {a.boton && (
                            <button
                                type="button"
                                onClick={() => {
                                    abrirAjuste(a.ruta);
                                    cerrarAvisoPeticion(a.id);
                                }}
                                data-testid="aviso-peticion-abrir"
                                className="min-h-9 cursor-pointer rounded-lg bg-[#FFBF00] px-3 py-1 font-medium text-black transition-colors hover:bg-[#d9a200]"
                            >
                                {a.boton}
                            </button>
                        )}
                        <button type="button" onClick={() => cerrarAvisoPeticion(a.id)} data-testid="aviso-peticion-cerrar" className="min-h-9 cursor-pointer rounded-lg border border-white/20 px-3 py-1 text-white/75 hover:bg-white/10">
                            Cerrar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default AvisoPeticionControl;
