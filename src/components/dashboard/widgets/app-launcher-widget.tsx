'use client';

// ════════════════════════════════════════════════════════════════
// AppLauncherWidget — el lanzador de apps del tablero (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Es el dock que va en TODAS las pestañas, así que tiene que ser rápido:
//   · buscar mientras escribes sobre APP_CATALOG (sin acentos; Intro abre la primera),
//   · fijadas y recientes compartidas por todos los lanzadores del tablero,
//   · flechas para moverse, Intro para abrir, menú (clic derecho, pulsación larga o la
//     tecla de menú) VERTICAL con fijar y los modos de apertura permitidos,
//   · la rejilla se calcula con la caja: caben las que caben y la última tesela abre el
//     cajón con todas (búsqueda + categorías).
// Una composición por tamaño: micro = un glifo que abre el cajón · s = cuatro teselas ·
// m = buscador + rejilla · l/xl = + pestañas Fijadas/Recientes/Todas/categorías y la
// descripción de la app enfocada · panorámico = dock horizontal · torre = lista.
// TV: teselas grandes con anillo de foco; táctil: objetivos de 44 px.
// Los ajustes de siempre (colección, forma, estilo, columnas, apertura…) siguen en el
// engranaje y se guardan con el evento 'starseed:update-widget-settings'.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LayoutGrid, Pin, PinOff, Search, Settings2, X, History, ExternalLink, AppWindow, Route, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardWidget } from "../dashboard-types";
import {
    resolveLauncherSettings,
    ICON_SHAPE_CLASS,
    HEX_CLIP_PATH,
    OPEN_MODE_LABEL,
    type AppLauncherSettings,
    type IconShape,
    type IconStyle,
    type OpenMode,
    type LauncherVariant,
    type LauncherCollection,
    type LauncherDensity,
    type StarseedApp,
} from "../apps/launcher-types";
import { resolveApps, APP_CATALOG, APP_COLLECTIONS } from "../apps/app-catalog";
import { useAppLauncher } from "../apps/app-launch";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { BotonE, MenuE, PestanasE, RaizE, VacioE, tintaE, type OpcionMenuE } from "./paquete-e/piezas";
import { buscarApps, moverEnRejilla, nombreCategoria, ordenarParaLanzador, rejillaPara, useLanzadorLocal } from "./paquete-e/lanzador";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";

// ── Icono de app: un objeto de cristal con la luz de su acento ─────────

function oscuro(hex: string, t: number) {
    return /^#[0-9a-f]{6}$/i.test(hex) ? mezclar(hex, "#05060f", t) : hex;
}

function IconoAplicacion({ app, lado, forma, estilo }: { app: StarseedApp; lado: number; forma: IconShape; estilo: IconStyle }) {
    const Icono = app.icon;
    const a = app.accent;
    const fondo: React.CSSProperties =
        estilo === "solid" ? { background: a }
            : estilo === "outline" ? { background: "rgba(10,12,30,.35)", boxShadow: `inset 0 0 0 2px ${a}` }
                : estilo === "gradient" ? { background: `linear-gradient(145deg, ${a}, ${oscuro(a, 0.45)})` }
                    : { background: `linear-gradient(150deg, ${conAlfa(a, 0.5)}, ${conAlfa(oscuro(a, 0.3), 0.25)})`, boxShadow: `inset 0 0 0 1px ${conAlfa(a, 0.55)}` };
    return (
        <span
            aria-hidden
            className={cn("relative grid shrink-0 place-items-center overflow-hidden", ICON_SHAPE_CLASS[forma])}
            style={{
                width: lado, height: lado, ...fondo,
                clipPath: forma === "hex" ? HEX_CLIP_PATH : undefined,
                filter: `drop-shadow(0 6px 10px ${conAlfa(a, 0.35)})`,
            }}
        >
            {/* brillo de cristal arriba a la izquierda */}
            <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 70% at 25% 10%, rgba(255,255,255,.38), rgba(255,255,255,0) 55%)" }} />
            {app.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.iconUrl} alt="" draggable={false} className="relative size-full object-cover" loading="lazy" decoding="async" />
            ) : (
                <Icono className="relative" style={{ width: lado * 0.48, height: lado * 0.48, color: estilo === "outline" ? a : "#fff" }} strokeWidth={2} />
            )}
            {app.status === "soon" && (
                <span className="absolute bottom-0 inset-x-0 bg-amber-400/90 text-center text-[8px] font-bold uppercase leading-[11px] text-black" style={{ fontSize: Math.max(8, lado * 0.16) }}>pronto</span>
            )}
        </span>
    );
}

// ── Tesela (botón de una app) ─────────────────────────────────────────

interface TeselaProps {
    app: StarseedApp;
    lado: number;
    forma: IconShape;
    estilo: IconStyle;
    conEtiqueta: boolean;
    fijada: boolean;
    enfocable: boolean;
    lienzo: LienzoE;
    alAbrir: () => void;
    alMenu: (x: number, y: number) => void;
    alEnfocar: () => void;
    fila?: boolean;
    refBoton: (el: HTMLButtonElement | null) => void;
}

