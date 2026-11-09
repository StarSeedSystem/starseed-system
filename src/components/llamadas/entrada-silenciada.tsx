"use client";

/** «Llamada silenciada (hasta 18:30)» con «Deshacer»: lo que sustituye al timbre cuando un silencio cubre la llamada (LLA1108F). */
import { BellOff } from "lucide-react";
import { quitarSilencio } from "@/lib/llamadas/nativa/acciones-timbre";
import { textoLlamadaSilenciada, type Silencio } from "@/lib/llamadas/silencio-llamadas";

export function EntradaSilenciada({ nombre, silencio }: { nombre: string; silencio: Silencio }) {
    return (
        <section
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-[400px] items-center gap-3 rounded-[20px] px-4 py-3 text-white"
            style={{ background: "rgba(12,14,34,.78)", border: "1px solid rgba(255,255,255,.08)" }}
            data-testid="llamada-silenciada"
        >
            <BellOff className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{nombre}</p>
                <p className="truncate text-[12px] text-white/65">{textoLlamadaSilenciada(silencio, Date.now())}</p>
            </div>
            <button type="button" onClick={() => quitarSilencio(silencio.id)} className="cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#a996ff] hover:bg-white/10">
                Deshacer
            </button>
        </section>
    );
}
