"use client";

/**
 * Ruta /xr/diagnostico (XR1010AI, contrato `architecture/starseed-xr.md` §3 l). El informe del visor
 * DE VERDAD: sondea con `useCapacidadesXR` (XR1010B), ofrece «Entrar en VR/AR para medir» con el
 * almacén XR (XR1010D, import perezoso), mide 10 s de fotogramas con el bucle de la propia sesión
 * (medidor propio: `crearMedidor` de XR1010AE aún no existe), lee `enabledFeatures`,
 * `supportedFrameRates` y las `inputSources`, prueba el micrófono SOLO al pulsar el botón (nunca
 * pide cámara, §3 k) y copia el informe (clipboard con respaldo de selección). La lógica del
 * informe vive en el módulo puro `src/lib/xr/diagnostico.ts`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Glasses, Mic } from "lucide-react";
import { modeloQuest } from "@/lib/xr/capacidades";
import { nivelInicial } from "@/lib/xr/calidad";
import { perfilDeNivel } from "@/lib/xr/calidad-perfiles";
import { construirInforme, resumirFotogramas } from "@/lib/xr/diagnostico";
import type { SesionDiag, CalidadDiag, MicrofonoDiag } from "@/lib/xr/diagnostico";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";

export const dynamic = "force-dynamic";

/** Lo mínimo de `XRSession` que se usa (estándar WebXR más las extensiones de Chrome). */
interface SesionMedible {
    enabledFeatures?: readonly string[];
    supportedFrameRates?: ArrayLike<number>;
    inputSources?: ArrayLike<{ targetRayMode: string; handedness?: string }>;
    foveation?: number;
    frameRate?: number;
    requestAnimationFrame(fn: (t: number) => void): void;
    end(): Promise<void>;
}

interface Medicion { sesion: SesionDiag; entradas: string[]; calidad: CalidadDiag }

const COLOR: Record<string, string> = {
    ok: "text-emerald-300", aviso: "text-amber-300", fallo: "text-[#DC143C]", "sin-probar": "text-white/60",
};

const BOTON =
    "cursor-pointer inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 " +
    "bg-[#0E101E]/90 px-5 text-sm font-medium text-[#F5F7FF] transition duration-150 hover:bg-[#0E101E] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70";