function TeselaAplicacion({ app, lado, forma, estilo, conEtiqueta, fijada, enfocable, lienzo, alAbrir, alMenu, alEnfocar, fila, refBoton }: TeselaProps) {
    const largo = useRef<number | undefined>(undefined);
    const disparado = useRef(false);
    const cancelar = () => { window.clearTimeout(largo.current); };
    const etiqueta = `${app.name}${app.status === "soon" ? " (pronto)" : ""}${fijada ? ", fijada" : ""}`;
    return (
        <button
            ref={refBoton}
            type="button"
            role="gridcell"
            tabIndex={enfocable ? 0 : -1}
            aria-label={etiqueta}
            title={`${app.name} — ${app.description}`}
            onClick={() => { if (disparado.current) { disparado.current = false; return; } alAbrir(); }}
            onFocus={alEnfocar}
            onMouseEnter={alEnfocar}
            onContextMenu={(e) => { e.preventDefault(); alMenu(e.clientX, e.clientY); }}
            onKeyDown={(e) => {
                if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    alMenu(r.left + r.width / 2, r.bottom);
                }
            }}
            onPointerDown={(e) => {
                if (e.pointerType !== "touch") return;
                disparado.current = false;
                const { clientX, clientY } = e;
                largo.current = window.setTimeout(() => { disparado.current = true; alMenu(clientX, clientY); }, 520);
            }}
            onPointerUp={cancelar}
            onPointerLeave={cancelar}
            onPointerMove={(e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancelar(); }}
            className={cn(
                "group relative flex min-w-0 cursor-pointer select-none rounded-2xl outline-none transition-transform duration-200 ease-out",
                "focus-visible:ring-2 focus-visible:ring-offset-0",
                fila ? "w-full items-center gap-3 px-1.5 py-1 text-left hover:bg-white/[0.06]" : "flex-col items-center gap-1.5 hover:-translate-y-0.5 active:scale-95",
                lienzo.tv && "focus-visible:ring-4",
            )}
            style={{ ["--tw-ring-color" as string]: conAlfa(lienzo.acento, 0.85) } as React.CSSProperties}
        >
            <IconoAplicacion app={app} lado={lado} forma={forma} estilo={estilo} />
            {fijada && !fila && (
                <Pin aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rotate-45 drop-shadow" style={{ color: tintaE(lienzo.acento) }} fill="currentColor" />
            )}
            {conEtiqueta && !fila && (
                <span className="w-full truncate text-center font-medium leading-tight text-white/85" style={{ fontSize: px(lienzo, lado >= 56 ? 12 : 11), maxWidth: lado + 22 }}>
                    {app.short ?? app.name}
                </span>
            )}
            {fila && (
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }}>{app.name}</span>
                        {fijada && <Pin aria-hidden className="size-3 shrink-0 rotate-45" style={{ color: tintaE(lienzo.acento) }} fill="currentColor" />}
                    </span>
                    <span className="line-clamp-1 text-white/55" style={{ fontSize: px(lienzo, 11) }}>{app.description}</span>
                </span>
            )}
        </button>
    );
}

