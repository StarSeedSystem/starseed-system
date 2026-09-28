"use client";

/**
 * «Documentos y presentaciones» (`/documentos`): crear uno nuevo con su título y abrir los tuyos o
 * los que te compartieron. Lee solo columnas ligeras de `os_spaces` (nunca el documento entero).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { FilePlus2, FileText, Loader2, LogIn, Presentation, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { listarEspaciosApp, uidActual, type AppColaborativa, type EntradaListaApp } from "@/lib/vivo/doc-colaborativo/espacios";
import { crearVivoDocumento, INFO_VIVO_DOCUMENTO, rutaDocumento } from "@/lib/vivo/documento";
import { crearVivoPresentacion, INFO_VIVO_PRESENTACION, rutaPresentacion } from "@/lib/vivo/presentacion";
import styles from "./documento.module.css";

type Filtro = "todos" | "mios" | "compartidos";

const FILTROS: { id: Filtro; nombre: string }[] = [
    { id: "todos", nombre: "Todos" },
    { id: "mios", nombre: "Míos" },
    { id: "compartidos", nombre: "Conmigo" },
];

function haceCuanto(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const seg = Math.round((t - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
    const abs = Math.abs(seg);
    if (abs < 60) return rtf.format(seg, "second");
    if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(seg / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), "day");
    return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

interface Estado {
    cargando: boolean;
    sinCuenta: boolean;
    documentos: EntradaListaApp[];
    presentaciones: EntradaListaApp[];
}

export function MisDocumentos() {
    const router = useRouter();
    const reducido = useReducedMotion();
    const [estado, setEstado] = useState<Estado>({ cargando: true, sinCuenta: false, documentos: [], presentaciones: [] });
    const [titulo, setTitulo] = useState("");
    const [creando, setCreando] = useState<AppColaborativa | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setEstado((e) => ({ ...e, cargando: true }));
        const uid = await uidActual();
        if (!uid) {
            setEstado({ cargando: false, sinCuenta: true, documentos: [], presentaciones: [] });
            return;
        }
        const [documentos, presentaciones] = await Promise.all([listarEspaciosApp("documento"), listarEspaciosApp("presentacion")]);
        setEstado({ cargando: false, sinCuenta: false, documentos, presentaciones });
    }, []);

    useEffect(() => {
        void cargar();
        const alVolver = () => document.visibilityState === "visible" && void cargar();
        document.addEventListener("visibilitychange", alVolver);
        return () => document.removeEventListener("visibilitychange", alVolver);
    }, [cargar]);

    const crear = async (app: AppColaborativa) => {
        setError(null);
        setCreando(app);
        try {
            const r = app === "documento" ? await crearVivoDocumento(titulo) : await crearVivoPresentacion(titulo);
            router.push(r.ruta);
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : "No se pudo crear. Revisa la conexión e inténtalo de nuevo.");
            setCreando(null);
        }
    };

    return (
        <div className={cn(styles.marco, "mx-auto w-full max-w-[1200px] px-3 pb-28 pt-4 sm:px-5 sm:pt-6")} data-mis-documentos="">
            <header className="mb-5 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                    <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">Documentos y presentaciones</h1>
                    <p className="mt-1 text-[13.5px] text-white/60">Escribe y presenta con otras personas a la vez. Todo se guarda solo y queda un historial de versiones.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="ss-redondo inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07] hover:text-white"
                >
                    <RefreshCw className={cn("h-4 w-4", estado.cargando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" /> Actualizar
                </button>
            </header>

            {estado.sinCuenta ? (
                <section className={cn(styles.cristal, "rounded-[24px] p-6 text-center")}>
                    <LogIn className="mx-auto mb-3 h-7 w-7 text-[#c4b5fd]" aria-hidden="true" />
                    <p className="text-[16px] font-semibold">Inicia sesión para crear y ver tus documentos</p>
                    <p className="mt-1 text-[13.5px] text-white/60">Los documentos y presentaciones viven en tu cuenta y se comparten por invitación.</p>
                    <Link
                        href="/login"
                        className="ss-redondo mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.03]"
                    >
                        Iniciar sesión
                    </Link>
                </section>
            ) : (
                <motion.section
                    className={cn(styles.cristal, "rounded-[24px] p-4 sm:p-5")}
                    initial={reducido ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    aria-label="Crear"
                >
                    <label htmlFor="titulo-nuevo" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        Crear algo nuevo
                    </label>
                    <div className="flex flex-col gap-2.5 md:flex-row">
                        <input
                            id="titulo-nuevo"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Título (opcional): Plan de la asamblea, Presupuesto del huerto…"
                            maxLength={200}
                            className="h-12 min-w-0 flex-1 rounded-[16px] border-0 bg-white/[0.06] px-4 text-[15px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-[#7C5CFF]"
                        />
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:flex">
                            <BotonCrear app="documento" creando={creando} onCrear={crear} />
                            <BotonCrear app="presentacion" creando={creando} onCrear={crear} />
                        </div>
                    </div>
                    {error && (
                        <p role="alert" className="mt-3 rounded-[14px] bg-[#DC143C]/15 px-3 py-2 text-[13px] text-[#fecdd3] shadow-[inset_0_0_0_1px_#DC143C55]">
                            {error}
                        </p>
                    )}
                </motion.section>
            )}

            {!estado.sinCuenta && (
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                    <Lista app="documento" entradas={estado.documentos} cargando={estado.cargando} />
                    <Lista app="presentacion" entradas={estado.presentaciones} cargando={estado.cargando} />
                </div>
            )}
        </div>
    );
}

function BotonCrear({ app, creando, onCrear }: { app: AppColaborativa; creando: AppColaborativa | null; onCrear: (a: AppColaborativa) => void }) {
    const info = app === "documento" ? INFO_VIVO_DOCUMENTO : INFO_VIVO_PRESENTACION;
    const Icono = app === "documento" ? FilePlus2 : Presentation;
    const ocupado = creando === app;
    return (
        <button
            type="button"
            onClick={() => onCrear(app)}
            disabled={creando !== null}
            className="ss-redondo inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            style={{ background: info.color, boxShadow: `0 6px 18px ${info.color}55` }}
        >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icono className="h-4 w-4" aria-hidden="true" />}
            {ocupado ? "Creando…" : app === "documento" ? "Nuevo documento" : "Nueva presentación"}
        </button>
    );
}

function Lista({ app, entradas, cargando }: { app: AppColaborativa; entradas: EntradaListaApp[]; cargando: boolean }) {
    const [filtro, setFiltro] = useState<Filtro>("todos");
    const info = app === "documento" ? INFO_VIVO_DOCUMENTO : INFO_VIVO_PRESENTACION;
    const Icono = app === "documento" ? FileText : Presentation;
    const ruta = app === "documento" ? rutaDocumento : rutaPresentacion;
    const visibles = useMemo(
        () => entradas.filter((e) => (filtro === "mios" ? e.propio : filtro === "compartidos" ? !e.propio : true)),
        [entradas, filtro],
    );
    const nombre = app === "documento" ? "Documentos" : "Presentaciones";
    return (
        <section className={cn(styles.cristal, "flex min-h-[220px] flex-col rounded-[24px] p-3 sm:p-4")} aria-label={nombre}>
            <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-[14px]" style={{ background: `${info.color}1f`, boxShadow: `inset 0 0 0 1px ${info.color}66` }} aria-hidden="true">
                    <Icono className="h-5 w-5" style={{ color: info.color }} />
                </span>
                <h2 className="mr-auto text-[16px] font-semibold">
                    {nombre} <span className="text-white/45">· {entradas.length}</span>
                </h2>
                <div role="radiogroup" aria-label={`Filtrar ${nombre.toLowerCase()}`} className="ss-redondo flex rounded-full bg-white/[0.05] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            role="radio"
                            aria-checked={filtro === f.id}
                            onClick={() => setFiltro(f.id)}
                            className={cn(
                                "ss-redondo min-h-8 cursor-pointer rounded-full px-3 text-[12.5px] font-semibold transition-colors duration-200",
                                filtro === f.id ? "bg-white/[0.14] text-white" : "text-white/60 hover:text-white",
                            )}
                        >
                            {f.nombre}
                        </button>
                    ))}
                </div>
            </div>
            {cargando && !entradas.length ? (
                <ul className="space-y-2" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                        <li key={i} className="h-[62px] animate-pulse rounded-[16px] bg-white/[0.04] motion-reduce:animate-none" />
                    ))}
                </ul>
            ) : visibles.length === 0 ? (
                <p className="grid flex-1 place-items-center px-4 py-8 text-center text-[13.5px] text-white/55">
                    {filtro === "compartidos"
                        ? `Aún nadie te ha compartido ${app === "documento" ? "documentos" : "presentaciones"}.`
                        : `Todavía no hay ${app === "documento" ? "documentos" : "presentaciones"}. Crea ${app === "documento" ? "el primero" : "la primera"} arriba.`}
                </p>
            ) : (
                <ul className="space-y-1.5" role="list">
                    {visibles.map((e) => (
                        <li key={e.refId}>
                            <Link
                                href={ruta(e.refId)}
                                className="flex min-h-[62px] cursor-pointer items-center gap-3 rounded-[16px] px-3 py-2.5 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                            >
                                <Icono className="h-5 w-5 flex-none text-white/55" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14.5px] font-semibold text-white">{e.titulo}</span>
                                    <span className="flex items-center gap-1.5 text-[12px] text-white/55">
                                        {!e.propio && <Users className="h-3.5 w-3.5" aria-hidden="true" />}
                                        {e.propio ? "Tuyo" : "Compartido contigo"}
                                        {e.actualizado && ` · editado ${haceCuanto(e.actualizado)}`}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
