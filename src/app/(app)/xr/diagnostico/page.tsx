"use client";

import { useCallback, useState } from "react";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { construirInforme, type CalidadMedida, type SesionMedida } from "@/lib/xr/diagnostico";
import type { ModoXR } from "@/lib/xr/tipos";

const COLORES: Record<string, string> = { ok: "text-[#39FF14]", aviso: "text-[#FFBF00]", fallo: "text-[#DC143C]", "sin-probar": "text-[#B9C0D8]" };
const BOTON = "cursor-pointer min-h-11 rounded-full border border-white/15 bg-[#0E101E] px-5 text-sm text-[#F5F7FF] disabled:cursor-not-allowed disabled:opacity-60";

/** Cuenta 10 s de fotogramas de la sesión; si no llegan, devuelve null sin dejar la página esperando. */
function medirFotogramas(sesion: XRSession, ms: number): Promise<{ media: number; p95: number } | null> {
    return new Promise((resolver) => {
        const marcas: number[] = [];
        let inicio = 0, terminado = false;
        const reloj = globalThis.setTimeout(() => cerrar(), ms + 2000);
        function cerrar() {
            if (terminado) return;
            terminado = true;
            globalThis.clearTimeout(reloj);
            const deltas = marcas.slice(1).map((t, i) => t - marcas[i]);
            if (deltas.length === 0) { resolver(null); return; }
            const orden = [...deltas].sort((a, b) => a - b);
            resolver({ media: deltas.reduce((a, b) => a + b, 0) / deltas.length, p95: orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] });
        }
        const paso = (t: number) => {
            if (terminado) return;
            if (inicio === 0) inicio = t;
            marcas.push(t);
            if (t - inicio >= ms) { cerrar(); return; }
            sesion.requestAnimationFrame(paso);
        };
        sesion.requestAnimationFrame(paso);
    });
}

type Medicion = { sesion?: SesionMedida; calidad?: CalidadMedida; entradas?: string[]; microfono: "concedido" | "denegado" | "sin-probar"; ahora: number };

export default function DiagnosticoXRPage() {
    const { estado, datos, capacidades, plan } = useCapacidadesXR();
    const [midiendo, setMidiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<"no" | "si" | "manual">("no");
    const [medicion, setMedicion] = useState<Medicion>({ microfono: "sin-probar", ahora: Date.now() });
    const informe = construirInforme({ datos, capacidades, plan, ...medicion });

    const entrar = useCallback(async (modo: ModoXR) => {
        setMidiendo(true); setError(null); setCopiado("no");
        try {
            const { obtenerAlmacenXR } = await import("@/components/xr/shell/almacen-xr");
            const almacen = await obtenerAlmacenXR({ perfil: PERFILES.media, capacidades });
            const abierta = modo === "vr-inmersivo" ? await almacen.enterVR() : await almacen.enterAR();
            if (!abierta) throw new Error("No se pudo abrir la sesión inmersiva.");
            const medidas = await medirFotogramas(abierta, 10_000);
            const modoSesion = (abierta as XRSession & { mode?: string }).mode ?? "desconocido";
            const sesion = { modo: modoSesion, funcionesConcedidas: abierta.enabledFeatures ?? [], frecuenciasSoportadas: abierta.supportedFrameRates ? Array.from(abierta.supportedFrameRates) : [], frecuenciaActual: abierta.frameRate };
            const calidad = { nivel: PERFILES.media.nivel, modo: "auto" as const, frameMsMedia: medidas?.media, frameMsP95: medidas?.p95 };
            setMedicion((m) => ({ ...m, sesion, calidad, entradas: Array.from(abierta.inputSources).map((i) => i.targetRayMode), ahora: Date.now() }));
            await abierta.end().catch(() => undefined);
        } catch (e) { setError(mensajeErrorXR(e)); } finally { setMidiendo(false); }
    }, [capacidades]);

    const probarMicrofono = useCallback(async () => {
        let permiso: Medicion["microfono"] = "concedido";
        try {
            const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
            flujo.getTracks().forEach((pista) => pista.stop());
        } catch { permiso = "denegado"; }
        setMedicion((m) => ({ ...m, microfono: permiso, ahora: Date.now() }));
    }, []);

    const copiar = useCallback(async () => {
        try { await navigator.clipboard.writeText(informe.texto); setCopiado("si"); return; } catch { /* respaldo abajo */ }
        const area = document.createElement("textarea");
        area.value = informe.texto; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch { ok = false; }
        document.body.removeChild(area);
        setCopiado(ok ? "si" : "manual");
    }, [informe.texto]);

    const inmersivos = capacidades.modos.filter((m) => m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano");

    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <div className="mx-auto max-w-3xl space-y-4">
                <h1 className="text-2xl font-bold text-amber-50">Diagnóstico del visor</h1>
                <p className="text-sm text-white/60">
                    Mide lo que este aparato concede de verdad. Entra, se miden 10 s de fotogramas (en el visor verás negro) y
                    vuelve solo a este informe. Nadie afirma que algo funciona en un visor sin pasar por aquí.
                </p>
                <p className="text-xs text-white/40">
                    {estado === "sondeando" ? "Comprobando el aparato…" : `Plan: ${plan.estrategia} · ${plan.motivo}`}
                </p>
                <div className="flex flex-wrap gap-2">
                    {inmersivos.map((m) => (
                        <button key={m} type="button" disabled={midiendo} onClick={() => void entrar(m)} className={BOTON}>
                            {midiendo ? "Midiendo…" : m === "vr-inmersivo" ? "Entrar en VR para medir" : "Entrar en AR para medir"}
                        </button>
                    ))}
                    <button type="button" onClick={() => void probarMicrofono()} className={BOTON}>Probar micrófono</button>
                    <button type="button" onClick={() => void copiar()} className={BOTON}>{copiado === "si" ? "Copiado" : "Copiar informe"}</button>
                </div>
                {error !== null && <p role="alert" className="text-sm text-[#DC143C]">{error}</p>}
                {copiado === "manual" && (
                    <>
                        <p className="text-xs text-[#FFBF00]">No se pudo copiar solo: selecciona el texto y cópialo a mano.</p>
                        <textarea readOnly value={informe.texto} rows={10} onClick={(e) => e.currentTarget.select()} className="w-full rounded-xl border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-[#F5F7FF]" />
                    </>
                )}
                {informe.secciones.map((s) => (
                    <section key={s.nombre} className="rounded-2xl border border-white/10 bg-[#0E101E]/70 p-4">
                        <h2 className="mb-2 text-sm font-semibold text-[#F5F7FF]">{s.nombre}</h2>
                        <ul className="space-y-1">
                            {s.lineas.map((l, i) => (
                                <li key={`${l.clave}-${i}`} className="flex gap-2 text-xs">
                                    <span className="w-40 shrink-0 text-[#B9C0D8]">{l.clave}</span>
                                    <span className={COLORES[l.estado]}>{l.valor}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </main>
    );
}
