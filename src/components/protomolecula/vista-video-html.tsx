"use client";

import { useEffect, useState } from "react";
import { obtenerAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { AtomoEnUso } from "@/lib/protomolecula/tipos";
import { elegirVista, type VistaVideoHtml, type ElegirVistaArgs } from "@/lib/protomolecula/bloque-protomolecula";

export interface VistaVideoHtmlProps {
    atomo: AtomoEnUso;
    valores: Record<string, unknown>;
    /** Inyectables para pruebas: función que comprueba si el servicio local está vivo. */
    comprobarServicio?: () => Promise<boolean>;
    /** Inyectable para pruebas: si el render ya terminó. */
    renderHecho?: boolean;
    /** Callback cuando cambia la vista (para telemetría/depuración). */
    alCambiarVista?: (vista: VistaVideoHtml) => void;
}

const SERVICIO_HYPERFRAMES = "hyperframes";
const EXTRAER = (v: Record<string, unknown>, ks: string[]): string | null =>
    (ks.find((k) => typeof v[k] === "string" && (v[k] as string).length) ? v[ks.find((k) => typeof v[k] === "string" && (v[k] as string).length)!] as string : null);

export function VistaVideoHtml({
    atomo, valores, comprobarServicio, renderHecho = false, alCambiarVista,
}: VistaVideoHtmlProps) {
    const [vista, setVista] = useState<VistaVideoHtml>("poster");
    const [servicioVivo, setServicioVivo] = useState(false);
    const [definicion] = useState<DefinicionAtomo | undefined>(() => obtenerAtomo(atomo.herramientaId));

    useEffect(() => {
        let m = true;
        async function d() {
            let v = false;
            if (comprobarServicio) { try { v = await comprobarServicio(); } catch { v = false; } }
            else { try { const r = await fetch(`/api/protomolecula/servicio/${SERVICIO_HYPERFRAMES}/health`, { method: "GET", cache: "no-store" }); v = r.ok; } catch { v = false; } }
            if (!m) return;
            setServicioVivo(v);
            const n = elegirVista({ atomo, servicioVivo: v, renderHecho });
            setVista(n); alCambiarVista?.(n);
        }
        d(); const id = setInterval(d, 10_000); return () => { m = false; clearInterval(id); };
    }, [atomo, renderHecho, comprobarServicio, alCambiarVista]);

    const poster = EXTRAER(valores, ["poster", "poster-url", "thumbnail"]);
    const video = EXTRAER(valores, ["videoSrc", "video-url", "renderOutput"]);
    const t = atomo.titulo ?? definicion?.nombre ?? atomo.herramientaId;
    const b = vista === "video" ? ["Renderizado", "bg-emerald-500/15", "text-emerald-300"]
        : vista === "preview" ? ["Vista previa en vivo", "bg-sky-500/15", "text-sky-300"]
        : ["Póster", "bg-amber-500/15", "text-amber-300"] as const;

    return (
        <div data-testid="vista-video-html" className="rounded-xl border border-border/50 bg-muted/20 p-4" role="region" aria-label={`Vídeo HyperFrames: ${t}`}>
            <div className="mb-3 flex items-center gap-2"><h3 className="text-lg font-semibold">{t}</h3><span className={`rounded px-2 py-0.5 text-xs ${b[1]} ${b[2]}`}>{b[0]}</span></div>
            {vista === "video" && video && <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20"><video src={video} controls className="w-full h-full object-contain" poster={poster ?? undefined} preload="metadata" /></div>}
            {vista === "preview" && servicioVivo && (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20">
                    <iframe src={`http://127.0.0.1:4490/preview?atomo=${encodeURIComponent(atomo.id)}`} className="w-full h-full border-0" title="Vista previa en vivo de HyperFrames" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="rounded bg-sky-500/80 px-3 py-1 text-xs font-medium text-white">Vista previa en vivo (servicio local)</span></div>
                </div>
            )}
            {(vista === "poster" || !video) && (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted/50">
                    {poster ? <img src={poster} alt={`Póster de ${t}`} className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <svg className="w-12 h-12 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                            <p className="text-sm">Sin póster ni vídeo renderizado</p>
                            {servicioVivo && <p className="text-xs text-sky-400">Servicio local disponible — pulsa «Previsualizar» en el editor</p>}
                        </div>
                    )}
                    {vista === "poster" && servicioVivo && <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none"><span className="rounded bg-sky-500/90 px-2 py-1 text-xs text-white">Servicio listo</span></div>}
                </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {Object.entries(valores).filter(([k]) => !["poster", "poster-url", "thumbnail", "videoSrc", "video-url", "renderOutput"].includes(k)).slice(0, 6).map(([k, v]) => <span key={k} className="rounded bg-background px-2 py-0.5 font-mono">{k}: {String(v).slice(0, 40)}</span>)}
            </div>
        </div>
    );
}

export { elegirVista, type VistaVideoHtml as TipoVistaVideoHtml, type ElegirVistaArgs } from "@/lib/protomolecula/bloque-protomolecula";