/** Tesela «Todas»: abre el cajón. */
function TeselaTodas({ lado, cuantas, lienzo, alAbrir, refBoton, enfocable }: { lado: number; cuantas: number; lienzo: LienzoE; alAbrir: () => void; refBoton: (el: HTMLButtonElement | null) => void; enfocable: boolean }) {
    return (
        <button
            ref={refBoton}
            type="button"
            role="gridcell"
            tabIndex={enfocable ? 0 : -1}
            onClick={alAbrir}
            aria-label={`Ver todas las apps (${cuantas})`}
            title="Todas las apps"
            className="group flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-2xl outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2"
            style={{ ["--tw-ring-color" as string]: conAlfa(lienzo.acento, 0.85) } as React.CSSProperties}
        >
            <span className="relative grid place-items-center rounded-[30%]" style={{ width: lado, height: lado, background: conAlfa(lienzo.acento, 0.12), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.45)}` }}>
                <LayoutGrid style={{ width: lado * 0.42, height: lado * 0.42, color: tintaE(lienzo.acento) }} />
            </span>
            <span className="truncate text-center font-medium text-white/70" style={{ fontSize: px(lienzo, 11), maxWidth: lado + 22 }}>
                Todas <span className="tabular-nums text-white/45">{cuantas}</span>
            </span>
        </button>
    );
}

// ── Rejilla con flechas (roving tabindex) ─────────────────────────────

function RejillaApps({
    apps, columnas, lado, lienzo, ajustes, fijadas, conTodas, totalTodas, alAbrir, alMenu, alEnfocar, alTodas, fila, etiqueta, refPrimera,
}: {
    apps: StarseedApp[];
    columnas: number;
    lado: number;
    lienzo: LienzoE;
    ajustes: AppLauncherSettings;
    fijadas: string[];
    conTodas: boolean;
    totalTodas: number;
    alAbrir: (a: StarseedApp) => void;
    alMenu: (a: StarseedApp, x: number, y: number) => void;
    alEnfocar: (a: StarseedApp | null) => void;
    alTodas: () => void;
    fila?: boolean;
    etiqueta: string;
    refPrimera?: React.MutableRefObject<HTMLButtonElement | null>;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const [activo, setActivo] = useState(0);
    const total = apps.length + (conTodas ? 1 : 0);
    const cols = fila ? 1 : Math.max(1, columnas);
    useEffect(() => { if (activo >= total) setActivo(Math.max(0, total - 1)); }, [activo, total]);

    const alTeclear = (e: React.KeyboardEvent) => {
        const destino = moverEnRejilla(activo, e.key, cols, total);
        if (destino === activo && !["Home", "End"].includes(e.key)) return;
        if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            setActivo(destino);
            refs.current[destino]?.focus();
        }
    };

    return (
        <div
            role="grid"
            aria-label={etiqueta}
            onKeyDown={alTeclear}
            className={cn(fila ? "flex flex-col gap-0.5" : "grid justify-items-center")}
            style={fila ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, rowGap: lienzo.tv ? 16 : 10, columnGap: 6 }}
        >
            {apps.map((app, i) => (
                <TeselaAplicacion
                    key={app.id}
                    app={app}
                    lado={lado}
                    forma={ajustes.iconShape ?? "squircle"}
                    estilo={ajustes.iconStyle ?? "glass"}
                    conEtiqueta={ajustes.showLabels !== false}
                    fijada={fijadas.includes(app.id)}
                    enfocable={i === activo}
                    lienzo={lienzo}
                    fila={fila}
                    alAbrir={() => alAbrir(app)}
                    alMenu={(x, y) => alMenu(app, x, y)}
                    alEnfocar={() => { setActivo(i); alEnfocar(app); }}
                    refBoton={(el) => { refs.current[i] = el; if (i === 0 && refPrimera) refPrimera.current = el; }}
                />
            ))}
            {conTodas && (
                <TeselaTodas lado={lado} cuantas={totalTodas} lienzo={lienzo} alAbrir={alTodas} enfocable={activo === apps.length} refBoton={(el) => { refs.current[apps.length] = el; }} />
            )}
        </div>
    );
}

// ── Buscador ──────────────────────────────────────────────────────────

function Buscador({ valor, onCambio, onIntro, onBajar, lienzo, refInput, autoFocus }: {
    valor: string;
    onCambio: (v: string) => void;
    onIntro: () => void;
    onBajar?: () => void;
    lienzo: LienzoE;
    refInput?: React.Ref<HTMLInputElement>;
    autoFocus?: boolean;
}) {
    return (
        <label className="relative flex min-w-0 shrink-0 items-center" style={{ height: lienzo.tactil ? 44 : lienzo.tv ? 40 : 32 }}>
            <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-white/45" />
            <input
                ref={refInput}
                type="search"
                value={valor}
                autoFocus={autoFocus}
                onChange={(e) => onCambio(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); onIntro(); }
                    else if (e.key === "Escape") { if (valor) { e.preventDefault(); e.stopPropagation(); onCambio(""); } }
                    else if (e.key === "ArrowDown" && onBajar) { e.preventDefault(); onBajar(); }
                }}
                placeholder="Buscar apps…"
                aria-label="Buscar apps"
                className="h-full w-full min-w-0 rounded-full bg-white/[0.06] pl-9 pr-3 text-white placeholder:text-white/40 outline-none transition-shadow duration-200 focus:bg-white/[0.09]"
                style={{ fontSize: px(lienzo, 13), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.28)}` }}
            />
        </label>
    );
}

// ── Cajón con todas las apps ──────────────────────────────────────────

