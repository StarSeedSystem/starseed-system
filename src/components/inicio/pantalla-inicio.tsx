"use client";
/**
 * Pantalla de inicio (Ola 381 · INI3) — sencilla, profesional y del perfil. Sin rejilla ni
 * cajas: el reloj arriba como protagonista y el resto flotando en un arco suave (una columna
 * en el móvil). «Personalizar» permite quitar, mover, cambiar de tamaño y añadir cualquier
 * widget del catálogo; la lista se guarda POR PERFIL (`widgets-inicio.ts`).
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, KeyRound, Plus, RotateCcw, Search, Settings2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { deviceId } from "@/lib/sync/entity-state";
import { DesktopWidgetHost } from "@/components/desktop/desktop-widget-host";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { TIPOS_CON_DISENO_LIBRE } from "@/components/widgets-libres/registro-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { dispositivoActual, type ClaseDispositivo } from "@/lib/widgets/forma/tamanos";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { activeProfileId } from "@/lib/profiles/profiles";
import {
    agregar, cambiarTamano, guardarWidgetsInicio, leerWidgetsInicio, mover, porDefecto, quitar,
    type ItemInicio, type TamanoInicio,
} from "@/lib/inicio/widgets-inicio";

// Cada tamaño cae en SU clase de WidgetLibre (claseDesdePx: lado menor <110 micro, <180 s, <280 m, <420 l).
const PX: Record<TamanoInicio, [number, number]> = { micro: [100, 100], s: [170, 170], m: [280, 220], l: [400, 300], xl: [560, 440] };
const TAMANOS: TamanoInicio[] = ["micro", "s", "m", "l", "xl"];
const LIBRES = new Set<string>(TIPOS_CON_DISENO_LIBRE);
// Solo se carga si se abre: pantalla inicial y bloqueo de este dispositivo (INI5 + BLQ6).
const PreferenciasArranque = dynamic(() => import("./preferencias-arranque").then((m) => m.PreferenciasArranque), { ssr: false });

/** El perfil activo: la misma fuente que usa el arranque para elegir la pantalla inicial. */
export function perfilActivo(): string {
    return activeProfileId() ?? "local";
}

