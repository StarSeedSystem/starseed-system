"use client";

// ════════════════════════════════════════════════════════════════════════════
// /convertir — Conversor de archivos de StarSeed OS (motor: Filee, MIT).
// ----------------------------------------------------------------------------
// Suelta o elige un archivo (o llega con ?url=&nombre=&a= desde el clic
// derecho, Astraura o la Protomolécula), elige el formato y la neurona lo
// convierte con Filee sin subirlo a ningún servicio de fuera. El resultado se
// descarga o se guarda en tus archivos. Con ?url y ?a juntos convierte solo
// (la petición ya la hizo la persona: a Astraura o en el menú).
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileUp, HardDriveUpload, Loader2, Replace, ShieldCheck, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { uploadFile, humanFileSize } from "@/lib/files/os-files";
import { consultarDestinos, convertirBlob, descargarBlob, type ConsultaDestinos, type Convertido } from "@/lib/conversion/cliente";
import { etiquetaFormato, formatoDe, ordenarDestinos } from "@/lib/conversion/formatos";

const CON_CALIDAD = new Set(["jpg", "webp", "avif", "heic", "jxl", "jp2"]);

interface Origen {
    nombre: string;
    blob: Blob | null;
    url?: string;
}

export function Conversor() {
    const params = useSearchParams();
    const [origen, setOrigen] = useState<Origen | null>(null);
    const [consulta, setConsulta] = useState<ConsultaDestinos | null>(null);
    const [destino, setDestino] = useState<string>("");
    const [calidad, setCalidad] = useState(85);
    const [estado, setEstado] = useState<"libre" | "leyendo" | "convirtiendo" | "hecho" | "error">("libre");
    const [error, setError] = useState<string | null>(null);
    const [resultado, setResultado] = useState<Convertido | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [verTodos, setVerTodos] = useState(false);
    const entrada = useRef<HTMLInputElement>(null);
    const autoHecho = useRef(false);

    // Estado de la neurona aunque no haya archivo todavía.
    const [neurona, setNeurona] = useState<{ disponible: boolean; version: string | null; motivo?: string } | null>(null);
    useEffect(() => {
        let vivo = true;
        void consultarDestinos("md").then((c) => vivo && setNeurona({ disponible: c.disponible, version: c.version, motivo: c.motivo }));
        return () => {
            vivo = false;
        };
    }, []);

    const elegirArchivo = useCallback((f: File) => {
        setOrigen({ nombre: f.name, blob: f });
        setResultado(null);
        setGuardado(false);
        setError(null);
        setEstado("libre");
    }, []);

    // Llegada con ?url=&nombre=&a= (clic derecho, Astraura, Protomolécula).
    useEffect(() => {
        const url = params.get("url");
        const nombre = params.get("nombre") || (url ? decodeURIComponent(url.split("?")[0].split("/").pop() || "archivo") : "");
        const a = formatoDe(params.get("a") || "");
        if (a) setDestino(a);
        if (!url) return;
        setOrigen({ nombre, blob: null, url });
    }, [params]);

    // Destinos del archivo elegido.
    useEffect(() => {
        if (!origen) {
            setConsulta(null);
            return;
        }
        let vivo = true;
        setConsulta(null);
        void consultarDestinos(origen.nombre).then((c) => {
            if (!vivo) return;
            setConsulta(c);
            setDestino((d) => (d && c.destinos?.destinos.includes(d) ? d : ""));
        });
        return () => {
            vivo = false;
        };
    }, [origen]);

    const todos = useMemo(() => ordenarDestinos(consulta?.destinos?.destinos ?? [], origen?.nombre ?? ""), [consulta, origen]);
    const visibles = verTodos ? todos : todos.slice(0, 12);

    const convertir = useCallback(async () => {
        if (!origen || !destino) return;
        setError(null);
        setResultado(null);
        setGuardado(false);
        try {
            let blob = origen.blob;
            if (!blob && origen.url) {
                setEstado("leyendo");
                const r = await fetch(origen.url);
                if (!r.ok) throw new Error("No pude leer el archivo original.");
                blob = await r.blob();
                setOrigen((o) => (o ? { ...o, blob } : o));
            }
            if (!blob) throw new Error("Elige un archivo primero.");
            setEstado("convirtiendo");
            const c = await convertirBlob(blob, origen.nombre, destino, { calidad: CON_CALIDAD.has(destino) ? calidad : undefined });
            setResultado(c);
            setEstado("hecho");
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo convertir.");
            setEstado("error");
        }
    }, [origen, destino, calidad]);

    // Con ?url y ?a, la conversión ya la pidió la persona: se hace sola una vez.
    useEffect(() => {
        if (autoHecho.current || !params.get("url") || !params.get("a")) return;
        if (!origen || !destino || !consulta?.disponible || !todos.includes(destino)) return;
        autoHecho.current = true;
        void convertir();
    }, [origen, destino, consulta, todos, params, convertir]);

    const guardar = useCallback(async () => {
        if (!resultado) return;
        const r = await uploadFile(new File([resultado.blob], resultado.nombre, { type: resultado.blob.type || undefined }), {
            folder: "conversiones",
            meta: { context: "conversion", motor: resultado.motor, de: origen?.nombre },
        });
        if (r.ok) {
            setGuardado(true);
            toast.success(`«${resultado.nombre}» guardado en tus archivos (carpeta Conversiones).`);
        } else {
            toast.error(r.error || "No pude guardarlo en tus archivos.");
        }
    }, [resultado, origen]);

    const ocupado = estado === "leyendo" || estado === "convirtiendo";

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
            <header className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#7FB8FF]/30 to-[#c9a6ff]/30 ring-1 ring-white/15">
                        <Replace className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Convertir archivos</h1>
                        <p className="text-xs text-white/60 sm:text-sm">255 formatos · se convierte en tu neurona, sin subir nada a servicios de fuera</p>
                    </div>
                </div>
                <div
                    className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                        neurona?.disponible ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-100",
                    )}
                    data-testid="estado-conversor"
                >
                    {neurona === null ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Buscando el conversor de esta neurona…</>
                    ) : neurona.disponible ? (
                        <><ShieldCheck className="h-3 w-3" /> Filee {neurona.version} en esta neurona</>
                    ) : (
                        <><TriangleAlert className="h-3 w-3" /> {neurona.motivo}</>
                    )}
                </div>
            </header>

            <button
                type="button"
                onClick={() => entrada.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setArrastrando(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) elegirArchivo(f);
                }}
                className={cn(
                    "group flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed px-4 py-6 text-center transition",
                    arrastrando ? "border-[#7FB8FF] bg-[#7FB8FF]/10" : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]",
                )}
                aria-label="Elegir o soltar un archivo para convertir"
            >
                <FileUp className="h-6 w-6 text-white/70 transition group-hover:-translate-y-0.5" />
                {origen ? (
                    <span className="max-w-full truncate text-sm text-white">
                        {origen.nombre}
                        {origen.blob ? <span className="text-white/50"> · {humanFileSize(origen.blob.size)}</span> : null}
                    </span>
                ) : (
                    <span className="text-sm text-white/80">Suelta aquí un archivo o toca para elegirlo</span>
                )}
                <span className="text-[11px] text-white/45">Imágenes, PDF, Word, Excel, PowerPoint, libros, vídeo, audio, 3D, CAD, tipografías, datos…</span>
            </button>
            <input
                ref={entrada}
                type="file"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) elegirArchivo(f);
                    e.target.value = "";
                }}
            />

            {origen && (
                <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl" aria-label="Formato de destino">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-medium text-white">Convertir a</h2>
                        {consulta?.destinos && (
                            <span className="text-[11px] text-white/45">{consulta.destinos.nombre} → {todos.length} formatos</span>
                        )}
                    </div>
                    {!consulta && (
                        <p className="flex items-center gap-2 text-xs text-white/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mirando a qué formatos sale…</p>
                    )}
                    {consulta && !consulta.disponible && <p className="text-xs text-amber-100/90">{consulta.motivo}</p>}
                    {consulta?.disponible && !todos.length && <p className="text-xs text-amber-100/90">{consulta.motivo ?? "Filee no convierte este tipo de archivo."}</p>}
                    {todos.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Formatos">
                            {visibles.map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    role="radio"
                                    aria-checked={destino === f}
                                    onClick={() => setDestino(f)}
                                    title={etiquetaFormato(f)}
                                    className={cn(
                                        "truncate rounded-xl border px-2 py-2 text-xs transition",
                                        destino === f ? "border-[#7FB8FF] bg-[#7FB8FF]/20 text-white" : "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.08]",
                                    )}
                                >
                                    {etiquetaFormato(f)}
                                </button>
                            ))}
                        </div>
                    )}
                    {todos.length > 12 && (
                        <button type="button" onClick={() => setVerTodos((v) => !v)} className="w-fit text-[11px] text-[#7FB8FF] hover:underline">
                            {verTodos ? "Ver menos" : `Ver los ${todos.length} formatos`}
                        </button>
                    )}
                    {consulta?.destinos?.conMotor.length ? (
                        <p className="text-[11px] leading-snug text-white/45">
                            Con un motor opcional de Filee (LibreOffice, Pandoc, Ghostscript, calibre o FFmpeg) también:{" "}
                            {consulta.destinos.conMotor.slice(0, 14).join(", ")}
                            {consulta.destinos.conMotor.length > 14 ? "…" : ""}. Se instalan en la app Filee → Ajustes → Motores.
                        </p>
                    ) : null}
                    {CON_CALIDAD.has(destino) && (
                        <label className="flex items-center gap-3 text-xs text-white/70">
                            Calidad
                            <input type="range" min={30} max={100} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} className="flex-1 accent-[#7FB8FF]" />
                            <span className="w-8 text-right tabular-nums">{calidad}</span>
                        </label>
                    )}
                    <button
                        type="button"
                        disabled={!destino || ocupado || !consulta?.disponible}
                        onClick={() => void convertir()}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7FB8FF] to-[#c9a6ff] px-4 text-sm font-medium text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                        data-testid="convertir"
                    >
                        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />}
                        {estado === "leyendo" ? "Leyendo el original…" : estado === "convirtiendo" ? "Convirtiendo…" : destino ? `Convertir a ${etiquetaFormato(destino)}` : "Elige un formato"}
                    </button>
                    {error && <p className="text-xs text-rose-200" role="alert">{error}</p>}
                </section>
            )}

            {resultado && (
                <section className="flex flex-col gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4" aria-live="polite" data-testid="resultado">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                        <div className="min-w-0">
                            <p className="truncate text-sm text-white">{resultado.nombre}</p>
                            <p className="text-[11px] text-white/55">
                                {humanFileSize(resultado.blob.size)}
                                {resultado.salidas > 1 ? ` · ${resultado.salidas} archivos en un ZIP` : ""}
                                {resultado.ms ? ` · ${(resultado.ms / 1000).toFixed(1)} s` : ""} · {resultado.motor}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => descargarBlob(resultado.blob, resultado.nombre)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs text-white hover:bg-white/15">
                            <Download className="h-3.5 w-3.5" /> Descargar
                        </button>
                        <button type="button" disabled={guardado} onClick={() => void guardar()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs text-white hover:bg-white/15 disabled:opacity-50">
                            <HardDriveUpload className="h-3.5 w-3.5" /> {guardado ? "Guardado en tus archivos" : "Guardar en mis archivos"}
                        </button>
                    </div>
                </section>
            )}

            <footer className="text-[11px] leading-relaxed text-white/40">
                También con clic derecho sobre cualquier archivo de tu Biblioteca («Convertir a…»), pidiéndoselo a Astraura («convierte este PDF a Word») o desde la Protomolécula.
                Motor: <a className="underline hover:text-white/70" href="https://github.com/KnifeLemon/Filee" target="_blank" rel="noreferrer">Filee</a> (MIT), en la propia neurona.
            </footer>
        </div>
    );
}

export default Conversor;
