"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const CLAVE_VOZ_RT = "starseed.voz-rt.voz";
export const FRASE_PRUEBA_VOZ_RT =
    "Hola, soy Astraura. Así sonaré en nuestras conversaciones.";

interface EstadoServidor {
    listo?: boolean;
    voces?: unknown;
}

function etiquetaVoz(voz: string): string {
    return `${voz.startsWith("F") ? "Femenina" : "Masculina"} ${voz.slice(1)}`;
}

export function SelectorVozRT() {
    const [voces, setVoces] = useState<string[]>([]);
    const [elegida, setElegida] = useState("");
    const [guardada, setGuardada] = useState("");
    const [cargando, setCargando] = useState(true);
    const [probando, setProbando] = useState("");
    const [aviso, setAviso] = useState("");

    useEffect(() => {
        const corte = new AbortController();
        void cargarVoces(corte.signal);
        return () => corte.abort();

        async function cargarVoces(signal: AbortSignal) {
            try {
                const respuesta = await fetch("/api/voz-rt/status", { cache: "no-store", signal });
                const estado = (await respuesta.json()) as EstadoServidor;
                const lista = Array.isArray(estado.voces)
                    ? estado.voces.filter((voz): voz is string => typeof voz === "string" && /^[FM][1-5]$/.test(voz))
                    : [];
                if (!respuesta.ok || !estado.listo || lista.length === 0) throw new Error("servidor no disponible");
                const unicas = [...new Set(lista)].sort();
                let previa = "";
                try { previa = window.localStorage.getItem(CLAVE_VOZ_RT) ?? ""; } catch { /* sin almacenamiento */ }
                setVoces(unicas);
                setGuardada(unicas.includes(previa) ? previa : "");
                setElegida(unicas.includes(previa) ? previa : unicas[0]);
            } catch {
                if (!signal.aborted) setAviso("El servidor de voz en vivo no está disponible.");
            } finally {
                if (!signal.aborted) setCargando(false);
            }
        }
    }, []);

    async function probar(voz: string): Promise<void> {
        setElegida(voz);
        setProbando(voz);
        setAviso("");
        try {
            const respuesta = await fetch("/api/voz-rt/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texto: FRASE_PRUEBA_VOZ_RT, voz }),
            });
            if (!respuesta.ok) throw new Error("síntesis no disponible");
            const url = URL.createObjectURL(await respuesta.blob());
            const audio = new Audio(url);
            const limpiar = () => URL.revokeObjectURL(url);
            audio.addEventListener("ended", limpiar, { once: true });
            audio.addEventListener("error", limpiar, { once: true });
            await audio.play();
        } catch {
            setAviso("No pude reproducir la prueba: el servidor de voz no está disponible.");
        } finally {
            setProbando("");
        }
    }

    function usar(voz: string): void {
        try {
            window.localStorage.setItem(CLAVE_VOZ_RT, voz);
            setGuardada(voz);
            setElegida(voz);
            setAviso(`${etiquetaVoz(voz)} será la voz de las conversaciones.`);
        } catch {
            setAviso("No pude guardar la voz en este dispositivo.");
        }
    }

    return (
        <section aria-label="Voz de la conversación en vivo" className="rounded-2xl border border-cyan-300/20 bg-white/[0.04] p-4 shadow-[0_18px_55px_rgba(0,240,255,0.08)] backdrop-blur-xl">
            <header className="mb-4 flex items-start gap-3">
                <span className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 p-2 text-cyan-200"><Volume2 className="h-4 w-4" aria-hidden /></span>
                <div><h2 className="text-sm font-semibold text-white">Voz de la conversación</h2><p className="text-xs text-white/50">Escucha cada estilo de Supertonic y elige uno para Astraura.</p></div>
            </header>
            {cargando && <p className="flex items-center gap-2 text-xs text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando voces…</p>}
            {!cargando && voces.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
                {voces.map((voz) => <article key={voz} className={cn("rounded-xl border p-3 transition-colors", elegida === voz ? "border-cyan-300/45 bg-cyan-400/10" : "border-white/10 bg-black/15")}>
                    <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-white">{etiquetaVoz(voz)}</span><code className="text-[10px] text-cyan-200/70">{voz}</code></div>
                    <div className="flex gap-2">
                        <button type="button" aria-label={`Probar ${etiquetaVoz(voz)}`} disabled={probando !== ""} onClick={() => void probar(voz)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">{probando === voz ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />} Probar</button>
                        <button type="button" aria-label={`Usar ${etiquetaVoz(voz)}`} onClick={() => usar(voz)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/20">{guardada === voz && <Check className="h-3 w-3" aria-hidden />} Usar esta</button>
                    </div>
                </article>)}
            </div>}
            {aviso && <p role="status" className="mt-3 text-xs text-cyan-100/75">{aviso}</p>}
        </section>
    );
}

export default SelectorVozRT;