function CajonApps({ apps, lienzo, ajustes, fijadas, alAbrir, alMenu, onCerrar, etiqueta }: {
    apps: StarseedApp[];
    lienzo: LienzoE;
    ajustes: AppLauncherSettings;
    fijadas: string[];
    alAbrir: (a: StarseedApp) => void;
    alMenu: (a: StarseedApp, x: number, y: number) => void;
    onCerrar: () => void;
    etiqueta: string;
}) {
    const [q, setQ] = useState("");
    const [cat, setCat] = useState<string>("todas");
    const primera = useRef<HTMLButtonElement | null>(null);
    const categorias = useMemo(() => Array.from(new Set(apps.map((a) => a.category))), [apps]);
    const filtradas = useMemo(() => buscarApps(cat === "todas" ? apps : apps.filter((a) => a.category === cat), q), [apps, cat, q]);
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        window.addEventListener("keydown", tecla);
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = previo; };
    }, [onCerrar]);
    const lado = lienzo.tv ? 72 : lienzo.tactil ? 56 : 52;
    const columnas = typeof window === "undefined" ? 5 : Math.max(3, Math.min(8, Math.floor((Math.min(window.innerWidth - 48, 760)) / (lado + 34))));
    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${etiqueta}: todas las apps`}>
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCerrar} aria-hidden />
            <div
                className="relative flex max-h-[88vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-t-[28px] p-4 text-white sm:rounded-[28px] sm:p-5"
                style={{ background: "rgba(12,14,34,.92)", boxShadow: `0 30px 80px -30px rgba(0,0,0,.9), inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.3)}`, backdropFilter: "blur(20px)" }}
            >
                <div className="flex items-center gap-2">
                    <LayoutGrid className="size-5" style={{ color: tintaE(lienzo.acento) }} aria-hidden />
                    <h2 className="flex-1 truncate text-[15px] font-semibold">{etiqueta}</h2>
                    <BotonE lienzo={lienzo} variante="fantasma" icono={X} etiqueta="Cerrar" onClick={onCerrar} />
                </div>
                <Buscador valor={q} onCambio={setQ} lienzo={lienzo} autoFocus onIntro={() => { if (filtradas[0]) { alAbrir(filtradas[0]); onCerrar(); } }} onBajar={() => primera.current?.focus()} />
                {categorias.length > 1 && (
                    <PestanasE
                        lienzo={lienzo}
                        etiqueta="Categorías"
                        valor={cat}
                        onCambio={setCat}
                        opciones={[{ id: "todas", etiqueta: "Todas", cuenta: apps.length }, ...categorias.map((c) => ({ id: c, etiqueta: nombreCategoria(c), cuenta: apps.filter((a) => a.category === c).length }))]}
                    />
                )}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pt-1">
                    {filtradas.length === 0 ? (
                        <p role="status" className="py-10 text-center text-[13px] text-white/60">Ninguna app coincide con «{q}».</p>
                    ) : (
                        <RejillaApps
                            apps={filtradas}
                            columnas={columnas}
                            lado={lado}
                            lienzo={lienzo}
                            ajustes={{ ...ajustes, showLabels: true }}
                            fijadas={fijadas}
                            conTodas={false}
                            totalTodas={0}
                            alAbrir={(a) => { alAbrir(a); onCerrar(); }}
                            alMenu={alMenu}
                            alEnfocar={() => undefined}
                            alTodas={() => undefined}
                            etiqueta="Todas las apps"
                            refPrimera={primera}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

// ── Ajustes del lanzador (engranaje) ──────────────────────────────────

const VARIANTES: { v: LauncherVariant; label: string }[] = [{ v: "folder", label: "Carpeta" }, { v: "single", label: "Una app" }];
const COLECCIONES: { c: LauncherCollection; label: string }[] = [{ c: "starseed", label: "StarSeed" }, { c: "sistema", label: "Sistema" }, { c: "media", label: "Medios" }, { c: "custom", label: "Propia" }];
const FORMAS: { v: IconShape; label: string }[] = [{ v: "squircle", label: "Squircle" }, { v: "circle", label: "Círculo" }, { v: "rounded", label: "Redondeado" }, { v: "hex", label: "Hexágono" }];
const ESTILOS: { v: IconStyle; label: string }[] = [{ v: "glass", label: "Cristal" }, { v: "solid", label: "Sólido" }, { v: "outline", label: "Contorno" }, { v: "gradient", label: "Degradado" }];
const DENSIDADES: { v: LauncherDensity; label: string }[] = [{ v: "comfortable", label: "Cómoda" }, { v: "compact", label: "Compacta" }];
const APERTURAS: (OpenMode | "auto")[] = ["auto", "window", "tab", "popup", "route", "embed"];

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{label}</div>
            <div className="flex flex-wrap gap-1.5">{children}</div>
        </div>
    );
}

function Opcion({ activa, onClick, children, acento }: { activa: boolean; onClick: () => void; children: React.ReactNode; acento: string }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={activa}
            className="ss-redondo min-h-8 cursor-pointer rounded-full px-3 text-[12px] font-semibold transition-colors duration-200"
            style={activa ? { background: conAlfa(acento, 0.22), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.6)}`, color: "#fff" } : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)" }}>
            {children}
        </button>
    );
}

