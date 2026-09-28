"use client";

/**
 * Editor tipo Word del mensaje (C4 · pestaña «Texto» y texto de los elementos del lienzo).
 *
 * contentEditable ESTRICTO: el navegador solo escribe letras; cada cambio se vuelve a leer con
 * `parsearDom` a la lista blanca de `DocRico` y todo el formato (negrita, color, títulos, listas…)
 * se aplica sobre el modelo con `doc-ops` y se repinta. Nunca se guarda HTML; pegar entra como texto.
 * Deshacer/rehacer los lleva el editor del mensaje (Ctrl+Z / Ctrl+Mayús+Z).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Code,
    Highlighter,
    Italic,
    Link2,
    List,
    ListChecks,
    ListOrdered,
    Minus,
    Quote,
    SquareCode,
    Strikethrough,
    Underline,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { docVacio, enlaceSeguro, estiloACss } from "@/lib/mensajeria/formato";
import { FUENTES_MENSAJE, type AlineacionBloque, type DocRico, type EstiloMensaje, type FuenteMensaje, type MarcaTexto } from "@/lib/mensajeria/formato-tipos";
import { aplicarRango, leerRango, normalizarDoc, parsearDom, pintarDoc, type RangoDoc } from "./doc-dom";
import {
    alinearBloques,
    alternarMarca,
    alternarTarea,
    colapsado,
    convertirBloques,
    fijarPropiedad,
    formatoEn,
    insertarSeparador,
    insertarTexto,
    lineasDe,
    ordenar,
    rangoPalabra,
    tipoDeBloque,
    todoTiene,
    type TipoBloqueEditor,
} from "./doc-ops";
import type { OpcionesCambio } from "./historial";
import { PALETA_RESALTADO, SelectorColor } from "./ui-rico";
import styles from "./rico.module.css";

const TAMANOS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64];

interface InfoSeleccion {
    marcas: MarcaTexto[];
    tipo: TipoBloqueEditor | "separador";
    alineacion: AlineacionBloque;
    color?: string;
    resaltado?: string;
    enlace?: string;
    fuente?: FuenteMensaje;
    tamano?: number;
}

const INFO_VACIA: InfoSeleccion = { marcas: [], tipo: "parrafo", alineacion: "izquierda" };

function finDelDoc(doc: DocRico): RangoDoc {
    const b = Math.max(0, doc.bloques.length - 1);
    const lineas = doc.bloques[b] ? lineasDe(doc.bloques[b]) : [];
    const item = Math.max(0, lineas.length - 1);
    const off = (lineas[item] ?? []).reduce((s, t) => s + t.texto.length, 0);
    const pos = { bloque: b, item, off };
    return { inicio: pos, fin: pos };
}

/** Rango del tramo bajo el cursor (para quitar un enlace entero). */
function rangoTramo(doc: DocRico, r: RangoDoc): RangoDoc {
    if (!colapsado(r)) return r;
    const { bloque, item, off } = r.inicio;
    const bl = doc.bloques[bloque];
    if (!bl) return r;
    const tramos = lineasDe(bl)[item] ?? [];
    let pos = 0;
    for (const t of tramos) {
        const fin = pos + t.texto.length;
        if (off >= pos && off <= fin && t.enlace) return { inicio: { bloque, item, off: pos }, fin: { bloque, item, off: fin } };
        pos = fin;
    }
    return r;
}

/** «ejemplo.org» → «https://ejemplo.org». */
export function normalizarEnlace(v: string): string {
    const t = v.trim();
    if (!t) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("/")) return t;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `mailto:${t}`;
    return `https://${t}`;
}

function BotonBarra({
    etiqueta,
    activo,
    onAccion,
    children,
    disabled,
}: {
    etiqueta: string;
    activo?: boolean;
    onAccion: () => void;
    children: ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={etiqueta}
            title={etiqueta}
            aria-pressed={activo}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onAccion}
            className={cn(
                "flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[10px] text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-40",
                activo && "bg-[#7C5CFF]/25 text-white shadow-[inset_0_0_0_1px_#7C5CFF99]",
            )}
        >
            {children}
        </button>
    );
}