export default function PaginaDiagnosticoXR() {
    const { estado, datos, capacidades, plan } = useCapacidadesXR();
    const [medicion, setMedicion] = useState<Medicion | null>(null);
    const [microfono, setMicrofono] = useState<MicrofonoDiag | undefined>(undefined);
    const [midiendo, setMidiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [ahora, setAhora] = useState<number | null>(null);
    useEffect(() => { setAhora(Date.now()); }, []);
    const perfil = useMemo(
        () => perfilDeNivel(nivelInicial({ plataforma: capacidades.plataforma, modelo: modeloQuest(datos.ua) })),
        [capacidades.plataforma, datos.ua],
    );
    const inmersivos = capacidades.modos.filter((m): m is "vr-inmersivo" | "ar-passthrough" => m === "vr-inmersivo" || m === "ar-passthrough");

    const medir = useCallback(async (tipo: "vr-inmersivo" | "ar-passthrough") => {
        setMidiendo(true);
        setError(null);
        try {
            // Import perezoso: la librería XR no sube al layout raíz (§0.6).
            const { obtenerAlmacenXR } = await import("@/components/xr/shell/almacen-xr");
            const almacen = await obtenerAlmacenXR({ perfil, capacidades });
            const abierta = tipo === "vr-inmersivo" ? await almacen.enterVR() : await almacen.enterAR();
            const sesion = abierta as SesionMedible | null;
            if (!sesion) throw new Error("El navegador no abrió la sesión inmersiva.");
            const dt: number[] = [];
            let anterior = 0;
            let vivo = true;
            const recoger = (t: number) => {
                if (!vivo) return;
                if (anterior > 0) dt.push(t - anterior);
                anterior = t;
                sesion.requestAnimationFrame(recoger);
            };
            sesion.requestAnimationFrame(recoger);
            await new Promise<void>((fin) => setTimeout(fin, 10_000));
            vivo = false;
            const resumen = resumirFotogramas(dt);
            if (dt.length === 0) throw new Error("La sesión no entregó ningún fotograma para medir.");
            setMedicion({
                sesion: {
                    modo: tipo,
                    funcionesConcedidas: Array.from(sesion.enabledFeatures ?? []),
                    frecuenciasSoportadas: Array.from(sesion.supportedFrameRates ?? []),
                    frecuenciaActual: sesion.frameRate,
                    foveacion: sesion.foveation,
                },
                entradas: Array.from(sesion.inputSources ?? []).map((f) =>
                    f.targetRayMode + (f.handedness && f.handedness !== "none" ? ` (${f.handedness})` : "")),
                calidad: { nivel: perfil.nivel, modo: "auto", frameMsMedia: resumen.media, frameMsP95: resumen.p95 },
            });
            setAhora(Date.now());
            await sesion.end();
        } catch (e) {
            setError(mensajeErrorXR(e));
        } finally {
            setMidiendo(false);
        }
    }, [capacidades, perfil]);

    const probarMicrofono = useCallback(async () => {
        try {
            const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
            audio.getTracks().forEach((t) => t.stop());
            setMicrofono("concedido");
        } catch {
            setMicrofono("denegado");
        }
        setAhora(Date.now());
    }, []);

    const informe = useMemo(() => {
        if (ahora === null) return null;
        return construirInforme({
            datos, capacidades, plan, sesion: medicion?.sesion, calidad: medicion?.calidad,
            entradas: medicion?.entradas, microfono, ahora,
        });
    }, [ahora, datos, capacidades, plan, medicion, microfono]);

    const copiar = useCallback(async () => {
        if (!informe) return;
        try {
            await navigator.clipboard.writeText(informe.texto);
        } catch {
            // Respaldo sin clipboard: selección en un área oculta y copia del sistema.
            const area = document.createElement("textarea");
            area.value = informe.texto;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            document.body.removeChild(area);
        }
        setCopiado(true);
    }, [informe]);

    return (
        <section className="flex min-h-[78vh] flex-1 flex-col gap-4 text-[#F5F7FF]">
            <header>
                <h1 className="text-2xl font-bold text-amber-50">Diagnóstico XR · lo que de verdad hay</h1>
                <p className="mt-1 text-sm text-white/50">
                    Capacidades esperadas frente a lo concedido de verdad
                    (<span className="font-mono">enabledFeatures</span>), frecuencia, fotogramas, entradas y micrófono.
                </p>
            </header>
            <div className="flex flex-wrap items-center gap-3">
                {estado === "sondeando" && <p className="text-sm text-white/60" role="status">Comprobando el visor…</p>}
                {inmersivos.map((modo) => (
                    <button key={modo} type="button" disabled={midiendo} onClick={() => void medir(modo)} className={BOTON}>
                        <Glasses className="h-4 w-4" aria-hidden="true" />
                        {midiendo ? "Midiendo 10 s…" : modo === "vr-inmersivo" ? "Entrar en VR para medir" : "Entrar en AR para medir"}
                    </button>
                ))}
                <button type="button" onClick={() => void probarMicrofono()} className={BOTON}>
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    Probar micrófono
                </button>
                {informe !== null && (
                    <button type="button" onClick={() => void copiar()} className={BOTON}>
                        <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                        {copiado ? "Copiado" : "Copiar informe"}
                    </button>
                )}
            </div>
            {error !== null && <p className="text-sm text-[#DC143C]" role="alert">{error}</p>}
            {estado === "listo" && !datos.seguro && (
                <p className="text-sm text-amber-300" role="status">Sin contexto seguro (https o localhost): WebXR queda apagado aquí.</p>
            )}
            {estado === "listo" && inmersivos.length === 0 && (
                <p className="text-sm text-white/60" role="status">Este aparato no ofrece sesión inmersiva; el informe muestra lo que el navegador dice.</p>
            )}
            {informe !== null && (
                <div className="flex flex-col gap-4">
                    <p className="text-xs text-white/50">{informe.titulo} · {informe.fecha}</p>
                    {informe.secciones.map((s) => (
                        <div key={s.nombre} className="rounded-2xl border border-white/10 bg-[#0E101E]/70 p-4">
                            <h2 className="mb-2 text-sm font-semibold text-[#B9C0D8]">{s.nombre}</h2>
                            <ul className="flex flex-col gap-1">
                                {s.lineas.map((l) => (
                                    <li key={l.clave} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                                        <span className="font-mono text-white/80">{l.clave}</span>
                                        <span className={COLOR[l.estado]}>{l.valor}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
