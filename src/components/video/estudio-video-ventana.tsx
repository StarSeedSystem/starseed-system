"use client";

/**
 * Estudio de vídeo (Ola 1018H · HFR1018K · `architecture/video-hyperframes.md` §4).
 * Widget/ventana `estudio-video`: capas/clips y línea de tiempo leídos de los `data-*` de la
 * composición, panel de propiedades que emite órdenes del SDK (`video-html/operaciones-sdk.ts`)
 * y vista previa con `<hyperframes-player>` servido por el servicio local (127.0.0.1:4490).
 * Sin servicio: mensaje claro y «Abrir en otra neurona». GSAP ajeno: aviso, sin edición (§2).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { operacionASdkOrder, type SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { llamarServicio, sondearServicio, type DefinicionServicio, type FetchLocal } from "@/lib/protomolecula/servicio-local";

/** Servicio local de HyperFrames en esta neurona (contrato §4.3); salud en `/health`. */
export const SERVICIO_HYPERFRAMES: DefinicionServicio = { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" };
/** Origen del servicio local: SIEMPRE el propio aparato; lo privado no sale de las neuronas. */
export const ORIGEN_HYPERFRAMES = `http://127.0.0.1:${SERVICIO_HYPERFRAMES.puerto}`;

/** Una capa de la composición (`class="clip"` con atributos de tiempo). */
export interface VideoClip { id: string; start: number; duration: number; trackIndex: number; }

export interface EstudioVideoVentanaProps {
    composicion?: string;
    /** id de la composición servida por el servicio local (`GET /vista/:id`). */
    composicionId?: string;
    /** Dependencias inyectables: pruebas sin red, sin navegador y sin procesos. */
    fetchLocal?: FetchLocal;
    alEnviarOrden?: (orden: SdkOrder) => void;
    alAbrirEnOtraNeurona?: () => void;
}

/* Panel de propiedades: texto del clip (pasa por operaciones-sdk, con sus garantías) o tiempos. */
export type OrdenPanel =
    | { campo: "texto"; texto: string }
    | { campo: "tiempo"; start: number; duration: number };

/** Valor del atributo `nombre="…"` de un tag; vacío si no está. */
function datoDe(tag: string, nombre: string): string {
    return tag.match(new RegExp(`${nombre}\\s*=\\s*"([^"]*)"`))?.[1] ?? "";
}

/** Capas/clips de una composición HyperFrames (index.html con `class="clip"` + `data-*`). */
export function extraerClips(html: string): VideoClip[] {
    const clips: VideoClip[] = [];
    for (const tag of html.match(/<[^>]+>/g) ?? []) {
        if (!datoDe(tag, "class").split(/\s+/).includes("clip")) continue;
        const n = (v: string) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
        clips.push({
            id: datoDe(tag, "data-composition-id") || datoDe(tag, "id") || `clip-${clips.length + 1}`,
            start: n(datoDe(tag, "data-start")),
            duration: n(datoDe(tag, "data-duration")),
            trackIndex: n(datoDe(tag, "data-track-index")),
        });
    }
    return clips;
}

/** Orden del SDK desde el panel (una por cambio); `texto` va traducida por `operacionASdkOrder`. */
export function ordenPanel(clipId: string, orden: OrdenPanel): SdkOrder {
    if (orden.campo === "tiempo") return { type: "setTiming", target: clipId, start: orden.start, duration: orden.duration };
    return operacionASdkOrder({
        id: `orden-texto:${clipId}`,
        objetivo: { atomoId: "video-html", parametroId: `${clipId}::textContent` },
        accion: { tipo: "exacta", valor: orden.texto },
        autor: { tipo: "persona", id: "estudio-video" },
        origen: "mano",
        t: 0,
    });
}

/** La ventana/widget «Estudio de vídeo»: la misma pieza en dashboard, escritorio, pizarra y flotante. */
export function EstudioVideoVentana({
    composicion = "",
    composicionId,
    fetchLocal,
    alEnviarOrden,
    alAbrirEnOtraNeurona,
}: EstudioVideoVentanaProps): React.ReactElement {
    const [estado, setEstado] = useState<"comprobando" | "vivo" | "apagado">("comprobando");
    const [elegido, setElegido] = useState<string | null>(null);
    const enrutador = useRouter();
    useEffect(() => { // salud del servicio local; las pruebas inyectan su fetch (nunca red real)
        let montado = true;
        sondearServicio(SERVICIO_HYPERFRAMES, (fetchLocal ?? fetch) as FetchLocal, {}).then(
            (r) => montado && setEstado(r.vivo ? "vivo" : "apagado"),
        );
        return () => { montado = false; };
    }, [fetchLocal]);

    const clips = useMemo(() => extraerClips(composicion), [composicion]);
    const conGsap = useMemo(() => detectarAdaptadores(composicion).usados.includes("gsap"), [composicion]);
    const total = Math.max(1, ...clips.map((c) => c.start + c.duration));
    const pistas = [...new Set(clips.map((c) => c.trackIndex))].sort((a, b) => a - b);
    const clipElegido = clips.find((c) => c.id === elegido) ?? null;
    const abrir = alAbrirEnOtraNeurona ?? (() => enrutador.push("/red-mesh"));
    const enviar = alEnviarOrden ?? ((orden: SdkOrder) => {
        void llamarServicio(SERVICIO_HYPERFRAMES, "/editar", { composicion, ordenes: [orden] }, (fetchLocal ?? fetch) as FetchLocal, {})
            .catch(() => undefined);
    });
    const hayComposicion = Boolean(composicionId || composicion);

    return (
        <div className="flex h-full min-h-0 flex-col gap-[13px] p-[21px]" data-superficie="estudio-video">
            <div className="flex items-baseline gap-[8px]">
                <h3 className="text-[1.25rem] font-semibold tracking-tight">Estudio de vídeo</h3>
                <span className="text-[0.75rem] text-muted-foreground">HyperFrames · Protomolécula</span>
            </div>
            {conGsap && (
                <p role="alert" className="rounded-[12px] border border-[#FFBF00]/40 bg-[#FFBF00]/10 px-[13px] py-[8px] text-[0.8rem]">
                    Esta composición usa GSAP: se reproduce y se renderiza, pero su animación no se edita aquí (licencia). Se puede convertir a WAAPI.
                </p>
            )}
            {estado === "apagado" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-[13px] rounded-[24px] border border-dashed border-muted-foreground/30 p-[21px] text-center">
                    <p className="text-[0.9rem] text-muted-foreground">
                        El servicio HyperFrames no está en esta neurona, así que aquí no hay vista previa ni edición ahora mismo.
                    </p>
                    <button type="button" onClick={abrir}
                        className="cursor-pointer rounded-[9999px] bg-primary px-[13px] py-[8px] text-[0.85rem] font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90">
                        Abrir en otra neurona
                    </button>
                </div>
            ) : (
                <div className="grid min-h-0 flex-1 grid-cols-[38.2%_1fr] gap-[13px] max-md:grid-cols-1">
                    <section className="flex min-h-0 flex-col gap-[8px]">
                        <p className="text-[0.75rem] uppercase tracking-wide text-muted-foreground">Capas y línea de tiempo</p>
                        {pistas.map((p) => (
                            <ul key={p} className="relative h-6 rounded-[4px] bg-muted/50" data-pista={p}>
                                {clips.filter((c) => c.trackIndex === p).map((c) => (
                                    <button key={c.id} type="button" aria-pressed={elegido === c.id} onClick={() => setElegido(c.id)}
                                        className="cursor-pointer absolute inset-y-0 truncate rounded-[4px] px-[3px] text-left text-[0.618rem] leading-6 transition-opacity duration-150"
                                        style={{
                                            left: `${(c.start / total) * 100}%`,
                                            width: `${Math.max((c.duration / total) * 100, 4)}%`,
                                            background: elegido === c.id ? "var(--primary)" : "color-mix(in srgb, var(--primary) 35%, transparent)",
                                        }}>
                                        {c.id}
                                    </button>
                                ))}
                            </ul>
                        ))}
                        {clipElegido && (
                            <div key={clipElegido.id} className="flex flex-col gap-[5px] rounded-[12px] border border-muted p-[8px] text-[0.75rem]">
                                <p className="font-medium">{clipElegido.id}</p>
                                <label>
                                    Texto
                                    <input type="text" className="mt-[3px] w-full rounded-[4px] border bg-background px-[5px] py-[3px]"
                                        onChange={(e) => enviar(ordenPanel(clipElegido.id, { campo: "texto", texto: e.target.value }))} />
                                </label>
                                <label className="mr-[8px] block">
                                    Inicio (s)
                                    <input type="number" min={0} step={0.1} defaultValue={clipElegido.start} data-campo="start"
                                        className="w-[70px] rounded-[4px] border bg-background px-[5px] py-[3px]"
                                        onChange={(e) => enviar(ordenPanel(clipElegido.id, { campo: "tiempo", start: Number(e.target.value) || 0, duration: clipElegido.duration }))} />
                                </label>
                                <label className="block">
                                    Duración (s)
                                    <input type="number" min={0} step={0.1} defaultValue={clipElegido.duration} data-campo="duration"
                                        className="w-[70px] rounded-[4px] border bg-background px-[5px] py-[3px]"
                                        onChange={(e) => enviar(ordenPanel(clipElegido.id, { campo: "tiempo", start: clipElegido.start, duration: Number(e.target.value) || 0 }))} />
                                </label>
                            </div>
                        )}
                    </section>
                    <section className="flex min-h-0 flex-col gap-[8px]">
                        <p className="text-[0.75rem] uppercase tracking-wide text-muted-foreground">Vista previa</p>
                        {estado === "comprobando" && <p className="text-[0.8rem] text-muted-foreground">Comprobando el servicio de esta neurona…</p>}
                        {estado === "vivo" && !hayComposicion && (
                            <p className="text-[0.8rem] text-muted-foreground">Sin composición: se abre desde la Protomolécula (átomo «vídeo-html») y aquí se edita.</p>
                        )}
                        {estado === "vivo" && hayComposicion && (
                            <div className="min-h-0 flex-1 overflow-hidden rounded-[12px] border border-muted bg-background">
                                {React.createElement("hyperframes-player", composicionId
                                    ? { url: `${ORIGEN_HYPERFRAMES}/vista/${composicionId}` }
                                    : { dataComposicion: composicion })}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
