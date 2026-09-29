'use client';

// ════════════════════════════════════════════════════════════════
// SerendipityLensWidget — Lente de Serendipia (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Un descubrimiento al día, REAL y del propio OS: una app del
// lanzador o un paquete de la Biblioteca (widgets, diseños, fuentes
// de IA, habilidades, agentes…) que quizá no conoces. La lente decide
// cuánto se aleja de lo tuyo («cercano» comparte etiquetas con lo que
// tienes instalado; «inesperado», nada). Se abre a un toque, se guarda
// en tu Biblioteca, se descarta («ya lo conozco», no vuelve) o se
// baraja. Abajo, el cielo real de hoy (fase y signo de la Luna).
// El catálogo de la Biblioteca se carga a demanda (sin red: es código
// del OS). Estados honestos: cargando (catálogo), vacío (ya lo has
// visto todo: se ofrece empezar de nuevo) y error (catálogo ilegible).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import {
    AppWindow, BookmarkPlus, Bot, Brain, BrainCircuit, Check, Compass, Eye, EyeOff, FlaskConical, Gem, Globe, Layers, LayoutGrid,
    Leaf, Orbit, Package, Palette, PenSquare, Radio, RotateCcw, Shuffle, Sparkles, Wand2, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { saveResource } from "@/lib/library-store";
import { faseLunar, signosDelCielo, COLOR_ELEMENTO } from "@/lib/astro/cielo";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, Rot, VacioHonesto, tinta } from "./_catalogo/piezas";
import { RAREZAS, desdeApp, desdePaquete, elegirHallazgo, type Hallazgo, type PaqueteMin } from "./serendipity-lens-partes";
import { diaDe } from "./idea-forge-partes";

const ICONOS: Record<string, LucideIcon> = {
    Package, AppWindow, LayoutGrid, PenSquare, FlaskConical, Palette, Sparkles, Wand2, Brain, BrainCircuit, Zap, Gem, Layers, Leaf,
    Orbit, Radio, Globe, Bot, Workflow, Eye, Compass,
};
const ICONO_APP = new Map<string, LucideIcon>(APP_CATALOG.map((a) => [`app:${a.id}`, a.icon]));
function iconoDe(h: Hallazgo): LucideIcon {
    return ICONO_APP.get(h.id) ?? ICONOS[h.icono] ?? Package;
}

const CLAVE = "starseed.serendipia.v1";
interface Estado { vistos: string[]; rareza: number; guardados: string[] }
function leerEstado(): Estado {
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE) || "null");
        return { vistos: Array.isArray(j?.vistos) ? j.vistos.slice(-300) : [], rareza: typeof j?.rareza === "number" ? j.rareza : 0.5, guardados: Array.isArray(j?.guardados) ? j.guardados.slice(-300) : [] };
    } catch { return { vistos: [], rareza: 0.5, guardados: [] }; }
}
function escribirEstado(e: Estado) {
    try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* almacén bloqueado: vale en memoria */ }
}

function Lente({ D, h, l }: { D: number; h: Hallazgo | null; l: EstadoLienzo }) {
    const id = useIdSvg("lente");
    const c = D / 2;
    const color = h?.color ?? l.acento;
    const Icono = h ? iconoDe(h) : Compass;
    const tonos = [l.acento, "#f472b6", "#b69cff", "#22d3ee", "#39ff14", "#FFBF00"];
    return (
        <div className="relative shrink-0" style={{ width: D, height: D }}>
            <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="absolute inset-0 overflow-visible">
                <defs>
                    <radialGradient id={`${id}-v`} cx="38%" cy="32%" r="70%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
                        <stop offset="45%" stopColor={color} stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#0c0e22" stopOpacity={0.55} />
                    </radialGradient>
                </defs>
                {/* anillo prismático: seis arcos de luz que giran muy despacio */}
                <g className={l.animar ? "ss-girar" : undefined} style={{ ["--ss-dur" as string]: "120s", transformOrigin: `${c}px ${c}px` }}>
                    {tonos.map((t, i) => {
                        const a0 = (i / 6) * Math.PI * 2 + 0.08, a1 = ((i + 1) / 6) * Math.PI * 2 - 0.08, r = D * 0.46;
                        const p = (a: number) => `${(c + Math.cos(a) * r).toFixed(2)} ${(c + Math.sin(a) * r).toFixed(2)}`;
                        return <path key={i} d={`M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}`} fill="none" stroke={t} strokeOpacity={0.55} strokeWidth={Math.max(2, D * 0.022)} strokeLinecap="round" />;
                    })}
                </g>
                {/* facetas de caleidoscopio */}
                <g className={l.animar ? "ss-contragirar" : undefined} style={{ ["--ss-dur" as string]: "90s", transformOrigin: `${c}px ${c}px` }}>
                    {Array.from({ length: 6 }, (_, i) => {
                        const a = (i / 6) * Math.PI * 2, r = D * 0.4;
                        return <path key={i} d={`M${c} ${c}L${c + Math.cos(a) * r} ${c + Math.sin(a) * r}L${c + Math.cos(a + 0.5) * r * 0.82} ${c + Math.sin(a + 0.5) * r * 0.82}Z`} fill={tonos[i]} opacity={0.05} />;
                    })}
                </g>
                <circle cx={c} cy={c} r={D * 0.38} fill={`url(#${id}-v)`} stroke="#fff" strokeOpacity={0.18} />
                {/* reflejo del cristal */}
                <path d={`M${c - D * 0.26} ${c - D * 0.12}A${D * 0.3} ${D * 0.3} 0 0 1 ${c - D * 0.06} ${c - D * 0.3}`} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={Math.max(1.5, D * 0.012)} strokeLinecap="round" />
            </svg>
            <span aria-hidden className="absolute inset-0 grid place-items-center">
                <Icono style={{ width: D * 0.3, height: D * 0.3, color: tinta(color, 0.25), filter: l.nivel === "pleno" ? `drop-shadow(0 0 ${Math.round(D * 0.04)}px ${conAlfa(color, 0.8)})` : undefined }} strokeWidth={1.5} />
            </span>
        </div>
    );
}

