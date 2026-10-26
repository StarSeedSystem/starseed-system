"use client";

/**
 * Controles del diseño de UN icono (Ola 1025U · V1b): forma, fondo, glifo, color, tamaño, brillo y borde.
 * Puro de presentación: recibe el diseño y avisa de cada cambio con una `clave` para que el historial
 * funda las ráfagas (arrastrar un deslizador = un solo paso de «Deshacer»). Todo mide ≥ 44 px de alto.
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    ETIQUETA_FORMA,
    FORMAS_ICONO,
    LIMITES,
    TINTE_DE_COLOR_DOCK,
    normalizarColor,
    type DisenoIcono,
    type FondoIcono,
    type FormaIcono,
} from "@/lib/dock/iconos/modelo";
import { teselaDataUrl } from "@/lib/dock/iconos/render-svg";
import { sanearSvg } from "@/lib/dock/iconos/sanear-svg";
import { reducirAPng } from "@/lib/dock/iconos/imagen";
import { CLAVES_GLIFOS, GLIFOS_LUCIDE } from "./glifos-lucide";
import { SelectorImagen } from "./selector-imagen";

export type AlCambiarDiseno = (nuevo: DisenoIcono, clave: string) => void;

interface Props {
    diseno: DisenoIcono;
    alCambiar: AlCambiarDiseno;
}

/* ─────────────────────────── Piezas pequeñas ─────────────────────────── */

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
    return (
        <fieldset className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200/80">{titulo}</legend>
            {children}
        </fieldset>
    );
}

function Segmentos<T extends string>({ etiqueta, valor, opciones, alElegir }: {
    etiqueta: string;
    valor: T;
    opciones: ReadonlyArray<{ id: T; texto: string }>;
    alElegir: (id: T) => void;
}) {
    return (
        <div role="group" aria-label={etiqueta} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-black/25 p-1 ring-1 ring-white/10">
            {opciones.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    aria-pressed={valor === o.id}
                    onClick={() => alElegir(o.id)}
                    className={cn(
                        "min-h-11 cursor-pointer rounded-full px-2 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                        valor === o.id ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                    )}
                >
                    {o.texto}
                </button>
            ))}
        </div>
    );
}

function Deslizador({ etiqueta, valor, min, max, paso, formato, alCambiar }: {
    etiqueta: string;
    valor: number;
    min: number;
    max: number;
    paso: number;
    formato: (v: number) => string;
    alCambiar: (v: number) => void;
}) {
    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/85">{etiqueta}</span>
                <span className="tabular-nums text-muted-foreground" aria-hidden>{formato(valor)}</span>
            </div>
            <Slider
                aria-label={etiqueta}
                className="h-11 cursor-pointer"
                min={min}
                max={max}
                step={paso}
                value={[valor]}
                getAriaValueText={formato}
                onValueChange={([v]) => alCambiar(v)}
            />
        </div>
    );
}

