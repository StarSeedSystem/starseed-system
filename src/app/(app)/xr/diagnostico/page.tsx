"use client";

/** /xr/diagnostico · la prueba del visor real (§3 l del contrato XR): entra en VR/AR, mide 10 s de
 * fotogramas y lee de la sesión lo que de verdad concedió (`enabledFeatures`); el micrófono, sólo al
 * pulsar su botón. Sin librerías 3D. */
import { useCallback, useMemo, useState } from "react";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { obtenerAlmacenXR } from "@/components/xr/shell/almacen-xr";
import { nivelInicial, perfilDeNivel } from "@/lib/xr/calidad";
import { modeloQuest } from "@/lib/xr/capacidades";
import { leerCalidad } from "@/components/xr/shell/prefs-xr";
import { construirInforme, resumirDuraciones, type DatosCalidadInforme, type DatosSesion, type EstadoMicrofono, type EstadoLinea } from "@/lib/xr/diagnostico";

type FuenteXR = Readonly<{ targetRayMode: string; handedness?: string | null; kind?: string }>;
type SesionXR = Readonly<{ enabledFeatures?: readonly string[]; supportedFrameRates?: readonly number[] | null;
    inputSources?: readonly FuenteXR[]; requestAnimationFrame(marco: (t: number) => void): number; }>
const COLOR: Record<EstadoLinea, string> = { ok: "text-emerald-300", aviso: "text-amber-300", fallo: "text-red-400", "sin-probar": "text-neutral-400" };
const NO_PUDO = "No se pudo copiar: selecciona el texto a mano.";

export default function PaginaDiagnosticoXR() {
    const { estado: sondeo, datos, capacidades, plan } = useCapacidadesXR();
    const [fase, setFase] = useState<"reposo" | "abriendo" | "midiendo" | "lista">("reposo");
    const [sesion, setSesion] = useState<DatosSesion | undefined>(undefined);
    const [calidad, setCalidad] = useState<DatosCalidadInforme | undefined>(undefined);
    const [entradas, setEntradas] = useState<string[] | undefined>(undefined);
    const [micro, setMicro] = useState<EstadoMicrofono>("sin-probar");
    const [ahora, setAhora] = useState(0);
    const [error, setError] = useState<string | undefined>(undefined);
    const [copiado, setCopiado] = useState(false);
    const informe = useMemo(() => construirInforme(
        { datos, capacidades, plan, sesion, calidad, entradas, microfono: micro, ahora }), [datos, capacidades, plan, sesion, calidad, entradas, micro, ahora]);

    const medir = useCallback(async (modo: "vr-inmersivo" | "ar-passthrough") => {
        setError(undefined); setCopiado(false); setFase("abriendo");
        try {
            const perfil = perfilDeNivel(nivelInicial({ plataforma: capacidades.plataforma, modelo: modeloQuest(datos.ua) }));
            const almacen = await obtenerAlmacenXR({ perfil, capacidades });
            await (modo === "ar-passthrough" ? almacen.enterAR() : almacen.enterVR());
            const s = almacen.getState().session as unknown as SesionXR | undefined;
            if (!s) throw new Error("La sesión no llegó a abrirse. Prueba otra vez.");
            setSesion({
                modo,
                funcionesConcedidas: Array.from(s.enabledFeatures ?? []),
                frecuenciasSoportadas: Array.from(s.supportedFrameRates ?? []),
                foveacion: perfil.foveacion,
            });
            setEntradas(((s.inputSources ?? []) as readonly FuenteXR[]).map((f) =>
                [f.targetRayMode, f.handedness === "none" || !f.handedness ? f.kind ?? "" : f.handedness].filter(Boolean).join(" · ")));
            setFase("midiendo");
            const duraciones: number[] = [];
            const principio = Date.now();
            let previo = -1;
            await new Promise<void>((hecho) => {
                const paso = (t: number) => {
                    if (previo >= 0) duraciones.push(t - previo);
                    previo = t;
                    if (Date.now() - principio < 10_000) s.requestAnimationFrame(paso); else hecho();
                };
                s.requestAnimationFrame(paso);
            });
            const r = resumirDuraciones(duraciones);
            setCalidad({ nivel: perfil.nivel, modo: leerCalidad().modo, frameMsMedia: r.media, frameMsP95: r.p95 });
            setAhora(Date.now());
            setFase("lista");
        } catch (e) {
            setError(e instanceof Error ? e.message : "El visor no dejó entrar.");
            setFase("reposo");
        }
    }, [datos, capacidades]);

    const probarMicro = useCallback(async () => {
        try {
            const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
            flujo.getTracks().forEach((p) => p.stop());
            setMicro("concedido");
        } catch { setMicro("denegado"); }
    }, []);

    const copiar = useCallback(async () => {
        try { await navigator.clipboard.writeText(informe.texto); setCopiado(true); return; } catch { /* respaldo */ }
        const area = document.createElement("textarea");
        area.value = informe.texto;
        document.body.appendChild(area);
        area.select();
        try { if (document.execCommand("copy")) setCopiado(true); else setError(NO_PUDO); }
        catch { setError(NO_PUDO); }
        document.body.removeChild(area);
    }, [informe]);

    const listo = sondeo === "listo", vr = capacidades.modos.includes("vr-inmersivo"), ar = capacidades.modos.includes("ar-passthrough") || capacidades.modos.includes("ar-mano");
    const btn = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-neutral-100 transition-colors hover:bg-white/10";
    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-neutral-100">
            <h1 className="text-xl font-semibold">Diagnóstico del visor</h1>
            <div className="mt-4 flex flex-wrap gap-2">
                {listo && vr && <button className={btn} onClick={() => medir("vr-inmersivo")}>Entrar en VR para medir</button>}
                {listo && ar && <button className={btn} onClick={() => medir("ar-passthrough")}>Entrar en AR para medir</button>}
                <button className={btn} onClick={probarMicro}>Probar micrófono</button>
                <button className={btn} onClick={copiar}>Copiar informe</button>
            </div>
            {sondeo === "sondeando" && <p className="mt-3 text-neutral-400">Comprobando el aparato…</p>}
            {copiado && <p className="mt-3 text-emerald-300">Informe copiado.</p>}
            {error && <p className="mt-3 text-red-400">{error}</p>}
            {fase === "midiendo" && <p className="mt-3 text-neutral-300">Midiendo fotogramas: espera los 10 segundos y sal del visor.</p>}
            {fase === "lista" && (
                <section className="mt-6 space-y-4">
                    <p className="text-xs text-neutral-500">{informe.fecha}</p>
                    {informe.secciones.map((s) => (
                        <div key={s.nombre}>
                            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">{s.nombre}</h2>
                            <ul className="mt-1 space-y-0.5 font-mono text-xs">
                                {s.lineas.map((l, i) => (<li key={`${s.nombre}-${i}`} className={COLOR[l.estado]}>{l.clave}: {l.valor}</li>))}
                            </ul>
                        </div>
                    ))}
                </section>
            )}
        </main>
    );
}