function Grupo({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-0.5 rounded-[12px] bg-white/[0.03] p-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">{children}</div>;
}

const CLASE_SELECT =
    "h-9 cursor-pointer rounded-[10px] border-0 bg-white/[0.05] px-2.5 text-[13px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] outline-none transition-colors duration-150 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#7C5CFF] [&>option]:bg-[#12142a]";

export interface EditorDocProps {
    doc: DocRico;
    onChange: (doc: DocRico, opciones?: OpcionesCambio) => void;
    onDeshacer?: () => void;
    onRehacer?: () => void;
    /** Estilo del mensaje (para escribir viendo la fuente, el tamaño y el color finales). */
    estiloBase?: EstiloMensaje | null;
    placeholder?: string;
    autoFocus?: boolean;
    /** Editor dentro de un panel pequeño (texto del lienzo). */
    compacto?: boolean;
    etiqueta?: string;
    className?: string;
    /** Estilo extra del área de escritura (fondo del lienzo, etc.). */
    estiloArea?: CSSProperties;
}

export function EditorDoc({
    doc,
    onChange,
    onDeshacer,
    onRehacer,
    estiloBase,
    placeholder = "Escribe tu mensaje…",
    autoFocus,
    compacto,
    etiqueta = "Texto del mensaje",
    className,
    estiloArea,
}: EditorDocProps) {
    const raizRef = useRef<HTMLDivElement>(null);
    const ultimoDoc = useRef<DocRico | null>(null);
    const rangoRef = useRef<RangoDoc | null>(null);
    const [info, setInfo] = useState<InfoSeleccion>(INFO_VACIA);
    const [vacio, setVacio] = useState(() => docVacio(doc));
    const [enlace, setEnlace] = useState({ abierto: false, texto: "", error: "" });

    const calcularInfo = useCallback((d: DocRico, r: RangoDoc | null) => {
        if (!r) return setInfo(INFO_VACIA);
        const o = ordenar(r);
        const bl = d.bloques[o.inicio.bloque];
        const fmt = formatoEn(d, colapsado(o) ? o.inicio : { ...o.inicio, off: o.inicio.off + 1 });
        const marcas = (["negrita", "cursiva", "subrayado", "tachado", "codigo"] as MarcaTexto[]).filter((m) =>
            colapsado(o) ? fmt.marcas.includes(m) : todoTiene(d, o, (f) => f.marcas.includes(m)),
        );
        setInfo({
            marcas,
            tipo: tipoDeBloque(bl),
            alineacion: (bl && (bl.tipo === "parrafo" || bl.tipo === "titulo") && bl.alineacion) || "izquierda",
            color: fmt.color,
            resaltado: fmt.resaltado,
            enlace: fmt.enlace,
            fuente: fmt.fuente,
            tamano: fmt.tamano,
        });
    }, []);

    // Documento externo (inicio, deshacer, rehacer): repintar conservando la selección si se puede.
    useLayoutEffect(() => {
        const raiz = raizRef.current;
        if (!raiz || doc === ultimoDoc.current) return;
        const normal = normalizarDoc(doc);
        pintarDoc(raiz, normal);
        ultimoDoc.current = doc;
        setVacio(docVacio(normal));
        if (rangoRef.current && raiz.ownerDocument.activeElement === raiz) aplicarRango(raiz, rangoRef.current);
    }, [doc]);

    useEffect(() => {
        if (autoFocus) {
            const raiz = raizRef.current;
            if (!raiz) return;
            raiz.focus({ preventScroll: true });
            const p = parsearDom(raiz);
            const fin = finDelDoc(p.doc);
            aplicarRango(raiz, fin, p);
            rangoRef.current = fin;
        }
        // Solo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Seguimos la selección mientras esté dentro del editor.
    useEffect(() => {
        let marco = 0;
        const alCambiar = () => {
            cancelAnimationFrame(marco);
            marco = requestAnimationFrame(() => {
                const raiz = raizRef.current;
                if (!raiz || raiz.ownerDocument.activeElement !== raiz) return;
                const p = parsearDom(raiz);
                const r = leerRango(raiz, p);
                if (r) {
                    rangoRef.current = r;
                    calcularInfo(p.doc, r);
                }
            });
        };
        document.addEventListener("selectionchange", alCambiar);
        return () => {
            cancelAnimationFrame(marco);
            document.removeEventListener("selectionchange", alCambiar);
        };
    }, [calcularInfo]);

    const emitir = useCallback(
        (nuevo: DocRico, opciones?: OpcionesCambio) => {
            ultimoDoc.current = nuevo;
            setVacio(docVacio(nuevo));
            onChange(nuevo, opciones);
        },
        [onChange],
    );

    /** Aplica una operación del modelo sobre la selección actual (o la última conocida) y repinta. */
    const operar = useCallback(
        (fn: (d: DocRico, r: RangoDoc) => DocRico | { doc: DocRico; rango?: RangoDoc }) => {
            const raiz = raizRef.current;
            if (!raiz) return;
            const p = parsearDom(raiz);
            const enfocado = raiz.ownerDocument.activeElement === raiz;
            const rango = (enfocado ? leerRango(raiz, p) : null) ?? rangoRef.current ?? finDelDoc(p.doc);
            const res = fn(p.doc, rango);
            const { doc: d2, rango: r2 } = "bloques" in res ? { doc: res, rango: rango } : { doc: res.doc, rango: res.rango ?? rango };
            const nuevo = normalizarDoc(d2);
            pintarDoc(raiz, nuevo);
            emitir(nuevo);
            raiz.focus({ preventScroll: true });
            aplicarRango(raiz, r2);
            rangoRef.current = r2;
            calcularInfo(nuevo, r2);
        },
        [calcularInfo, emitir],
    );

    const marca = (m: MarcaTexto) => {
        const raiz = raizRef.current;
        if (!raiz) return;
        const p = parsearDom(raiz);
        const r = (raiz.ownerDocument.activeElement === raiz ? leerRango(raiz, p) : null) ?? rangoRef.current;
        if (r && colapsado(r) && colapsado(rangoPalabra(p.doc, r.inicio)) && m !== "codigo") {
            // Sin palabra bajo el cursor: el estilo se aplica a lo que se escriba a continuación.
            const orden = { negrita: "bold", cursiva: "italic", subrayado: "underline", tachado: "strikeThrough", codigo: "" }[m];
            raiz.focus({ preventScroll: true });
            try {
                document.execCommand?.(orden);
            } catch {
                /* sin execCommand: no pasa nada */
            }
            setInfo((i) => ({ ...i, marcas: i.marcas.includes(m) ? i.marcas.filter((x) => x !== m) : [...i.marcas, m] }));
            return;
        }
        operar((d, rango) => alternarMarca(d, colapsado(rango) ? rangoPalabra(d, rango.inicio) : rango, m));
    };

    const propiedad = <K extends "color" | "resaltado" | "fuente" | "tamano">(prop: K, valor: string | number | undefined) =>
        operar((d, rango) => fijarPropiedad(d, colapsado(rango) ? rangoPalabra(d, rango.inicio) : rango, prop, valor as never));

    const bloque = (tipo: TipoBloqueEditor) => operar((d, rango) => convertirBloques(d, rango, tipo));
    const alinear = (al: AlineacionBloque) => operar((d, rango) => alinearBloques(d, rango, al));
    const separador = () =>
        operar((d, rango) => {
            const r = insertarSeparador(d, ordenar(rango).fin);
            return { doc: r.doc, rango: { inicio: r.pos, fin: r.pos } };
        });

    const aplicarEnlace = () => {
        const url = normalizarEnlace(enlace.texto);
        const seguro = enlaceSeguro(url);
        if (!seguro) {
            setEnlace((e) => ({ ...e, error: "Ese enlace no está permitido. Usa una dirección web (https://…), un correo o una ruta del OS que empiece por «/»." }));
            return;
        }
        setEnlace({ abierto: false, texto: "", error: "" });
        operar((d, rango) => {
            if (!colapsado(rango)) return fijarPropiedad(d, rango, "enlace", seguro);
            const palabra = rangoPalabra(d, rango.inicio);
            if (!colapsado(palabra)) return fijarPropiedad(d, palabra, "enlace", seguro);
            const ins = insertarTexto(d, rango.inicio, seguro.replace(/^mailto:/, ""), { marcas: [], enlace: seguro });
            return { doc: ins.doc, rango: { inicio: ins.rango.fin, fin: ins.rango.fin } };
        });
    };

    const quitarEnlace = () => {
        setEnlace({ abierto: false, texto: "", error: "" });
        operar((d, rango) => fijarPropiedad(d, rangoTramo(d, rango), "enlace", undefined));
    };

    const alternarTareaEn = (li: Element | null) => {
        const raiz = raizRef.current;
        if (!raiz) return;
        const p = parsearDom(raiz);
        let destino: { b: number; i: number } | null = null;
        p.bloques.forEach((bp, b) =>
            bp.lineas.forEach((l, i) => {
                if (li ? l.contenedores.includes(li) : false) destino = { b, i };
            }),
        );
        if (!destino && !li && rangoRef.current) destino = { b: rangoRef.current.inicio.bloque, i: rangoRef.current.inicio.item };
        if (!destino) return;
        const { b, i } = destino as { b: number; i: number };
        const nuevo = normalizarDoc(alternarTarea(p.doc, b, i));
        pintarDoc(raiz, nuevo);
        emitir(nuevo);
        if (rangoRef.current) aplicarRango(raiz, rangoRef.current);
    };

    const alEscribir = (e: React.FormEvent<HTMLDivElement>) => {
        const raiz = raizRef.current;
        if (!raiz) return;
        const tipo = (e.nativeEvent as InputEvent).inputType;
        if (tipo === "insertParagraph") {
            // Un ítem nuevo de tareas nace pendiente (el navegador copiaría «hecha» del anterior).
            const sel = document.getSelection();
            const nodo = sel?.anchorNode ?? null;
            const li = nodo ? (nodo.nodeType === 1 ? (nodo as Element) : nodo.parentElement)?.closest("ul[data-tareas] > li") : null;
            if (li && !(li.textContent ?? "").trim()) li.setAttribute("data-hecha", "0");
        }
        const p = parsearDom(raiz);
        emitir(p.doc, { agrupar: "escritura", ventana: 1200 });
        const r = leerRango(raiz, p);
        if (r) {
            rangoRef.current = r;
            calcularInfo(p.doc, r);
        }
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const mod = e.metaKey || e.ctrlKey;
        const k = e.key.toLowerCase();
        if (mod && !e.altKey) {
            if (k === "z" && !e.shiftKey) {
                e.preventDefault();
                onDeshacer?.();
                return;
            }
            if ((k === "z" && e.shiftKey) || k === "y") {
                e.preventDefault();
                onRehacer?.();
                return;
            }
            if (k === "b" || k === "i" || k === "u") {
                e.preventDefault();
                marca(k === "b" ? "negrita" : k === "i" ? "cursiva" : "subrayado");
                return;
            }
            if (k === "k") {
                e.preventDefault();
                setEnlace({ abierto: true, texto: info.enlace ?? "", error: "" });
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                alternarTareaEn(null);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey && !mod) {
            const sel = document.getSelection();
            const nodo = sel?.anchorNode ?? null;
            const enPre = nodo ? (nodo.nodeType === 1 ? (nodo as Element) : nodo.parentElement)?.closest("pre") : null;
            if (enPre && raizRef.current?.contains(enPre)) {
                e.preventDefault();
                try {
                    if (!document.execCommand?.("insertLineBreak")) document.execCommand?.("insertText", false, "\n");
                } catch {
                    /* noop */
                }
            }
        }
    };

    const alPegar = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const texto = e.clipboardData.getData("text/plain");
        if (!texto) return;
        let ok = false;
        try {
            ok = !!document.execCommand?.("insertText", false, texto);
        } catch {
            ok = false;
        }
        if (!ok) {
            operar((d, rango) => {
                const ins = insertarTexto(d, ordenar(rango).inicio, texto.replace(/\r?\n/g, " "), { marcas: [] });
                return { doc: ins.doc, rango: { inicio: ins.rango.fin, fin: ins.rango.fin } };
            });
        }
    };

    const alSoltar = (e: React.DragEvent<HTMLDivElement>) => {
        // Nada de HTML ni imágenes arrastradas: solo texto, y en el cursor.
        e.preventDefault();
        const texto = e.dataTransfer.getData("text/plain");
        if (!texto) return;
        try {
            document.execCommand?.("insertText", false, texto);
        } catch {
            /* noop */
        }
    };

    const alPulsar = (e: React.PointerEvent<HTMLDivElement>) => {
        const li = (e.target as HTMLElement).closest?.("li");
        if (!li || !li.parentElement?.hasAttribute("data-tareas")) return;
        const rect = li.getBoundingClientRect();
        const relleno = parseFloat(getComputedStyle(li).paddingLeft) || 26;
        if (e.clientX - rect.left <= relleno) {
            e.preventDefault();
            alternarTareaEn(li);
        }
    };

    const tipoParrafo = info.tipo.startsWith("titulo") ? info.tipo : "parrafo";
    const cssBase = estiloACss(estiloBase ? { fuente: estiloBase.fuente, tamano: estiloBase.tamano, color: estiloBase.color, alineacion: estiloBase.alineacion, negrita: estiloBase.negrita, cursiva: estiloBase.cursiva } : null);

    return (
        <div className={cn("flex min-h-0 flex-col gap-2.5", className)}>
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Formato del texto">
                <select
                    aria-label="Tipo de párrafo"
                    className={CLASE_SELECT}
                    value={tipoParrafo}
                    onChange={(e) => bloque(e.target.value as TipoBloqueEditor)}
                >
                    <option value="parrafo">Párrafo</option>
                    <option value="titulo1">Título 1</option>
                    <option value="titulo2">Título 2</option>
                    <option value="titulo3">Título 3</option>
                </select>
                <select aria-label="Fuente" className={CLASE_SELECT} value={info.fuente ?? ""} onChange={(e) => propiedad("fuente", e.target.value || undefined)}>
                    <option value="">Fuente del mensaje</option>
                    {FUENTES_MENSAJE.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.nombre}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Tamaño de letra"
                    className={CLASE_SELECT}
                    value={info.tamano ? String(info.tamano) : ""}
                    onChange={(e) => propiedad("tamano", e.target.value ? Number(e.target.value) : undefined)}
                >
                    <option value="">Tamaño normal</option>
                    {TAMANOS.map((t) => (
                        <option key={t} value={t}>
                            {t} px
                        </option>
                    ))}
                </select>
                <Grupo>
                    <BotonBarra etiqueta="Negrita (Ctrl+B)" activo={info.marcas.includes("negrita")} onAccion={() => marca("negrita")}>
                        <Bold className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Cursiva (Ctrl+I)" activo={info.marcas.includes("cursiva")} onAccion={() => marca("cursiva")}>
                        <Italic className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Subrayado (Ctrl+U)" activo={info.marcas.includes("subrayado")} onAccion={() => marca("subrayado")}>
                        <Underline className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Tachado" activo={info.marcas.includes("tachado")} onAccion={() => marca("tachado")}>
                        <Strikethrough className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Código en línea" activo={info.marcas.includes("codigo")} onAccion={() => marca("codigo")}>
                        <Code className="h-4 w-4" />
                    </BotonBarra>
                </Grupo>
                <Grupo>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-label="Color de texto"
                                title="Color de texto"
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex h-9 w-9 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[10px] text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
                            >
                                <Baseline className="h-4 w-4" />
                                <span className="h-[3px] w-4 rounded-full" style={{ background: info.color ?? "currentColor" }} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[min(300px,90vw)] z-[130] rounded-[18px] border-white/10 bg-[rgba(12,14,34,.94)] text-white backdrop-blur-xl">
                            <p className="mb-2 text-[13px] font-semibold">Color de texto</p>
                            <SelectorColor nombre="Color de texto" valor={info.color} onChange={(c) => propiedad("color", c)} etiquetaVacio="Automático" />
                        </PopoverContent>
                    </Popover>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-label="Resaltado"
                                title="Resaltado"
                                onMouseDown={(e) => e.preventDefault()}
                                className="flex h-9 w-9 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[10px] text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
                            >
                                <Highlighter className="h-4 w-4" />
                                <span className="h-[3px] w-4 rounded-full" style={{ background: info.resaltado ?? "transparent", boxShadow: info.resaltado ? undefined : "inset 0 0 0 1px rgba(255,255,255,.3)" }} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[min(300px,90vw)] z-[130] rounded-[18px] border-white/10 bg-[rgba(12,14,34,.94)] text-white backdrop-blur-xl">
                            <p className="mb-2 text-[13px] font-semibold">Resaltado</p>
                            <SelectorColor nombre="Resaltado" paleta={PALETA_RESALTADO} valor={info.resaltado} onChange={(c) => propiedad("resaltado", c)} etiquetaVacio="Sin resaltado" />
                        </PopoverContent>
                    </Popover>
                    <Popover open={enlace.abierto} onOpenChange={(abierto) => setEnlace({ abierto, texto: abierto ? (info.enlace ?? "") : "", error: "" })}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-label="Enlace (Ctrl+K)"
                                title="Enlace (Ctrl+K)"
                                aria-pressed={!!info.enlace}
                                onMouseDown={(e) => e.preventDefault()}
                                className={cn(
                                    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white",
                                    info.enlace && "bg-[#7C5CFF]/25 text-white shadow-[inset_0_0_0_1px_#7C5CFF99]",
                                )}
                            >
                                <Link2 className="h-4 w-4" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[min(340px,92vw)] z-[130] rounded-[18px] border-white/10 bg-[rgba(12,14,34,.94)] text-white backdrop-blur-xl">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    aplicarEnlace();
                                }}
                                className="space-y-2.5"
                            >
                                <label className="block text-[13px] font-semibold" htmlFor="enlace-mensaje">
                                    Enlace
                                </label>
                                <input
                                    id="enlace-mensaje"
                                    autoFocus
                                    value={enlace.texto}
                                    onChange={(e) => setEnlace((s) => ({ ...s, texto: e.target.value, error: "" }))}
                                    placeholder="https://… o /ruta del OS"
                                    inputMode="url"
                                    className="h-10 w-full rounded-[12px] border-0 bg-white/[0.06] px-3 text-[14px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-[#7C5CFF]"
                                />
                                {enlace.error && (
                                    <p role="alert" className="text-[12px] text-[#fda4af]">
                                        {enlace.error}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <button type="submit" className="ss-redondo min-h-9 flex-1 cursor-pointer rounded-full bg-[#7C5CFF] px-4 text-[13px] font-semibold text-white">
                                        Aplicar enlace
                                    </button>
                                    {info.enlace && (
                                        <button
                                            type="button"
                                            onClick={quitarEnlace}
                                            className="ss-redondo min-h-9 flex-1 cursor-pointer rounded-full px-4 text-[13px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)] hover:bg-white/[0.07]"
                                        >
                                            Quitar enlace
                                        </button>
                                    )}
                                </div>
                            </form>
                        </PopoverContent>
                    </Popover>
                </Grupo>
                <Grupo>
                    <BotonBarra etiqueta="Lista" activo={info.tipo === "lista"} onAccion={() => bloque("lista")}>
                        <List className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Lista numerada" activo={info.tipo === "listaNumerada"} onAccion={() => bloque("listaNumerada")}>
                        <ListOrdered className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Lista de tareas (Ctrl+Intro marca la tarea)" activo={info.tipo === "tareas"} onAccion={() => bloque("tareas")}>
                        <ListChecks className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Cita" activo={info.tipo === "cita"} onAccion={() => bloque("cita")}>
                        <Quote className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Bloque de código" activo={info.tipo === "codigo"} onAccion={() => bloque("codigo")}>
                        <SquareCode className="h-4 w-4" />
                    </BotonBarra>
                    <BotonBarra etiqueta="Separador" onAccion={separador}>
                        <Minus className="h-4 w-4" />
                    </BotonBarra>
                </Grupo>
                <Grupo>
                    {(
                        [
                            ["izquierda", "Alinear a la izquierda", AlignLeft],
                            ["centro", "Centrar", AlignCenter],
                            ["derecha", "Alinear a la derecha", AlignRight],
                            ["justificado", "Justificar", AlignJustify],
                        ] as const
                    ).map(([al, nombre, Icono]) => (
                        <BotonBarra key={al} etiqueta={nombre} activo={info.alineacion === al} onAccion={() => alinear(al)} disabled={info.tipo !== "parrafo" && !info.tipo.startsWith("titulo")}>
                            <Icono className="h-4 w-4" />
                        </BotonBarra>
                    ))}
                </Grupo>
            </div>

            <div
                className={cn(
                    "relative min-h-0 flex-1 overflow-y-auto rounded-[18px] bg-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]",
                    compacto ? "p-3" : "p-4 sm:p-5",
                )}
                style={estiloArea}
            >
                {vacio && (
                    <div aria-hidden="true" className={cn("pointer-events-none absolute text-white/40", compacto ? "left-3 top-3" : "left-4 top-4 sm:left-5 sm:top-5")} style={{ fontFamily: cssBase.fontFamily, fontSize: cssBase.fontSize }}>
                        {placeholder}
                    </div>
                )}
                <div
                    ref={raizRef}
                    contentEditable
                    suppressContentEditableWarning
                    tabIndex={0}
                    role="textbox"
                    aria-multiline="true"
                    aria-label={etiqueta}
                    spellCheck
                    data-editor-doc=""
                    className={cn(styles.doc, styles.editorDoc, compacto ? "min-h-[8rem]" : "min-h-[40vh]")}
                    style={cssBase}
                    onInput={alEscribir}
                    onKeyDown={alTeclear}
                    onPaste={alPegar}
                    onDrop={alSoltar}
                    onPointerDown={alPulsar}
                    onBlur={() => {
                        const raiz = raizRef.current;
                        if (!raiz) return;
                        const r = leerRango(raiz);
                        if (r) rangoRef.current = r;
                    }}
                />
            </div>
        </div>
    );
}
