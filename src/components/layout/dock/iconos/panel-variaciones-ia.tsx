"use client";

/**
 * «Crear variaciones» con IA (Ola 1025U · V1b): descripción libre, referencias propias (imágenes de la
 * Biblioteca o subidas), selector de modelo entre los que el OS ya tiene listos y N variaciones como SVG
 * (o como imagen, si la persona lo elige). Reglas que se ven en pantalla, no solo en el código:
 *   · gratis o local primero; los modelos de pago están apagados salvo que se activen aquí;
 *   · un tope de peticiones por hora, visible;
 *   · si no hay IA lista, lo dice y explica cómo conseguir una;
 *   · lo que vuelve de la IA se filtra por seguridad antes de poder usarse.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SourceAvailability } from "@/ai/astraura/availability";
import type { DisenoIcono } from "@/lib/dock/iconos/modelo";
import { MAX_DESCRIPCION, MAX_REFERENCIAS, MAX_VARIACIONES, type ReferenciaIcono } from "@/lib/dock/iconos/ia-prompt";
import {
    MAX_IMAGENES,
    SIN_IA_MOTIVO,
    contarDePagoListos,
    modelosElegibles,
    pedirVariacionesImagen,
    pedirVariacionesSvg,
    proveedoresDeImagen,
    topesActuales,
    type ProveedorImagen,
} from "@/lib/dock/iconos/ia-variaciones";
import { paletaDeBlob } from "@/lib/dock/iconos/imagen";
import { VistaIcono } from "./icono-dock";
import type { IconoLucide } from "./glifos-lucide";
import { SelectorImagen } from "./selector-imagen";

interface Props {
    /** El diseño del que parte la IA (el borrador actual). */
    base: DisenoIcono;
    etiquetaItem: string;
    iconKey: string;
    iconoPropio: IconoLucide;
    /** Lleva una variación al editor. */
    alElegir: (d: DisenoIcono) => void;
}

interface Referencia extends ReferenciaIcono { id: string; miniatura?: string }

type Modo = "svg" | "imagen";