function CampoColor({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: string; alCambiar: (hex: string) => void }) {
    const id = useId();
    const base = valor.length >= 7 ? valor.slice(0, 7) : "#ffffff";
    return (
        <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor={id} className="text-xs text-foreground/85">{etiqueta}</label>
            <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground" aria-hidden>{base}</span>
                <input
                    id={id}
                    type="color"
                    value={base}
                    onChange={(e) => alCambiar(normalizarColor(e.target.value, base))}
                    className="size-11 cursor-pointer rounded-xl border border-white/15 bg-transparent p-1"
                />
            </span>
        </div>
    );
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/* ─────────────────────────── Forma ─────────────────────────── */

function SeccionForma({ diseno, alCambiar }: Props) {
    return (
        <Seccion titulo="Forma">
            <div role="group" aria-label="Forma del icono" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {FORMAS_ICONO.map((f: FormaIcono) => {
                    const muestra = teselaDataUrl({ ...diseno, forma: f, fondo: { tipo: "color", color: "#94a3b8" }, borde: undefined });
                    return (
                        <button
                            key={f}
                            type="button"
                            aria-pressed={diseno.forma === f}
                            aria-label={ETIQUETA_FORMA[f]}
                            title={ETIQUETA_FORMA[f]}
                            onClick={() => alCambiar({ ...diseno, forma: f }, "forma")}
                            className={cn(
                                "grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-xl p-1.5 transition-transform duration-150 motion-reduce:transition-none",
                                "ring-1 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                                diseno.forma === f ? "bg-cyan-400/15 ring-cyan-300/60" : "bg-white/[0.04] ring-white/10",
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={muestra} alt="" draggable={false} className="size-8" />
                        </button>
                    );
                })}
            </div>
        </Seccion>
    );
}

/* ─────────────────────────── Fondo ─────────────────────────── */

type TipoFondo = FondoIcono["tipo"];

function fondoNuevo(tipo: TipoFondo, d: DisenoIcono): FondoIcono {
    const f = d.fondo;
    const tinte = f.tipo === "cristal" ? f.tinte : f.tipo === "color" ? f.color : f.tipo === "degradado" ? f.desde : TINTE_DE_COLOR_DOCK.cyan;
    const base = tinte.length >= 7 ? tinte.slice(0, 7) : "#22d3ee";
    switch (tipo) {
        case "cristal": return { tipo: "cristal", tinte: base, intensidad: 0.55 };
        case "color": return { tipo: "color", color: base };
        case "degradado": return { tipo: "degradado", desde: base, hasta: "#0b1220", angulo: 135 };
        default: return { tipo: "ninguno" };
    }
}

function SeccionFondo({ diseno, alCambiar }: Props) {
    const f = diseno.fondo;
    const poner = (nuevo: FondoIcono, clave: string) => alCambiar({ ...diseno, fondo: nuevo }, clave);
    return (
        <Seccion titulo="Fondo">
            <Segmentos<TipoFondo>
                etiqueta="Tipo de fondo"
                valor={f.tipo}
                opciones={[{ id: "cristal", texto: "Cristal" }, { id: "color", texto: "Color" }, { id: "degradado", texto: "Degradado" }, { id: "ninguno", texto: "Sin fondo" }]}
                alElegir={(t) => t !== f.tipo && poner(fondoNuevo(t, diseno), `fondo-tipo`)}
            />
            {f.tipo === "cristal" && (
                <>
                    <CampoColor etiqueta="Tinte del cristal" valor={f.tinte} alCambiar={(c) => poner({ ...f, tinte: c }, "fondo-color")} />
                    <Deslizador etiqueta="Intensidad del cristal" valor={f.intensidad} min={0} max={1} paso={0.01} formato={pct} alCambiar={(v) => poner({ ...f, intensidad: v }, "fondo-intensidad")} />
                </>
            )}
            {f.tipo === "color" && <CampoColor etiqueta="Color de fondo" valor={f.color} alCambiar={(c) => poner({ ...f, color: c }, "fondo-color")} />}
            {f.tipo === "degradado" && (
                <>
                    <CampoColor etiqueta="Color inicial" valor={f.desde} alCambiar={(c) => poner({ ...f, desde: c }, "fondo-desde")} />
                    <CampoColor etiqueta="Color final" valor={f.hasta} alCambiar={(c) => poner({ ...f, hasta: c }, "fondo-hasta")} />
                    <Deslizador etiqueta="Ángulo del degradado" valor={f.angulo} min={0} max={360} paso={5} formato={(v) => `${Math.round(v)}°`} alCambiar={(v) => poner({ ...f, angulo: v }, "fondo-angulo")} />
                </>
            )}
        </Seccion>
    );
}

/* ─────────────────────────── Glifo ─────────────────────────── */

type TipoGlifo = "auto" | "lucide" | "svg" | "imagen";

function tipoGlifoDe(d: DisenoIcono): TipoGlifo {
    const g = d.glifo;
    return g.tipo === "lucide" ? (g.clave === "auto" ? "auto" : "lucide") : g.tipo;
}

function SeccionGlifo({ diseno, alCambiar }: Props) {
    const real = tipoGlifoDe(diseno);
    const [modo, setModo] = useState<TipoGlifo>(real);
    // si el dibujo cambia desde fuera (deshacer, una variación de la IA…), el selector lo sigue
    useEffect(() => setModo(real), [real]);
    const [busqueda, setBusqueda] = useState("");
    const [textoSvg, setTextoSvg] = useState("");
    const [avisoSvg, setAvisoSvg] = useState<{ ok: boolean; texto: string } | null>(null);
    const [procesando, setProcesando] = useState(false);
    const idBusqueda = useId();
    const idSvg = useId();

    const claves = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return q ? CLAVES_GLIFOS.filter((c) => c.toLowerCase().includes(q)) : CLAVES_GLIFOS;
    }, [busqueda]);

    const usarSvg = () => {
        const r = sanearSvg(textoSvg);
        if (!r.ok) { setAvisoSvg({ ok: false, texto: r.motivos[0] ?? "Ese dibujo no se puede usar." }); return; }
        alCambiar({ ...diseno, glifo: { tipo: "svg", svg: r.svg } }, "glifo-svg");
        setAvisoSvg({ ok: true, texto: r.quitados ? `Listo. El filtro de seguridad quitó ${r.quitados} elemento(s) o atributo(s) no permitidos.` : "Listo: dibujo aplicado." });
    };

    const usarImagen = async (blob: Blob) => {
        setProcesando(true);
        try {
            const png = await reducirAPng(blob);
            if (!png) { toast.error("No pude convertir esa imagen en un icono", { description: "Prueba con otra imagen o con una más pequeña." }); return; }
            alCambiar({ ...diseno, glifo: { tipo: "imagen", src: png } }, "glifo-imagen");
        } finally { setProcesando(false); }
    };

    return (
        <Seccion titulo="Dibujo del icono">
            <Segmentos<TipoGlifo>
                etiqueta="Qué dibujo lleva"
                valor={modo}
                opciones={[{ id: "auto", texto: "El suyo" }, { id: "lucide", texto: "Otro icono" }, { id: "svg", texto: "Dibujo SVG" }, { id: "imagen", texto: "Imagen" }]}
                alElegir={(m) => {
                    setModo(m);
                    if (m === "auto") alCambiar({ ...diseno, glifo: { tipo: "lucide", clave: "auto" } }, "glifo-auto");
                }}
            />
            {modo === "auto" && <p className="text-xs text-muted-foreground">Cada icono conserva su dibujo de siempre; solo cambia el vestido.</p>}
            {modo === "lucide" && (
                <div className="space-y-2">
                    <label htmlFor={idBusqueda} className="sr-only">Buscar un icono</label>
                    <Input id={idBusqueda} type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un icono (heart, star, moon…)" className="h-11 cursor-text" />
                    <ul aria-label="Iconos disponibles" className="grid max-h-48 grid-cols-5 gap-1.5 overflow-y-auto sm:grid-cols-8">
                        {claves.map((c) => {
                            const Icono = GLIFOS_LUCIDE[c];
                            const activo = diseno.glifo.tipo === "lucide" && diseno.glifo.clave === c;
                            return (
                                <li key={c}>
                                    <button
                                        type="button"
                                        aria-label={c}
                                        title={c}
                                        aria-pressed={activo}
                                        onClick={() => alCambiar({ ...diseno, glifo: { tipo: "lucide", clave: c } }, "glifo-lucide")}
                                        className={cn(
                                            "grid size-11 cursor-pointer place-items-center rounded-xl ring-1 transition-colors duration-150 motion-reduce:transition-none",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                                            activo ? "bg-cyan-400/20 ring-cyan-300/60 text-cyan-100" : "bg-white/[0.04] ring-white/10 text-foreground/80 hover:bg-white/10",
                                        )}
                                    >
                                        <Icono className="size-5" />
                                    </button>
                                </li>
                            );
                        })}
                        {claves.length === 0 && <li className="col-span-full py-3 text-center text-xs text-muted-foreground">Ningún icono se llama así. Prueba en inglés (por ejemplo «moon»).</li>}
                    </ul>
                </div>
            )}
            {modo === "svg" && (
                <div className="space-y-2">
                    <label htmlFor={idSvg} className="text-xs text-foreground/85">Pega un dibujo SVG</label>
                    <Textarea id={idSvg} value={textoSvg} onChange={(e) => setTextoSvg(e.target.value)} rows={5} spellCheck={false} placeholder='<svg viewBox="0 0 64 64">…</svg>' className="cursor-text font-mono text-xs" />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" onClick={usarSvg} disabled={!textoSvg.trim()} className="cursor-pointer"><Check aria-hidden /> Usar este dibujo</Button>
                        <p className="text-[11px] text-muted-foreground">Se filtra por seguridad: sin scripts, enlaces, imágenes externas ni filtros.</p>
                    </div>
                    {avisoSvg && <p role="status" className={cn("text-xs", avisoSvg.ok ? "text-emerald-300" : "text-red-300")}>{avisoSvg.texto}</p>}
                </div>
            )}
            {modo === "imagen" && (
                <div className="space-y-2">
                    <SelectorImagen alElegir={({ blob }) => usarImagen(blob)} ocupado={procesando} />
                    <p className="text-[11px] text-muted-foreground">La imagen se reduce a un icono pequeño que viaja con tu perfil. {procesando && <Loader2 className="inline size-3 animate-spin" aria-hidden />}</p>
                </div>
            )}
        </Seccion>
    );
}

/* ─────────────────────────── Color, tamaño, brillo y borde ─────────────────────────── */

function SeccionAspecto({ diseno, alCambiar }: Props) {
    const b = diseno.borde;
    return (
        <>
            <Seccion titulo="Color y brillo">
                <CampoColor etiqueta="Color del dibujo" valor={diseno.colorGlifo} alCambiar={(c) => alCambiar({ ...diseno, colorGlifo: c }, "color-glifo")} />
                <Deslizador etiqueta="Tamaño del dibujo" valor={diseno.escala} min={LIMITES.escalaMin} max={LIMITES.escalaMax} paso={0.01} formato={pct} alCambiar={(v) => alCambiar({ ...diseno, escala: v }, "escala")} />
                <Deslizador etiqueta="Brillo" valor={diseno.brillo} min={0} max={1} paso={0.01} formato={pct} alCambiar={(v) => alCambiar({ ...diseno, brillo: v }, "brillo")} />
            </Seccion>
            <Seccion titulo="Borde">
                <Deslizador
                    etiqueta="Grosor del borde"
                    valor={b?.ancho ?? 0}
                    min={0}
                    max={LIMITES.bordeMax}
                    paso={0.2}
                    formato={(v) => (v <= 0 ? "Sin borde" : `${v.toFixed(1)}`)}
                    alCambiar={(v) => alCambiar(v <= 0 ? { ...diseno, borde: undefined } : { ...diseno, borde: { color: b?.color ?? "#ffffff", ancho: v } }, "borde-ancho")}
                />
                {b && <CampoColor etiqueta="Color del borde" valor={b.color} alCambiar={(c) => alCambiar({ ...diseno, borde: { ...b, color: c } }, "borde-color")} />}
            </Seccion>
        </>
    );
}

/* ─────────────────────────── Conjunto ─────────────────────────── */

export function ControlesDiseno({ diseno, alCambiar }: Props) {
    return (
        <div className="space-y-3">
            <SeccionForma diseno={diseno} alCambiar={alCambiar} />
            <SeccionFondo diseno={diseno} alCambiar={alCambiar} />
            <SeccionGlifo diseno={diseno} alCambiar={alCambiar} />
            <SeccionAspecto diseno={diseno} alCambiar={alCambiar} />
        </div>
    );
}