export function SerendipityLensWidget() {
    const l = useLienzo("#fb923c", "#23d5ab");
    const [paquetes, setPaquetes] = React.useState<PaqueteMin[] | null>(null);
    const [instaladas, setInstaladas] = React.useState<Set<string>>(new Set());
    const [error, setError] = React.useState<unknown>(null);
    const [estado, setEstado] = React.useState<Estado>({ vistos: [], rareza: 0.5, guardados: [] });
    const [vuelta, setVuelta] = React.useState(0);

    const cargar = React.useCallback(() => {
        setError(null);
        // El catálogo de la Biblioteca es código del OS (sin red): se carga a demanda para no pesar en el tablero.
        import("@/lib/library/packages").then((m) => {
            const todos = m.allPackages() as unknown as PaqueteMin[];
            const inst = m.getInstalledMap();
            const mias = new Set<string>();
            for (const p of todos) if (p.id in inst) for (const t of p.tags ?? []) mias.add(t.toLowerCase());
            setInstaladas(mias);
            setPaquetes(todos);
        }).catch((e) => setError(e ?? new Error("fallo")));
    }, []);
    React.useEffect(() => { setEstado(leerEstado()); cargar(); }, [cargar]);

    const hallazgos = React.useMemo(() => {
        if (!paquetes) return null;
        const apps = APP_CATALOG.map((a) => desdeApp(a as never, "AppWindow")).filter((h): h is Hallazgo => !!h);
        const pk = paquetes.map(desdePaquete).filter((h): h is Hallazgo => !!h);
        return [...apps, ...pk];
    }, [paquetes]);

    const dia = diaDe(Date.now());
    const vistos = React.useMemo(() => new Set(estado.vistos), [estado.vistos]);
    const h = hallazgos ? elegirHallazgo(hallazgos, dia, vuelta, vistos, estado.rareza, instaladas) : null;
    const guardado = !!h && estado.guardados.includes(h.id);

    const actualizar = (patch: Partial<Estado>) => setEstado((e) => { const n = { ...e, ...patch }; escribirEstado(n); return n; });
    const conocido = () => { if (h) actualizar({ vistos: [...estado.vistos, h.id] }); };
    const guardar = () => {
        if (!h || guardado) return;
        saveResource({ kind: h.origen === "app" ? "app" : "paquete", title: h.titulo, url: h.href ?? "/library?tab=destacado", origin: "Lente de Serendipia" });
        actualizar({ guardados: [...estado.guardados, h.id] });
    };
    const empezarDeNuevo = () => actualizar({ vistos: [] });

    const ahora = new Date();
    const luna = faseLunar(ahora);
    const signos = signosDelCielo(ahora);
    const cielo = `${luna.nombre} al ${Math.round(luna.iluminada * 100)} % en ${signos.luna.nombre}`;

    const etiqueta = h ? `Lente de serendipia: hoy descubres «${h.titulo}» (${h.tipo.toLowerCase()}). ${h.descripcion}` : "Lente de serendipia";
    const cargando = !hallazgos && !error;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Lente de Serendipia" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Lente D={l.lado - 12} h={h} l={l} /></div>
            </Lienzo>
        );
    }

    const abrir = h && (h.href
        ? <Accion color={h.color} solida alto={l.toque} href={h.externo ? undefined : h.href} onClick={h.externo ? () => window.open(h.href!, "_blank", "noopener,noreferrer") : undefined} icono={Sparkles} etiqueta={`Abrir ${h.titulo}`}>Abrir</Accion>
        : <Accion color={h.color} solida alto={l.toque} href="/library?tab=destacado" icono={Sparkles} etiqueta={`Ver ${h.titulo} en la Biblioteca`}>Ver</Accion>);
    const compactas = l.base === "l" && !l.horizontal;
    const barajar = <Accion color={l.acento} alto={l.toque} icono={Shuffle} onClick={() => setVuelta((v) => v + 1)} soloIcono={l.base === "s" || compactas} etiqueta="Otro hallazgo">Otro</Accion>;

    const cuerpo = (() => {
        if (error) return <ErrorHonesto error={error} color={l.acento} onReintentar={cargar} compacto={l.base === "s"} />;
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando el catálogo del OS…" />;
        if (!h) {
            return (
                <VacioHonesto icono={Eye} color={l.acento} compacto={l.base === "s"} titulo="Ya lo has visto todo"
                    ayuda="Marcaste como conocido cada hallazgo del catálogo (lista vacía). Puedes volver a empezar."
                    accion={<Accion color={l.acento} alto={l.toque} icono={RotateCcw} onClick={empezarDeNuevo}>Empezar de nuevo</Accion>} />
            );
        }
        return null;
    })();

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Lente de Serendipia" etiqueta={etiqueta} sinCabecera>
                {cuerpo ?? (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5">
                        <Lente D={Math.max(64, Math.min(l.ancho - 24, l.alto - 48))} h={h} l={l} />
                        <p className="max-w-full truncate text-[12px] font-medium text-white/85" title={h!.titulo}>{h!.titulo}</p>
                    </div>
                )}
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.1;
    const cab = 52;
    const D = fila ? Math.max(84, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.24 : 0.36))) : Math.max(84, Math.min(l.ancho * 0.5, (l.alto - cab) * 0.36));

    const ficha = h && (
        <div className="min-w-0">
            <Rot color={tinta(h.color, 0.25)} className="whitespace-normal">{h.tipo} · {h.origen === "app" ? "del lanzador" : "de la Biblioteca"}</Rot>
            <p className="mt-0.5 truncate text-[16px] font-medium leading-tight text-white" title={h.titulo}>{h.titulo}</p>
            <p className={`mt-1 text-[12px] leading-snug text-white/65 ${l.base === "xl" ? "line-clamp-4" : "line-clamp-2"}`} title={h.descripcion}>{h.descripcion}</p>
        </div>
    );
    const acciones = h && (
        <div className="flex flex-wrap items-center gap-1.5">
            {abrir}
            {barajar}
            {grande && (
                <Accion color={l.acento2} alto={l.toque} icono={guardado ? Check : BookmarkPlus} onClick={guardar} pulsado={guardado} soloIcono={!l.horizontal && l.base !== "xl"}
                    etiqueta={guardado ? `${h.titulo} ya está en tu Biblioteca` : `Guardar ${h.titulo} en tu Biblioteca`}>{guardado ? "Guardado" : "Guardar"}</Accion>
            )}
            {grande && <Accion color="#ffffff" alto={l.toque} icono={EyeOff} onClick={conocido} soloIcono={!l.horizontal && l.base !== "xl"} etiqueta={`Ya conozco ${h.titulo}: no volver a mostrarlo`}>Ya lo conozco</Accion>}
        </div>
    );
    const rareza = l.base === "xl" && (
        <div role="radiogroup" aria-label="Rareza de la lente" className="flex flex-wrap items-center gap-1.5">
            <Rot className="w-full">Lente</Rot>
            {RAREZAS.map((r) => (
                <button key={r.valor} type="button" role="radio" aria-checked={estado.rareza === r.valor} onClick={() => actualizar({ rareza: r.valor })}
                    className="ss-redondo cursor-pointer rounded-full px-2.5 text-[11.5px] font-semibold transition-colors duration-200"
                    style={{ minHeight: Math.min(l.toque, 30), color: estado.rareza === r.valor ? "#fff" : "rgba(255,255,255,.6)", background: estado.rareza === r.valor ? conAlfa(l.acento, 0.28) : "transparent", boxShadow: `inset 0 0 0 1px ${conAlfa(l.acento, estado.rareza === r.valor ? 0.7 : 0.3)}` }}>
                    {r.texto}
                </button>
            ))}
        </div>
    );
    const lineaCielo = (grande || l.horizontal) && (
        <p className="truncate text-[11.5px] text-white/55" title={`Hoy en el cielo: ${cielo}`}>
            <span style={{ color: COLOR_ELEMENTO[signos.luna.elemento] }}>Hoy en el cielo</span> · {cielo}
        </p>
    );

    return (
        <Lienzo l={l} titulo="Lente de Serendipia" subtitulo={`Descubrimiento del día · ${RAREZAS.find((r) => r.valor === estado.rareza)?.texto.toLowerCase() ?? "equilibrado"}`} icono={Compass} etiqueta={etiqueta}>
            {cuerpo ?? (
                <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col items-center justify-center"}`}>
                    <Lente D={D} h={h} l={l} />
                    <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2.5 ${fila ? "" : "w-full"}`}>
                        {ficha}
                        {acciones}
                        {rareza}
                        {lineaCielo}
                    </div>
                </div>
            )}
        </Lienzo>
    );
}