const selectClase =
    "h-11 w-full cursor-pointer rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PanelVariacionesIA({ base, etiquetaItem, iconKey, iconoPropio, alElegir }: Props) {
    const idDesc = useId();
    const idModelo = useId();
    const idCant = useId();
    const idProv = useId();
    const [modo, setModo] = useState<Modo>("svg");
    const [descripcion, setDescripcion] = useState("");
    const [cantidad, setCantidad] = useState(3);
    const [referencias, setReferencias] = useState<Referencia[]>([]);
    const [permitirPago, setPermitirPago] = useState(false);
    const [avail, setAvail] = useState<SourceAvailability[] | null>(null);
    const [modeloSel, setModeloSel] = useState("auto");
    const [proveedores, setProveedores] = useState<ProveedorImagen[]>([]);
    const [proveedorSel, setProveedorSel] = useState("pollinations");
    const [ocupado, setOcupado] = useState(false);
    const [estado, setEstado] = useState("");
    const [resultado, setResultado] = useState<{ variaciones: DisenoIcono[]; avisos: string[]; via?: string; dePago?: boolean } | null>(null);
    const [error, setError] = useState("");
    const [topes, setTopes] = useState(() => topesActuales());
    const aborto = useRef<AbortController | null>(null);
    const miniaturas = useRef<string[]>([]);

    useEffect(() => {
        let vivo = true;
        import("@/ai/astraura/availability")
            .then((m) => m.detectAvailability(true))
            .then((l) => { if (vivo) setAvail(l); })
            .catch(() => { if (vivo) setAvail([]); });
        proveedoresDeImagen().then((p) => { if (vivo) setProveedores(p); });
        return () => {
            vivo = false;
            aborto.current?.abort();
            for (const u of miniaturas.current) { try { URL.revokeObjectURL(u); } catch { /* noop */ } }
        };
    }, []);

    const modelos = useMemo(() => (avail ? modelosElegibles(avail, { permitirPago }) : []), [avail, permitirPago]);
    const dePagoListos = avail ? contarDePagoListos(avail) : 0;
    // si el modelo elegido desaparece (se apagó el pago), vuelve al automático
    useEffect(() => {
        if (modeloSel !== "auto" && !modelos.some((m) => `${m.sourceId}::${m.modelId}` === modeloSel)) setModeloSel("auto");
    }, [modelos, modeloSel]);

    const hayIA = modelos.length > 0 || (permitirPago && dePagoListos > 0);
    const topeActual = modo === "svg" ? topes.texto : topes.imagen;
    const descripcionValida = descripcion.trim().length >= 3;
    const modeloActual = modelos.find((m) => `${m.sourceId}::${m.modelId}` === modeloSel);

    const anadirReferencia = useCallback(async ({ blob, nombre }: { blob: Blob; nombre: string }) => {
        if (referencias.length >= MAX_REFERENCIAS) { setError(`Máximo ${MAX_REFERENCIAS} referencias.`); return; }
        setError("");
        const paleta = await paletaDeBlob(blob);
        let miniatura: string | undefined;
        try { miniatura = URL.createObjectURL(blob); miniaturas.current.push(miniatura); } catch { miniatura = undefined; }
        setReferencias((r) => [...r, { id: `${Date.now()}-${r.length}`, nombre, paleta, miniatura, nota: "" }]);
    }, [referencias.length]);

    const crear = async () => {
        if (!descripcionValida || ocupado) return;
        setOcupado(true);
        setError("");
        setResultado(null);
        const ctrl = new AbortController();
        aborto.current = ctrl;
        try {
            if (modo === "svg") {
                const r = await pedirVariacionesSvg({
                    encargo: {
                        descripcion,
                        cantidad,
                        etiquetaItem,
                        base,
                        referencias: referencias.map(({ nombre, paleta, nota }) => ({ nombre, paleta, nota })),
                    },
                    modelo: modeloActual ? { sourceId: modeloActual.sourceId, modelId: modeloActual.modelId } : null,
                    permitirPago,
                    signal: ctrl.signal,
                    onEstado: setEstado,
                });
                if (r.ok) setResultado({ variaciones: r.variaciones, avisos: r.avisos, via: r.via, dePago: r.dePago });
                else { setError(r.motivo ?? "No se pudo crear las variaciones."); }
            } else {
                const r = await pedirVariacionesImagen({ descripcion, base, cantidad: Math.min(cantidad, MAX_IMAGENES), proveedor: proveedorSel, signal: ctrl.signal, onEstado: setEstado });
                if (r.ok) setResultado({ variaciones: r.variaciones, avisos: r.avisos });
                else setError(r.motivo ?? "No se pudo generar las imágenes.");
            }
        } finally {
            setOcupado(false);
            setEstado("");
            setTopes(topesActuales());
            aborto.current = null;
        }
    };

    return (
        <div className="space-y-4" data-panel-variaciones-ia="">
            <p className="flex items-start gap-2 rounded-xl bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50/90 ring-1 ring-cyan-300/20">
                <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>La IA propone dibujos nuevos para este icono. Describe lo que quieres, añade referencias si las tienes y elige con qué modelo. Tú decides cuál usar; nada se aplica solo.</span>
            </p>

            <div role="group" aria-label="Qué crear" className="grid grid-cols-2 gap-1 rounded-full bg-black/25 p-1 ring-1 ring-white/10">
                {([["svg", "Dibujo vectorial (SVG)"], ["imagen", "Imagen"]] as const).map(([id, texto]) => (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={modo === id}
                        onClick={() => { setModo(id); setResultado(null); setError(""); }}
                        className={cn(
                            "min-h-11 cursor-pointer rounded-full px-2 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                            modo === id ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50" : "text-muted-foreground hover:bg-white/10",
                        )}
                    >
                        {texto}
                    </button>
                ))}
            </div>

            <div className="space-y-1">
                <Label htmlFor={idDesc} className="text-xs">Descripción</Label>
                <Textarea
                    id={idDesc}
                    value={descripcion}
                    maxLength={MAX_DESCRIPCION}
                    rows={3}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Una luna de cristal con un anillo dorado, trazo fino y delicado…"
                    className="cursor-text text-sm"
                />
            </div>

            {modo === "svg" && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground/85">Referencias <span className="font-normal text-muted-foreground">({referencias.length}/{MAX_REFERENCIAS})</span></p>
                    <SelectorImagen alElegir={anadirReferencia} etiqueta="Subir referencia" />
                    {referencias.length > 0 && (
                        <ul className="space-y-2" aria-label="Tus referencias">
                            {referencias.map((r) => (
                                <li key={r.id} className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/10">
                                    {r.miniatura
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={r.miniatura} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                                        : <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/10 text-[10px] text-muted-foreground">img</span>}
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-xs font-medium" title={r.nombre}>{r.nombre}</span>
                                            <span className="flex gap-0.5" aria-label={r.paleta.length ? `Colores: ${r.paleta.join(", ")}` : "No se pudieron leer los colores"}>
                                                {r.paleta.map((c) => <span key={c} className="size-3 rounded-full ring-1 ring-white/30" style={{ background: c }} />)}
                                            </span>
                                        </div>
                                        <label className="sr-only" htmlFor={`${r.id}-nota`}>Qué te gusta de {r.nombre}</label>
                                        <input
                                            id={`${r.id}-nota`}
                                            value={r.nota ?? ""}
                                            maxLength={160}
                                            onChange={(e) => setReferencias((l) => l.map((x) => (x.id === r.id ? { ...x, nota: e.target.value } : x)))}
                                            placeholder="Qué te gusta de esta referencia (trazo, forma…)"
                                            className="h-11 w-full cursor-text rounded-lg border border-white/10 bg-black/20 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                                        />
                                        {r.paleta.length === 0 && <p className="text-[11px] text-amber-200/80">No pude leer sus colores; el modelo solo recibirá tu nota.</p>}
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Quitar la referencia ${r.nombre}`}
                                        onClick={() => setReferencias((l) => l.filter((x) => x.id !== r.id))}
                                        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                                    >
                                        <X className="size-4" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                        Los modelos de texto no ven las imágenes: reciben su paleta de colores (calculada en tu aparato) y lo que escribas de cada una.
                    </p>
                </div>
            )}

            {modo === "svg" ? (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label htmlFor={idModelo} className="text-xs">Modelo</Label>
                        <select id={idModelo} value={modeloSel} onChange={(e) => setModeloSel(e.target.value)} disabled={avail === null} className={selectClase}>
                            <option value="auto">Automático · el mejor gratuito que haya listo</option>
                            {modelos.map((m) => (
                                <option key={`${m.sourceId}::${m.modelId}`} value={`${m.sourceId}::${m.modelId}`}>
                                    {m.etiqueta}{m.privacidad === "local" ? " · en tu aparato" : m.gratis ? " · gratis" : " · de pago"}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 ring-1 ring-white/10">
                        <div className="min-w-0">
                            <p className="text-xs font-medium">Permitir modelos de pago</p>
                            <p className="text-[11px] text-muted-foreground">
                                {permitirPago ? "Activado: podrías gastar crédito de tu cuenta." : `Apagado${dePagoListos ? ` · hay ${dePagoListos} de pago listo(s) sin usar` : ""}.`}
                            </p>
                        </div>
                        <Switch checked={permitirPago} onCheckedChange={setPermitirPago} aria-label="Permitir modelos de pago" />
                    </div>
                    {avail === null && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Buscando IA disponible…</p>}
                    {avail !== null && !hayIA && <p role="status" className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90 ring-1 ring-amber-300/20">{SIN_IA_MOTIVO}</p>}
                    {modeloActual && modeloActual.privacidad !== "local" && (
                        <p className="text-[11px] text-muted-foreground">Este modelo está en la nube: tu descripción y los colores de las referencias salen de tu aparato.</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label htmlFor={idProv} className="text-xs">Servicio de imágenes</Label>
                        <select id={idProv} value={proveedorSel} onChange={(e) => setProveedorSel(e.target.value)} className={selectClase}>
                            {(proveedores.length ? proveedores : [{ id: "pollinations", etiqueta: "Pollinations.ai", nota: "", web: true }]).map((p) => (
                                <option key={p.id} value={p.id}>{p.etiqueta}{p.id === "pollinations" ? " · gratis" : p.web ? " · con tu clave" : " · tu servidor"}</option>
                            ))}
                        </select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {proveedorSel === "pollinations"
                            ? "Pollinations es un servicio web gratuito: tu descripción sale de tu aparato hacia su servidor. Las imágenes son un recurso extra; para iconos nítidos suele ir mejor el dibujo vectorial."
                            : "Se usará el servicio que tengas conectado; si falla, se prueba con Pollinations y se te avisa."}
                    </p>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                    <Label htmlFor={idCant} className="text-xs">Cuántas variaciones</Label>
                    <select id={idCant} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={selectClase}>
                        {Array.from({ length: modo === "imagen" ? MAX_IMAGENES : MAX_VARIACIONES }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                {ocupado ? (
                    <Button type="button" variant="outline" onClick={() => aborto.current?.abort()} className="cursor-pointer"><Square aria-hidden /> Cancelar</Button>
                ) : (
                    <Button type="button" onClick={() => void crear()} disabled={!descripcionValida || (modo === "svg" && avail !== null && !hayIA) || !topeActual.permitido} className="cursor-pointer">
                        <Sparkles aria-hidden /> Crear variaciones
                    </Button>
                )}
            </div>
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
                {ocupado ? (estado || "Trabajando…") : `Peticiones esta hora: ${topeActual.usadas} de ${topeActual.tope}${topeActual.permitido ? "." : ` · podrás volver a pedir en unos ${topeActual.reintentarEnMin} min.`}`}
            </p>

            {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/25">{error}</p>}

            {resultado && (
                <section aria-label="Variaciones propuestas" className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">
                        Propuestas{resultado.via ? <span className="ml-1 font-normal normal-case text-muted-foreground">· {resultado.via}</span> : null}
                    </h3>
                    {resultado.dePago && <p role="status" className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90 ring-1 ring-amber-300/20">Esta respuesta salió de un modelo de pago (tu cuenta lo tenía conectado y permitido en los ajustes de IA).</p>}
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {resultado.variaciones.map((v, i) => (
                            <li key={i} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
                                <VistaIcono diseno={v} icono={iconoPropio} iconKey={iconKey} lado={64} sobreDock />
                                <span className="max-w-full truncate text-xs" title={v.nombre}>{v.nombre ?? `Variación ${i + 1}`}</span>
                                <Button type="button" size="sm" variant="outline" className="min-h-11 w-full cursor-pointer" onClick={() => alElegir(v)} aria-label={`Usar la variación ${v.nombre ?? i + 1}`}>
                                    Usar esta
                                </Button>
                            </li>
                        ))}
                    </ul>
                    {resultado.avisos.map((a) => <p key={a} className="text-[11px] text-muted-foreground">{a}</p>)}
                </section>
            )}
        </div>
    );
}