function PanelAjustes({ ajustes, cambiar, onCerrar, acento }: { ajustes: AppLauncherSettings; cambiar: (p: Partial<AppLauncherSettings>) => void; onCerrar: () => void; acento: string }) {
    const ids = ajustes.appIds.length ? ajustes.appIds : (APP_COLLECTIONS[ajustes.collection ?? "starseed"] ?? []);
    const alternar = (id: string) => {
        const s = new Set(ids);
        if (s.has(id)) s.delete(id); else s.add(id);
        cambiar({ appIds: Array.from(s), collection: "custom" });
    };
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [onCerrar]);
    return createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ajustes del lanzador">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCerrar} aria-hidden />
            <div className="relative max-h-[85vh] w-full max-w-md space-y-4 overflow-auto rounded-[24px] p-5 text-white" style={{ background: "rgba(12,14,34,.94)", boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.3)}` }}>
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Settings2 className="size-4" style={{ color: acento }} /> Ajustes del lanzador</h3>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar" className="ss-redondo grid size-8 cursor-pointer place-items-center rounded-full hover:bg-white/10"><X className="size-4" /></button>
                </div>
                <Fila label="Nombre">
                    <input value={ajustes.label ?? ""} onChange={(e) => cambiar({ label: e.target.value })}
                        className="w-full rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] outline-none focus:bg-white/[0.1]" placeholder="Nombre del lanzador" aria-label="Nombre del lanzador" />
                </Fila>
                <Fila label="Tipo">{VARIANTES.map((x) => <Opcion key={x.v} acento={acento} activa={ajustes.variant === x.v} onClick={() => cambiar({ variant: x.v })}>{x.label}</Opcion>)}</Fila>
                <Fila label="Colección">{COLECCIONES.map((x) => <Opcion key={x.c} acento={acento} activa={(ajustes.collection ?? "starseed") === x.c} onClick={() => cambiar(x.c !== "custom" ? { collection: x.c, appIds: [] } : { collection: x.c })}>{x.label}</Opcion>)}</Fila>
                <Fila label="Forma del icono">{FORMAS.map((x) => <Opcion key={x.v} acento={acento} activa={(ajustes.iconShape ?? "squircle") === x.v} onClick={() => cambiar({ iconShape: x.v })}>{x.label}</Opcion>)}</Fila>
                <Fila label="Estilo del icono">{ESTILOS.map((x) => <Opcion key={x.v} acento={acento} activa={(ajustes.iconStyle ?? "glass") === x.v} onClick={() => cambiar({ iconStyle: x.v })}>{x.label}</Opcion>)}</Fila>
                <Fila label="Densidad">{DENSIDADES.map((x) => <Opcion key={x.v} acento={acento} activa={(ajustes.density ?? "comfortable") === x.v} onClick={() => cambiar({ density: x.v })}>{x.label}</Opcion>)}</Fila>
                <Fila label="Agrupar por categorías">
                    <Opcion acento={acento} activa={ajustes.grouped === true} onClick={() => cambiar({ grouped: true })}>Sí</Opcion>
                    <Opcion acento={acento} activa={ajustes.grouped !== true} onClick={() => cambiar({ grouped: false })}>No</Opcion>
                </Fila>
                <Fila label={`Columnas: ${ajustes.columns && ajustes.columns > 0 ? ajustes.columns : "automáticas"}`}>
                    <input type="range" min={0} max={8} value={ajustes.columns ?? 0} onChange={(e) => cambiar({ columns: Number(e.target.value) })} className="w-full cursor-pointer" aria-label="Columnas" />
                </Fila>
                <Fila label="Abrir por defecto en">{APERTURAS.map((o) => <Opcion key={o} acento={acento} activa={(ajustes.defaultOpen ?? "auto") === o} onClick={() => cambiar({ defaultOpen: o === "auto" ? undefined : (o as OpenMode) })}>{o === "auto" ? "Lo de cada app" : OPEN_MODE_LABEL[o as OpenMode]}</Opcion>)}</Fila>
                <Fila label="Nombres bajo los iconos">
                    <Opcion acento={acento} activa={ajustes.showLabels !== false} onClick={() => cambiar({ showLabels: true })}>Mostrar</Opcion>
                    <Opcion acento={acento} activa={ajustes.showLabels === false} onClick={() => cambiar({ showLabels: false })}>Ocultar</Opcion>
                </Fila>
                <Fila label="Apps del lanzador">
                    <div className="grid w-full gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))" }}>
                        {APP_CATALOG.map((a) => {
                            const on = ids.includes(a.id);
                            const Ic = a.icon;
                            return (
                                <button key={a.id} type="button" onClick={() => alternar(a.id)} aria-pressed={on}
                                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-left text-[12px] font-medium transition-colors duration-200"
                                    style={on ? { background: conAlfa(acento, 0.16), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.5)}` } : { background: "rgba(255,255,255,.04)" }}>
                                    <Ic className="size-4 shrink-0" style={{ color: a.accent }} aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{a.short ?? a.name}</span>
                                    {on && <Check className="size-3.5 shrink-0" style={{ color: acento }} aria-hidden />}
                                </button>
                            );
                        })}
                    </div>
                </Fila>
            </div>
        </div>,
        document.body,
    );
}

// ── Widget ────────────────────────────────────────────────────────────

type Vista = "inicio" | "fijadas" | "recientes" | string;

