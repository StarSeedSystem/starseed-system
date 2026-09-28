"use client";
/**
 * Selector de pantalla inicial (Ola 381 · INI5): lo primero que se ve al abrir StarSeed, por
 * PERFIL o por NEURONA (la neurona manda sobre el perfil). Cuatro formas en vez de una lista:
 * los dashboards (pestaña Inicio, recomendado), los escritorios u otra página
 * cualquiera del OS (catálogo de apps con ruta propia).
 */
import * as React from "react";
import { Check, LayoutDashboard, Monitor, Search, Sparkles } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import type { TipoForma } from "@/lib/widgets/forma/formas";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { guardarPreferencia, leerPreferencias, type PreferenciaInicio } from "@/lib/inicio/pantalla-inicial";

type Opcion = "dashboard" | "escritorios" | "ruta";
const OPCIONES: { id: Opcion; titulo: string; nota: string; forma: TipoForma; acento: string; Icono: typeof Monitor }[] = [
    { id: "dashboard", titulo: "Mis dashboards", nota: "Pestaña Inicio · recomendado", forma: "hexagono", acento: "#7c5cff", Icono: LayoutDashboard },
    { id: "escritorios", titulo: "Escritorios", nota: "Ventanas e iconos", forma: "capsula", acento: "#007FFF", Icono: Monitor },
    { id: "ruta", titulo: "Otra página…", nota: "Cualquier app del OS", forma: "estrella", acento: "#FFBF00", Icono: Sparkles },
];

/** Páginas del OS que se pueden abrir como pantalla inicial (apps con ruta interna). */
export function paginasDelOS(): { nombre: string; ruta: string }[] {
    const vistas = new Set<string>();
    return APP_CATALOG
        .map((a) => ({ nombre: a.name, ruta: a.open.route ?? "" }))
        .filter((p) => p.ruta.startsWith("/") && !vistas.has(p.ruta) && vistas.add(p.ruta))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function SelectorPantallaInicial({ ambito, id, onGuardado }: { ambito: "perfil" | "neurona"; id: string; onGuardado?: (p: PreferenciaInicio) => void }) {
    const [actual, setActual] = React.useState<PreferenciaInicio>({ tipo: "dashboard" });
    const [abierto, setAbierto] = React.useState(false);
    const [busca, setBusca] = React.useState("");
    React.useEffect(() => {
        const p = leerPreferencias()[ambito === "perfil" ? "perfiles" : "neuronas"][id];
        if (p) { setActual(p); setAbierto(p.tipo === "ruta"); }
    }, [ambito, id]);

    const elegir = (pref: PreferenciaInicio) => { setActual(pref); guardarPreferencia(ambito, id, pref); onGuardado?.(pref); };
    const paginas = paginasDelOS().filter((p) => p.nombre.toLowerCase().includes(busca.trim().toLowerCase()));

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Pantalla al abrir StarSeed">
                {OPCIONES.map((o) => {
                    const activa = actual.tipo === o.id;
                    return (
                        <button key={o.id} type="button" role="radio" aria-checked={activa}
                            onClick={() => (o.id === "ruta" ? setAbierto(true) : (setAbierto(false), elegir({ tipo: o.id } as PreferenciaInicio)))}
                            className="h-32 cursor-pointer rounded-3xl text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">
                            <WidgetLibre forma={o.forma} acento={o.acento} etiqueta={o.titulo} intensidad={activa ? 0.85 : 0.2}>
                                <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                                    <o.Icono className="size-5" style={{ color: o.acento }} />
                                    <span className="text-xs font-semibold leading-tight">{o.titulo}</span>
                                    <span className="text-[10px] text-white/60">{activa ? <Check className="inline size-3" /> : null} {o.nota}</span>
                                </span>
                            </WidgetLibre>
                        </button>
                    );
                })}
            </div>
            {abierto && (
                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 rounded-full ss-redondo bg-white/10 px-3 py-1.5">
                        <Search className="size-3.5 text-white/60" />
                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar una página…" aria-label="Buscar una página"
                            className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-white/40 focus:outline-none" />
                    </label>
                    <ul className="flex max-h-44 flex-wrap gap-1.5 overflow-auto">
                        {paginas.map((p) => {
                            const activa = actual.tipo === "ruta" && actual.ruta === p.ruta;
                            return (
                                <li key={p.ruta}>
                                    <button type="button" onClick={() => elegir({ tipo: "ruta", ruta: p.ruta })} aria-pressed={activa}
                                        className="cursor-pointer rounded-full ss-redondo px-3 py-1 text-xs text-white/85 hover:text-white"
                                        style={{ background: activa ? "radial-gradient(closest-side,#FFBF0066,#FFBF0018)" : "rgba(255,255,255,.07)" }}>
                                        {p.nombre}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <p className="text-[11px] text-white/60">
                Es lo primero que ves al abrir StarSeed en {ambito === "neurona" ? "este dispositivo" : "este perfil"}. La neurona manda sobre el perfil.
            </p>
        </div>
    );
}

export default SelectorPantallaInicial;