function saludo(h: number): string {
    return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function Pieza({ item, ancho, editando, onCambio }: { item: ItemInicio; ancho: number; editando: boolean; onCambio: (a: "quitar" | "izq" | "der" | "tam") => void }) {
    const [w, h] = PX[item.tamano];
    const escala = Math.min(1, (ancho - 32) / w);
    const nombre = WIDGET_MANIFEST[item.tipo as keyof typeof WIDGET_MANIFEST]?.label ?? item.tipo;
    const host = <DesktopWidgetHost type={item.tipo} instanceId={`inicio-${item.id}`} />;
    const per = personalidadDe(item.tipo);
    return (
        <div className="relative" style={{ width: w * escala, height: h * escala }} data-testid={`pieza-${item.tipo}`}>
            {LIBRES.has(item.tipo) ? host : <WidgetLibre forma={per.forma} acento={per.acento} etiqueta={nombre} intensidad={0.25}>{host}</WidgetLibre>}
            {editando && (
                <div className="absolute -top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-md">
                    <button type="button" aria-label={`Mover ${nombre} antes`} onClick={() => onCambio("izq")} className="grid size-6 cursor-pointer place-items-center rounded-full text-white hover:bg-white/15"><ChevronLeft className="size-3.5" /></button>
                    <button type="button" aria-label={`Tamaño de ${nombre}: ${item.tamano}`} onClick={() => onCambio("tam")} className="h-6 cursor-pointer rounded-full px-2 text-[10px] font-bold uppercase text-white hover:bg-white/15">{item.tamano}</button>
                    <button type="button" aria-label={`Mover ${nombre} después`} onClick={() => onCambio("der")} className="grid size-6 cursor-pointer place-items-center rounded-full text-white hover:bg-white/15"><ChevronRight className="size-3.5" /></button>
                    <button type="button" aria-label={`Quitar ${nombre}`} onClick={() => onCambio("quitar")} className="grid size-6 cursor-pointer place-items-center rounded-full text-rose-300 hover:bg-rose-500/20"><X className="size-3.5" /></button>
                </div>
            )}
        </div>
    );
}

export function PantallaInicio() {
    const reducido = useReducedMotion();
    const [perfil, setPerfil] = React.useState("local");
    const [disp, setDisp] = React.useState<ClaseDispositivo>("escritorio");
    const [ancho, setAncho] = React.useState(1280);
    const [lista, setLista] = React.useState<ItemInicio[] | null>(null);
    const [editando, setEditando] = React.useState(false);
    const [catalogo, setCatalogo] = React.useState(false);
    const [busca, setBusca] = React.useState("");
    const [arranque, setArranque] = React.useState(false);
    const [hora, setHora] = React.useState<number | null>(null);

    React.useEffect(() => {
        const p = perfilActivo(), d = dispositivoActual();
        setPerfil(p); setDisp(d); setAncho(window.innerWidth); setHora(new Date().getHours());
        setLista(leerWidgetsInicio(p, d));
        const r = () => setAncho(window.innerWidth);
        window.addEventListener("resize", r);
        return () => window.removeEventListener("resize", r);
    }, []);

    const cambiar = (nueva: ItemInicio[]) => { setLista(nueva); guardarWidgetsInicio(perfil, nueva); };
    const accion = (id: string) => (a: "quitar" | "izq" | "der" | "tam") => {
        if (!lista) return;
        if (a === "quitar") return cambiar(quitar(lista, id));
        if (a === "izq" || a === "der") return cambiar(mover(lista, id, a === "izq" ? -1 : 1));
        const it = lista.find((x) => x.id === id);
        if (it) cambiar(cambiarTamano(lista, id, TAMANOS[(TAMANOS.indexOf(it.tamano) + 1) % TAMANOS.length]));
    };

    const movil = disp === "movil" || ancho < 640;
    const [protagonista, ...resto] = lista ?? [];
    const tipos = Object.entries(WIDGET_MANIFEST)
        .map(([tipo, m]) => ({ tipo, label: m?.label ?? tipo }))
        .filter((t) => t.label.toLowerCase().includes(busca.trim().toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label, "es"));

    const entrada = (i: number) => (reducido ? {} : { initial: { opacity: 0, y: 24, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { delay: 0.08 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } });
    const arco = (i: number, n: number) => (movil || n < 3 ? 0 : -Math.sin((Math.PI * i) / Math.max(1, n - 1)) * 28);

    return (
        <main className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1600px] flex-col items-center gap-8 px-4 pb-28 pt-8" aria-label="Inicio">
            {hora !== null && <motion.h1 {...entrada(0)} className="text-center text-sm font-medium tracking-[0.3em] text-white/70 uppercase">{saludo(hora)}</motion.h1>}
            {lista === null ? null : lista.length === 0 ? (
                <p className="mt-16 text-sm text-white/70">Tu inicio está vacío. Pulsa «Personalizar» para añadir widgets.</p>
            ) : (
                <>
                    {protagonista && (
                        <motion.div {...entrada(1)}><Pieza item={protagonista} ancho={ancho} editando={editando} onCambio={accion(protagonista.id)} /></motion.div>
                    )}
                    <div className={`flex w-full flex-wrap items-center justify-center ${movil ? "flex-col gap-6" : "gap-x-10 gap-y-12"}`}>
                        <AnimatePresence initial={false}>
                            {resto.map((it, i) => (
                                <motion.div key={it.id} layout {...entrada(i + 2)} exit={{ opacity: 0, scale: 0.9 }}>
                                    <div style={{ transform: `translateY(${arco(i, resto.length)}px)` }}>
                                        <Pieza item={it} ancho={ancho} editando={editando} onCambio={accion(it.id)} />
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            )}

            <div className="fixed bottom-24 right-5 z-30 flex items-center gap-2">
                {editando && (
                    <>
                        <button type="button" onClick={() => cambiar(porDefecto(disp))} className="flex cursor-pointer items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/60"><RotateCcw className="size-3.5" />Restablecer</button>
                        <button type="button" onClick={() => setArranque(true)} className="flex cursor-pointer items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/60"><KeyRound className="size-3.5" />Al abrir y bloqueo</button>
                        <button type="button" onClick={() => setCatalogo(true)} className="flex cursor-pointer items-center gap-1 rounded-full bg-violet-600/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-violet-600"><Plus className="size-3.5" />Añadir widget</button>
                    </>
                )}
                <button type="button" onClick={() => { setEditando((e) => !e); setCatalogo(false); }} aria-pressed={editando}
                    className="flex cursor-pointer items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 backdrop-blur-md hover:bg-black/60 hover:text-white">
                    <Settings2 className="size-3.5" />{editando ? "Listo" : "Personalizar"}
                </button>
            </div>

            <AnimatePresence>
                {arranque && (
                    <motion.div role="dialog" aria-label="Al abrir StarSeed y bloqueo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-md" onClick={(e) => { if (e.target === e.currentTarget) setArranque(false); }}>
                        <div className="max-h-[88vh] w-[min(96vw,720px)] overflow-auto rounded-[2rem] bg-slate-950/85 p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white">Al abrir StarSeed</h2>
                                <button type="button" aria-label="Cerrar" onClick={() => setArranque(false)} className="cursor-pointer text-white/60 hover:text-white"><X className="size-4" /></button>
                            </div>
                            <PreferenciasArranque ambito="perfil" id={perfil} neuronaId={deviceId()} nombreNeurona="Este dispositivo" onListo={() => setArranque(false)} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {catalogo && (
                    <motion.div role="dialog" aria-label="Añadir widget" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                        className="fixed bottom-36 right-5 z-40 flex max-h-[60vh] w-[min(92vw,340px)] flex-col gap-2 rounded-3xl bg-black/70 p-3 backdrop-blur-xl">
                        <label className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                            <Search className="size-3.5 text-white/60" />
                            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar widget…" aria-label="Buscar widget" className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-white/40 focus:outline-none" />
                            <button type="button" aria-label="Cerrar" onClick={() => setCatalogo(false)} className="cursor-pointer text-white/60 hover:text-white"><X className="size-3.5" /></button>
                        </label>
                        <ul className="flex-1 overflow-auto">
                            {tipos.map((t) => (
                                <li key={t.tipo}>
                                    <button type="button" onClick={() => { if (lista) cambiar(agregar(lista, t.tipo)); setCatalogo(false); }}
                                        className="w-full cursor-pointer rounded-xl px-3 py-1.5 text-left text-xs text-white/85 hover:bg-white/10 hover:text-white">{t.label}</button>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}

export default PantallaInicio;