export function AppLauncherWidget({ widget }: { widget: DashboardWidget }) {
    const { ref, lienzo } = useLienzoE();
    const [edits, setEdits] = useState<Partial<AppLauncherSettings>>({});
    const ajustes = useMemo(() => resolveLauncherSettings({ ...(widget.settings as Partial<AppLauncherSettings>), ...edits }), [widget.settings, edits]);
    const coleccion = useMemo(() => resolveApps(ajustes.appIds, ajustes.collection), [ajustes.appIds, ajustes.collection]);
    const { launch, windowEl } = useAppLauncher();
    const local = useLanzadorLocal();
    const [q, setQ] = useState("");
    const [vista, setVista] = useState<Vista>("inicio");
    const [cajon, setCajon] = useState(false);
    const [panel, setPanel] = useState(false);
    const [menu, setMenu] = useState<{ app: StarseedApp; x: number; y: number } | null>(null);
    const [enfocada, setEnfocada] = useState<StarseedApp | null>(null);
    const [abriendo, setAbriendo] = useState<string | null>(null);
    const [montado, setMontado] = useState(false);
    const primera = useRef<HTMLButtonElement | null>(null);
    const refBuscar = useRef<HTMLInputElement>(null);
    useEffect(() => setMontado(true), []);

    const nombre = ajustes.label?.trim() || "Apps";
    const cambiar = useCallback((p: Partial<AppLauncherSettings>) => {
        setEdits((prev) => ({ ...prev, ...p }));
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("starseed:update-widget-settings", { detail: { id: widget.id, settings: { ...ajustes, ...p } } }));
        }
    }, [ajustes, widget.id]);

    const abrir = useCallback((app: StarseedApp, modo?: OpenMode) => {
        local.anotarReciente(app.id);
        setAbriendo(app.id);
        window.setTimeout(() => setAbriendo((x) => (x === app.id ? null : x)), 900);
        launch(app, modo ?? ajustes.defaultOpen);
    }, [launch, ajustes.defaultOpen, local]);

    const ordenadas = useMemo(() => ordenarParaLanzador(coleccion, local.fijadas, local.recientes), [coleccion, local.fijadas, local.recientes]);
    const fijadasApps = useMemo(() => ordenadas.filter((a) => local.fijadas.includes(a.id)), [ordenadas, local.fijadas]);
    const recientesApps = useMemo(() => {
        const ids = [...local.recientes].sort((a, b) => b.t - a.t).map((r) => r.id);
        return ids.map((id) => coleccion.find((a) => a.id === id)).filter((a): a is StarseedApp => !!a);
    }, [local.recientes, coleccion]);

    const opcionesMenu = (app: StarseedApp): OpcionMenuE[] => {
        const fijada = local.fijadas.includes(app.id);
        const modos = app.open.allowed.map<OpcionMenuE>((m) => ({
            id: `modo-${m}`,
            etiqueta: `Abrir: ${OPEN_MODE_LABEL[m]}`,
            icono: m === "tab" || m === "popup" ? ExternalLink : m === "route" ? Route : AppWindow,
            alElegir: () => abrir(app, m),
        }));
        return [
            { id: "abrir", etiqueta: "Abrir", icono: AppWindow, alElegir: () => abrir(app) },
            { id: "fijar", etiqueta: fijada ? "Quitar de fijadas" : "Fijar arriba", icono: fijada ? PinOff : Pin, alElegir: () => local.fijar(app.id) },
            ...modos.filter((o) => o.id !== `modo-${app.open.primary}` || app.open.allowed.length > 1),
            ...(local.recientes.some((r) => r.id === app.id) ? [{ id: "olvidar", etiqueta: "Quitar de recientes", icono: History, alElegir: () => local.olvidarReciente(app.id) }] : []),
        ];
    };

    const abrirMenu = (app: StarseedApp, x: number, y: number) => setMenu({ app, x, y });
    const { base, clase, horizontal } = lienzo;

    // ── Tamaños de tesela por clase y dispositivo ──
    const compacta = ajustes.density === "compact";
    let lado = base === "xl" ? 60 : base === "l" ? 52 : base === "s" ? 40 : 46;
    if (horizontal) lado = Math.max(34, Math.min(56, (lienzo.alto || 110) - (ajustes.showLabels === false ? 16 : 36)));
    if (compacta) lado -= 6;
    if (lienzo.tv) lado = Math.round(lado * 1.3);
    if (lienzo.tactil) lado = Math.max(lado, 44);
    const anchoTesela = lado + (ajustes.showLabels === false ? 8 : 20);
    const altoTesela = lado + (ajustes.showLabels === false ? 8 : 26);

    const buscando = q.trim().length > 0;
    const resultados = useMemo(() => (buscando ? buscarApps(ordenadas, q) : ordenadas), [buscando, ordenadas, q]);

    // Conjunto a pintar según la pestaña (l/xl).
    const conjunto: StarseedApp[] = buscando ? resultados
        : vista === "fijadas" ? fijadasApps
            : vista === "recientes" ? recientesApps
                : vista !== "inicio" ? ordenadas.filter((a) => a.category === vista)
                    : ordenadas;

    const menuEl = montado && menu ? (
        <MenuE x={menu.x} y={menu.y} titulo={menu.app.name} acento={lienzo.acento} opciones={opcionesMenu(menu.app)} onCerrar={() => setMenu(null)} />
    ) : null;
    const cajonEl = montado && cajon ? (
        <CajonApps apps={ordenadas} lienzo={lienzo} ajustes={ajustes} fijadas={local.fijadas} alAbrir={(a) => abrir(a)} alMenu={abrirMenu} onCerrar={() => setCajon(false)} etiqueta={nombre} />
    ) : null;
    const panelEl = montado && panel ? <PanelAjustes ajustes={ajustes} cambiar={cambiar} onCerrar={() => setPanel(false)} acento={lienzo.acento} /> : null;
    const extras = <>{menuEl}{cajonEl}{panelEl}{windowEl}</>;
    const engranaje = <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Settings2} etiqueta="Ajustes del lanzador" onClick={() => setPanel(true)} />;

    const vacio = coleccion.length === 0;
    // Escribir en cualquier parte del lanzador busca: «/» enfoca el buscador y una letra empieza la
    // búsqueda (donde no hay buscador —micro, s— abre el cajón, que trae el suyo).
    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
        const esLetra = e.key.length === 1 && /[\p{L}\p{N}]/u.test(e.key);
        if (e.key !== "/" && !esLetra) return;
        if (!refBuscar.current) { e.preventDefault(); setCajon(true); return; }
        e.preventDefault();
        if (esLetra) setQ((prev) => prev + e.key);
        refBuscar.current.focus();
    };
    const raizProps = { lienzo, refRaiz: ref, etiqueta: `Lanzador: ${nombre}`, tipo: "APP_LAUNCHER", onKeyDown: alTeclear };

    if (vacio) {
        return (
            <RaizE {...raizProps}>
                <VacioE lienzo={lienzo} icono={LayoutGrid} titulo="Este lanzador está vacío" texto="Elige una colección o añade tus apps desde los ajustes." compacto={base === "micro" || base === "s"}>
                    <BotonE lienzo={lienzo} variante="primario" icono={Settings2} onClick={() => setPanel(true)}>Elegir apps</BotonE>
                </VacioE>
                {extras}
            </RaizE>
        );
    }

    // ── Una sola app (variante «single») ──
    if (ajustes.variant === "single") {
        const app = coleccion[0];
        const grande = Math.max(48, Math.min(120, Math.min(lienzo.ancho || 160, lienzo.alto || 160) * 0.5));
        return (
            <RaizE {...raizProps}>
                <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
                    <button type="button" onClick={() => abrir(app)} onContextMenu={(e) => { e.preventDefault(); abrirMenu(app, e.clientX, e.clientY); }}
                        aria-label={`Abrir ${app.name}`} title={app.description}
                        className="cursor-pointer rounded-[30%] outline-none transition-transform duration-200 hover:-translate-y-1 active:scale-95 focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}>
                        <IconoAplicacion app={app} lado={grande} forma={ajustes.iconShape ?? "squircle"} estilo={ajustes.iconStyle ?? "glass"} />
                    </button>
                    {base !== "micro" && <span className="max-w-full truncate text-[13px] font-semibold text-white/90">{app.name}</span>}
                    {(base === "l" || base === "xl") && <span className="line-clamp-2 max-w-[34ch] text-center text-[12px] text-white/60">{app.description}</span>}
                    {abriendo === app.id && <Loader2 aria-label="Abriendo" className="size-4 animate-spin text-white/60" />}
                </div>
                {extras}
            </RaizE>
        );
    }

    // ── micro: un glifo que abre el cajón ──
    if (base === "micro") {
        return (
            <RaizE {...raizProps}>
                <button type="button" onClick={() => setCajon(true)} aria-label={`${nombre}: ${coleccion.length} apps`} title={`${nombre} · ${coleccion.length} apps`}
                    className="ss-redondo relative m-auto grid aspect-square h-[min(72%,calc(100%-16px))] max-h-20 cursor-pointer place-items-center rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2"
                    style={{ background: `radial-gradient(closest-side, ${conAlfa(lienzo.acento, 0.35)}, ${conAlfa(lienzo.acento, 0.06)})`, ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}>
                    <span className="grid grid-cols-2 gap-1" aria-hidden>
                        {ordenadas.slice(0, 4).map((a) => <span key={a.id} className="size-2.5 rounded-[4px]" style={{ background: a.accent, boxShadow: `0 0 6px ${conAlfa(a.accent, 0.7)}` }} />)}
                    </span>
                    <span className="absolute -right-3 bottom-0 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold leading-[14px] tabular-nums text-white/85">{coleccion.length}</span>
                </button>
                {extras}
            </RaizE>
        );
    }

    // ── s: cuatro teselas (la cuarta abre el cajón si hay más) ──
    if (base === "s") {
        const hay = ordenadas.length > 4;
        return (
            <RaizE {...raizProps}>
                <div className="flex h-full items-center justify-center p-1">
                    <RejillaApps apps={ordenadas.slice(0, hay ? 3 : 4)} columnas={2} lado={lado} lienzo={lienzo} ajustes={{ ...ajustes, showLabels: false }}
                        fijadas={local.fijadas} conTodas={hay} totalTodas={ordenadas.length} alAbrir={abrir} alMenu={abrirMenu}
                        alEnfocar={setEnfocada} alTodas={() => setCajon(true)} etiqueta={nombre} />
                </div>
                {extras}
            </RaizE>
        );
    }

    // ── torre: buscador + lista ──
    if (clase === "torre") {
        return (
            <RaizE {...raizProps}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1"><Buscador valor={q} onCambio={setQ} lienzo={lienzo} refInput={refBuscar} onIntro={() => resultados[0] && abrir(resultados[0])} onBajar={() => primera.current?.focus()} /></div>
                        {engranaje}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
                        {conjunto.length === 0
                            ? <p role="status" className="py-6 text-center text-[12px] text-white/55">Nada coincide con «{q}».</p>
                            : <RejillaApps apps={conjunto} fila columnas={1} lado={Math.min(lado, 40)} lienzo={lienzo} ajustes={ajustes} fijadas={local.fijadas} conTodas={false} totalTodas={0}
                                alAbrir={abrir} alMenu={abrirMenu} alEnfocar={setEnfocada} alTodas={() => setCajon(true)} etiqueta={nombre} refPrimera={primera} />}
                    </div>
                </div>
                {extras}
            </RaizE>
        );
    }

    // ── panorámico: el dock ──
    if (horizontal) {
        const anchoBuscador = (lienzo.ancho || 0) >= 560 ? 220 : 0;
        const disponible = Math.max(0, (lienzo.ancho || 900) - anchoBuscador - 16 - 40);
        const { columnas } = rejillaPara(disponible, altoTesela, anchoTesela, 6, { columnas: 8, filas: 1 });
        const cols = ajustes.columns && ajustes.columns > 0 ? ajustes.columns : columnas;
        const lista = buscando ? resultados : ordenadas;
        const caben = lista.length > cols ? cols - 1 : cols;
        return (
            <RaizE {...raizProps}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    {anchoBuscador > 0 ? (
                        <div className="flex shrink-0 flex-col gap-1.5" style={{ width: anchoBuscador }}>
                            <div className="flex items-center gap-1.5 text-white/70">
                                <LayoutGrid aria-hidden className="size-4" style={{ color: tintaE(lienzo.acento) }} />
                                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em]" title={nombre}>{nombre}</span>
                                <span className="flex-1" />
                                {engranaje}
                            </div>
                            <Buscador valor={q} onCambio={setQ} lienzo={lienzo} refInput={refBuscar} onIntro={() => resultados[0] && abrir(resultados[0])} onBajar={() => primera.current?.focus()} />
                        </div>
                    ) : (
                        <BotonE lienzo={lienzo} variante="suave" icono={Search} etiqueta="Buscar apps" onClick={() => setCajon(true)} />
                    )}
                    <div className="min-w-0 flex-1">
                        {lista.length === 0 ? (
                            <p role="status" className="text-center text-[12px] text-white/55">Ninguna app coincide con «{q}». <button type="button" className="cursor-pointer underline" onClick={() => setQ("")}>Ver todas</button></p>
                        ) : (
                            <RejillaApps apps={lista.slice(0, Math.max(1, caben))} columnas={cols} lado={lado} lienzo={lienzo} ajustes={ajustes} fijadas={local.fijadas}
                                conTodas={lista.length > caben} totalTodas={ordenadas.length} alAbrir={abrir} alMenu={abrirMenu} alEnfocar={setEnfocada}
                                alTodas={() => setCajon(true)} etiqueta={nombre} refPrimera={primera} />
                        )}
                    </div>
                </div>
                {extras}
            </RaizE>
        );
    }

    // ── m / l / xl: buscador + (pestañas) + rejilla que se ajusta a la caja ──
    const grande = base === "l" || base === "xl";
    const categorias = Array.from(new Set(ordenadas.map((a) => a.category)));
    const pestanas = [
        { id: "inicio", etiqueta: "Inicio" },
        ...(fijadasApps.length ? [{ id: "fijadas", etiqueta: "Fijadas", cuenta: fijadasApps.length }] : []),
        ...(recientesApps.length ? [{ id: "recientes", etiqueta: "Recientes", cuenta: recientesApps.length }] : []),
        ...(ajustes.grouped || base === "xl" ? categorias.map((c) => ({ id: c, etiqueta: nombreCategoria(c) })) : []),
    ];
    const altoCabecera = (lienzo.tactil ? 44 : 32) + (grande ? (lienzo.tactil ? 52 : 36) : 0) + 12 + (base === "xl" ? 26 : 0);
    const { columnas, filas } = rejillaPara((lienzo.ancho || 0) - 8, (lienzo.alto || 0) - altoCabecera, anchoTesela, 6, { columnas: grande ? 5 : 4, filas: grande ? 3 : 2 });
    const cols = ajustes.columns && ajustes.columns > 0 ? ajustes.columns : columnas;
    const capacidad = Math.max(1, cols * filas);
    const caben = conjunto.length > capacidad ? capacidad - 1 : capacidad;

    return (
        <RaizE {...raizProps}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1"><Buscador valor={q} onCambio={(v) => { setQ(v); }} lienzo={lienzo} refInput={refBuscar} onIntro={() => resultados[0] && abrir(resultados[0])} onBajar={() => primera.current?.focus()} /></div>
                    {engranaje}
                </div>
                {grande && !buscando && pestanas.length > 1 && (
                    <PestanasE lienzo={lienzo} etiqueta="Vistas del lanzador" valor={vista} onCambio={setVista} opciones={pestanas} />
                )}
                <div className="min-h-0 flex-1 overflow-hidden">
                    {conjunto.length === 0 ? (
                        <p role="status" className="py-4 text-center text-[12px] text-white/55">
                            {buscando ? <>Ninguna app coincide con «{q}».</> : vista === "fijadas" ? "Aún no has fijado apps: mantén pulsada una o usa su menú." : "Todavía no has abierto ninguna desde aquí."}
                        </p>
                    ) : (
                        <RejillaApps apps={conjunto.slice(0, caben)} columnas={cols} lado={lado} lienzo={lienzo} ajustes={ajustes} fijadas={local.fijadas}
                            conTodas={conjunto.length > caben} totalTodas={ordenadas.length} alAbrir={abrir} alMenu={abrirMenu} alEnfocar={setEnfocada}
                            alTodas={() => setCajon(true)} etiqueta={nombre} refPrimera={primera} />
                    )}
                </div>
                {base === "xl" && (
                    <p className="line-clamp-1 shrink-0 px-1 text-[12px] text-white/55" aria-live="polite">
                        {enfocada ? <><b className="font-semibold text-white/85">{enfocada.name}</b> · {enfocada.description}</> : "Flechas para moverte · Intro para abrir · menú con clic derecho o pulsación larga"}
                    </p>
                )}
            </div>
            {extras}
        </RaizE>
    );
}
