"use client";

/**
 * «Imaginación» — el detalle del medidor del pulso (Ola 1024I · IMG1024B; sustituye a IMN1021H e IMN1021J).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex (2026-10-24): «en el pulso de MetaGenesis y de los demás Genesis añade un medidor de lo que sale
 * de propuestas de todo tipo de los procesos imaginativos, con formatos de propuestas libres de los
 * agentes imaginativos, y botones para integrar o para reimaginar con cambios o referencias descritos
 * para mejorar, y un botón de aprobación y reimaginación automática, donde los no aprobados se enlisten
 * para analizar manualmente y poder aprobar o reimaginar o rechazar todos o cada uno».
 *
 * Todo lo que decide vive en `@/lib/mando/imaginacion-tipos` (puro) y en `/api/mando/imaginacion`
 * (solo local): aquí solo se pinta, se valida lo que se escribe y se dice lo que contestó el servidor.
 *   · Arriba, el automático (aprobar · reimaginar, umbral y tope) y la regla fija: lo alto o crítico
 *     SIEMPRE espera el visto bueno de Alex (ningún interruptor la salta).
 *   · Pestañas (Por decidir · Reimaginando · Integradas · Rechazadas y pospuestas · Descartadas · Todas)
 *     y filtros por tipo y por fuente. Ola 1028A: «Por decidir» cuenta lo MISMO que la pastilla
 *     (esperaAAlex: esperando aprobación o pregunta); las descartadas tienen pestaña propia para
 *     rescatarlas, y pospuestas y nuevas se ven en «Todas».
 *   · Cada propuesta en su tarjeta, con su cuerpo en formato libre (Markdown sin HTML crudo y solo
 *     enlaces https), sus referencias, sus archivos y sus botones; el lote decide varias a la vez y
 *     dice cuál falló y por qué, sin perder la selección de lo fallido.
 * Nada de `node:*` aquí: solo tipos y funciones puras del lado del cliente.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Check, ChevronDown, Clock, ExternalLink, FileSearch, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";

import { Switch } from "@/components/ui/switch";
// INV1025P: las propuestas del agente de alcance montan su panel de mensajes
// (editor · aprobar texto · reimaginar · rechazar · enviar con ENVIAR) en lugar
// de los botones de código.
import { PanelAlcance } from "@/components/mando/panel-alcance";
import {
    MAX_REFERENCIAS,
    MAX_REIMAGINACIONES,
    NOMBRE_ESTADO,
    NOMBRE_FUENTE,
    NOMBRE_TIPO,
    TIPOS_PROPUESTA,
    UMBRAL_MINIMO,
    esDecidible,
    esperaAAlex,
    filasMedidor,
    normalizarReferencias,
    vetoReimaginar,
    type AjustesAuto,
    type AjustesAutodesarrollo,
    type AmbitoPropuesta,
    type EstadoPropuesta,
    type FuentePropuesta,
    type HacerLote,
    type ImportanciaPropuesta,
    type PropuestaNormalizada,
    type ReferenciaPropuesta,
    type TipoPropuesta,
} from "@/lib/mando/imaginacion-tipos";
import { nombreDeAmbito } from "@/lib/mando/medidores";

// ── Utilidades puras (exportadas para las pruebas) ──────────────────────────────────────────────────

/**
 * «Referencias (una URL https por línea, con título opcional)»: cada línea con su dirección https y,
 * si se quiere, un título delante o detrás («Paleta Trinity — https://…»). Lo que no es https, no
 * trae dirección o lleva credenciales se dice por línea; nunca se descarta en silencio.
 */
export function leerReferencias(texto: string): { referencias: ReferenciaPropuesta[]; errores: string[] } {
    const referencias: ReferenciaPropuesta[] = [];
    const errores: string[] = [];
    texto.split(/\r?\n/).forEach((linea, i) => {
        const l = linea.trim();
        if (!l) return;
        const m = /\b([a-z][a-z0-9+.-]*:\/\/\S+)/i.exec(l);
        if (!m) return void errores.push(`Línea ${i + 1}: falta la dirección (https://…).`);
        if (!/^https:\/\//i.test(m[1])) return void errores.push(`Línea ${i + 1}: solo valen direcciones https://.`);
        const titulo = `${l.slice(0, m.index)} ${l.slice(m.index + m[1].length)}`
            .replace(/^[\s|·:—–-]+|[\s|·:—–-]+$/g, "")
            .replace(/\s+/g, " ");
        const [ref] = normalizarReferencias([{ titulo, url: m[1] }]);
        if (!ref) return void errores.push(`Línea ${i + 1}: la dirección no es válida.`);
        if (!referencias.some((r) => r.url === ref.url)) referencias.push(ref);
    });
    if (referencias.length > MAX_REFERENCIAS) errores.push(`Como mucho ${MAX_REFERENCIAS} referencias.`);
    return { referencias, errores };
}

/** Las primeras palabras del cuerpo, sin la sintaxis de Markdown, para la tarjeta plegada. */
export function extracto(md: string, max = 220): string {
    const t = md
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^[\s>#*+-]+/gm, "")
        .replace(/[*_`~]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const dos = (n: number) => String(n).padStart(2, "0");
/** «a las 21:05» si es de hoy; «el 23/10 a las 21:05» si no; «» si no es una fecha. */
export function cuando(iso: string | undefined, ahora: Date = new Date()): string {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const hora = `a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
    return d.toDateString() === ahora.toDateString() ? hora : `el ${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${hora}`;
}
const coma = (n: number) => n.toFixed(2).replace(".", ",");
const idDom = (id: string) => `imaginacion-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
const esHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);
const dominio = (u: string) => {
    try {
        return new URL(u).hostname;
    } catch {
        return "enlace";
    }
};

// ── Datos y red ─────────────────────────────────────────────────────────────────────────────────────

interface DatosImaginacion { propuestas: PropuestaNormalizada[]; ajustes: AjustesAutodesarrollo }
interface ResultadoId { id: string; ok: boolean; error?: string }
interface RespuestaPost { ok?: boolean; error?: string; propuesta?: PropuestaNormalizada; resultados?: ResultadoId[]; ajustes?: AjustesAutodesarrollo }
type Envio = { ok: boolean; status: number; datos: RespuestaPost };

async function enviar(cuerpo: Record<string, unknown>): Promise<Envio> {
    try {
        const r = await fetch("/api/mando/imaginacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
        });
        const datos = (await r.json().catch(() => ({}))) as RespuestaPost;
        return { ok: r.ok && datos.ok !== false && !datos.error, status: r.status, datos };
    } catch {
        return { ok: false, status: 0, datos: { error: "La consola local no respondió: no se cambió nada." } };
    }
}
const errorDe = (e: Envio) => e.datos.error ?? `No se pudo (HTTP ${e.status}).`;

// ── Estilo de Genesis (dianas de 44 px, foco visible, sin animar si se pide menos movimiento) ───────

const BOTON_BASE =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-50 " +
    "motion-safe:transition-colors";
const BOTON = {
    integrar: `${BOTON_BASE} border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20`,
    reimaginar: `${BOTON_BASE} border-violet-300/40 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20`,
    rechazar: `${BOTON_BASE} border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20`,
    posponer: `${BOTON_BASE} border-amber-300/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20`,
    neutro: `${BOTON_BASE} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`,
};
const CAMPO =
    "rounded-lg border border-white/15 bg-black/40 px-3 text-xs text-white placeholder:text-white/50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80";
const GIRO = "h-3.5 w-3.5 motion-safe:animate-spin";

const COLOR_ESTADO: Partial<Record<EstadoPropuesta, string>> = {
    "esperando-aprobacion": "border-amber-300/40 bg-amber-400/10 text-amber-100",
    pregunta: "border-amber-300/40 bg-amber-400/10 text-amber-100",
    nueva: "border-cyan-300/40 bg-cyan-400/10 text-cyan-100",
    reimaginando: "border-violet-300/40 bg-violet-400/10 text-violet-100",
    aprobada: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    autodesarrollo: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    encargada: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    hecha: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    rechazada: "border-rose-300/40 bg-rose-400/10 text-rose-100",
    descartada: "border-rose-300/30 bg-rose-400/5 text-rose-100",
};
const COLOR_IMPORTANCIA: Record<ImportanciaPropuesta, string> = {
    crítica: "border-rose-300/50 bg-rose-500/15 text-rose-100",
    alta: "border-amber-300/50 bg-amber-500/15 text-amber-100",
    media: "border-white/20 bg-white/5 text-white/85",
    baja: "border-white/15 text-white/75",
};
const CHIP = "rounded-full border px-2 py-0.5 text-[11px] leading-5";

// ── Pestañas y filtros ──────────────────────────────────────────────────────────────────────────────

type Pestana = "por-decidir" | "reimaginando" | "integradas" | "cerradas" | "descartadas" | "todas";
const INTEGRADAS = new Set<EstadoPropuesta>(["aprobada", "autodesarrollo", "encargada", "hecha"]);
// Ola 1028A: «Por decidir» entra con `esperaAAlex` (la misma cuenta de la pastilla); «Descartadas»
// aparte, para rescatarlas (siguen decidibles); pospuestas y nuevas se ven en «Todas».
const PESTANAS: { id: Pestana; texto: string; entra: (p: PropuestaNormalizada) => boolean; vacio: string }[] = [
    { id: "por-decidir", texto: "Por decidir", entra: (p) => esperaAAlex(p.estado), vacio: "Nada espera tu decisión aquí." },
    { id: "reimaginando", texto: "Reimaginando", entra: (p) => p.estado === "reimaginando", vacio: "Nada se está reimaginando ahora." },
    { id: "integradas", texto: "Integradas", entra: (p) => INTEGRADAS.has(p.estado), vacio: "Aún no se ha integrado nada de aquí." },
    {
        id: "cerradas",
        texto: "Rechazadas y pospuestas",
        entra: (p) => p.estado === "rechazada" || p.estado === "pospuesta",
        vacio: "Nada rechazado ni pospuesto.",
    },
    {
        id: "descartadas",
        texto: "Descartadas",
        entra: (p) => p.estado === "descartada",
        vacio: "Nada descartado de aquí.",
    },
    { id: "todas", texto: "Todas", entra: () => true, vacio: "Ninguna propuesta en este ámbito." },
];
const FUENTES = Object.keys(NOMBRE_FUENTE) as FuentePropuesta[];

// ── Markdown seguro: sin HTML crudo, enlaces solo https y en pestaña nueva, imágenes como enlace ─────

const MD: Components = {
    h1: ({ children }) => <h5 className="mb-1.5 mt-2 text-sm font-semibold text-white">{children}</h5>,
    h2: ({ children }) => <h5 className="mb-1.5 mt-2 text-sm font-semibold text-white">{children}</h5>,
    h3: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-semibold text-white/90">{children}</h6>,
    h4: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-semibold text-white/90">{children}</h6>,
    h5: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-semibold text-white/90">{children}</h6>,
    h6: ({ children }) => <h6 className="mb-1 mt-2 text-xs font-semibold text-white/90">{children}</h6>,
    p: ({ children }) => <p className="mb-1.5 text-xs leading-relaxed text-white/85">{children}</p>,
    ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-5 text-xs text-white/85">{children}</ul>,
    ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-5 text-xs text-white/85">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="mb-1.5 border-l-2 border-violet-300/40 pl-2 text-white/80">{children}</blockquote>,
    code: ({ children }) => <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-cyan-100">{children}</code>,
    pre: ({ children }) => <pre className="mb-1.5 overflow-x-auto rounded-lg bg-black/50 p-2 text-[11px]">{children}</pre>,
    a: ({ href, children }) =>
        esHttps(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
                {children}
            </a>
        ) : (
            <span>{children}</span>
        ),
    img: ({ src, alt }) =>
        esHttps(src) ? (
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline underline-offset-2">
                imagen: {alt || dominio(src)}
            </a>
        ) : (
            <span>{alt}</span>
        ),
};
/** El cuerpo libre del agente, tal cual lo escribió, pero sin nada que ejecute ni cargue de fuera. */
export function CuerpoLibre({ texto }: { texto: string }) {
    return (
        <div className="text-left" data-testid="cuerpo-libre">
            <ReactMarkdown skipHtml components={MD} urlTransform={(u) => (esHttps(u) ? u : "")}>
                {texto}
            </ReactMarkdown>
        </div>
    );
}

// ── Formulario de reimaginar (tarjeta y lote) ───────────────────────────────────────────────────────

function FormularioReimaginar({
    idBase,
    textoBoton,
    aviso,
    ocupado,
    alEnviar,
    alCancelar,
}: {
    idBase: string;
    textoBoton: string;
    aviso?: string;
    ocupado: boolean;
    alEnviar: (notas: string, referencias: ReferenciaPropuesta[]) => void;
    alCancelar: () => void;
}) {
    const [notas, setNotas] = useState("");
    const [refs, setRefs] = useState("");
    const [errores, setErrores] = useState<string[]>([]);
    const alMandar = (e: FormEvent) => {
        e.preventDefault();
        const leidas = leerReferencias(refs);
        const veto = leidas.errores.length ? null : vetoReimaginar(notas, leidas.referencias);
        const todos = veto ? [veto] : leidas.errores;
        setErrores(todos);
        if (!todos.length) alEnviar(notas.trim(), leidas.referencias);
    };
    // Escape cancela el formulario sin cerrar el panel entero (el panel escucha Escape en `window`).
    const alTecla = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        alCancelar();
    };
    return (
        <form
            onSubmit={alMandar}
            onKeyDown={alTecla}
            aria-label="Reimaginar"
            data-testid={`${idBase}-formulario`}
            className="mt-2 grid gap-1.5 rounded-lg border border-violet-300/25 bg-violet-400/5 p-3 text-left"
        >
            {aviso ? <p className="text-[11px] leading-snug text-amber-100">{aviso}</p> : null}
            <label htmlFor={`${idBase}-notas`} className="text-[11px] font-medium text-white/85">
                Qué cambiar
            </label>
            <textarea
                id={`${idBase}-notas`}
                rows={3}
                maxLength={2000}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Más contraste en los botones, menos texto en la cabecera…"
                className={`${CAMPO} min-h-[5.5rem] py-2`}
            />
            <span className="text-right text-[10px] tabular-nums text-white/60">{notas.length} / 2000</span>
            <label htmlFor={`${idBase}-refs`} className="text-[11px] font-medium text-white/85">
                Referencias (una URL https por línea, con título opcional)
            </label>
            <textarea
                id={`${idBase}-refs`}
                rows={3}
                value={refs}
                onChange={(e) => setRefs(e.target.value)}
                placeholder="Paleta Trinity — https://ejemplo.org/paleta"
                className={`${CAMPO} min-h-[5.5rem] py-2 font-mono`}
            />
            {errores.length ? (
                <ul role="alert" className="space-y-0.5 text-[11px] text-rose-200">
                    {errores.map((e) => (
                        <li key={e}>{e}</li>
                    ))}
                </ul>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={alCancelar} className={BOTON.neutro}>
                    Cancelar
                </button>
                <button type="submit" disabled={ocupado} className={BOTON.reimaginar}>
                    {ocupado ? <Loader2 className={GIRO} aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                    {textoBoton}
                </button>
            </div>
        </form>
    );
}

// ── El automático ───────────────────────────────────────────────────────────────────────────────────

function AjustesAutomatico({
    auto,
    alGuardar,
}: {
    auto: AjustesAuto;
    alGuardar: (parcial: Partial<AjustesAuto>) => Promise<string | null>;
}) {
    const [umbral, setUmbral] = useState(auto.umbral);
    const [tope, setTope] = useState(auto.max_reimaginaciones);
    const [ocupado, setOcupado] = useState<keyof AjustesAuto | "limites" | null>(null);
    const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
    // Lo guardado manda mientras no se esté editando: al releer, el borrador se pone al día.
    useEffect(() => setUmbral(auto.umbral), [auto.umbral]);
    useEffect(() => setTope(auto.max_reimaginaciones), [auto.max_reimaginaciones]);

    const guardar = async (que: keyof AjustesAuto | "limites", parcial: Partial<AjustesAuto>, bien: string) => {
        setOcupado(que);
        setMensaje(null);
        const error = await alGuardar(parcial);
        setMensaje(error ? { ok: false, texto: error } : { ok: true, texto: bien });
        setOcupado(null);
    };
    const topeValido = Number.isInteger(tope) && tope >= 0 && tope <= MAX_REIMAGINACIONES;
    const cambiado = Math.abs(umbral - auto.umbral) > 0.001 || tope !== auto.max_reimaginaciones;

    // Una función de pintado, no un componente: así el interruptor no se vuelve a montar (ni pierde el foco)
    // cada vez que el panel se pinta de nuevo.
    const interruptor = (que: "aprobar" | "reimaginar", titulo: string, subtitulo: string) => (
        <label
            htmlFor={`imaginacion-auto-${que}`}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-white/5"
        >
            <span className="min-w-0 text-left">
                <span className="block text-xs font-medium text-white">{titulo}</span>
                <span className="block text-[11px] leading-snug text-white/70">{subtitulo}</span>
            </span>
            <span className="flex items-center gap-2">
                {ocupado === que ? <Loader2 className={`${GIRO} text-white/70`} aria-hidden /> : null}
                <Switch
                    id={`imaginacion-auto-${que}`}
                    data-testid={`imaginacion-auto-${que}`}
                    checked={auto[que]}
                    disabled={ocupado !== null}
                    aria-label={titulo}
                    onCheckedChange={(v) =>
                        void guardar(que, { [que]: v }, `${titulo}: ${v ? "encendida" : "apagada"}.`)
                    }
                    className="focus-visible:ring-cyan-300/80"
                />
            </span>
        </label>
    );

    return (
        <section aria-labelledby="imaginacion-auto-titulo" className="mc-cristal mx-auto w-full max-w-3xl p-3" data-testid="imaginacion-automatico">
            <h4 id="imaginacion-auto-titulo" className="mc-centrado flex items-center justify-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-violet-200" aria-hidden />
                Aprobación y reimaginación automática
            </h4>
            <p className="mc-centrado mt-1 text-[11px] leading-snug text-white/70">
                Encendida: lo bajo o medio con utilidad ≥ umbral se integra solo; lo que no llega y aún tiene
                reimaginaciones libres se reimagina solo, con la crítica como notas; lo demás queda en tu lista.
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {interruptor("aprobar", "Aprobación automática", "integra sola lo bajo o medio que llega al umbral")}
                {interruptor("reimaginar", "Reimaginación automática", "reimagina sola lo que no llega, hasta el tope")}
            </div>
            <div className="mt-2 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
                <label htmlFor="imaginacion-auto-umbral" className="flex flex-col gap-0.5 text-left text-[11px] text-white/80">
                    <span>
                        Umbral de utilidad: <span className="font-semibold tabular-nums text-white">{coma(umbral)}</span>
                    </span>
                    <input
                        id="imaginacion-auto-umbral"
                        type="range"
                        min={UMBRAL_MINIMO}
                        max={1}
                        step={0.05}
                        value={umbral}
                        aria-valuetext={coma(umbral)}
                        onChange={(e) => setUmbral(Number(e.target.value))}
                        className="h-11 w-full cursor-pointer accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
                    />
                </label>
                <label htmlFor="imaginacion-auto-tope" className="flex flex-col gap-0.5 text-left text-[11px] text-white/80">
                    Tope de reimaginaciones
                    <input
                        id="imaginacion-auto-tope"
                        type="number"
                        min={0}
                        max={MAX_REIMAGINACIONES}
                        step={1}
                        value={Number.isFinite(tope) ? tope : ""}
                        onChange={(e) => setTope(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                        aria-invalid={!topeValido}
                        className={`${CAMPO} h-11 w-24 tabular-nums`}
                    />
                </label>
                <button
                    type="button"
                    disabled={!cambiado || !topeValido || ocupado !== null}
                    onClick={() =>
                        void guardar(
                            "limites",
                            { umbral, max_reimaginaciones: tope },
                            `Guardado: umbral ${coma(umbral)} y tope de ${tope} reimaginación(es).`,
                        )
                    }
                    className={BOTON.neutro}
                >
                    {ocupado === "limites" ? <Loader2 className={GIRO} aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                    Guardar umbral y tope
                </button>
            </div>
            {!topeValido ? <p role="alert" className="mt-1 text-[11px] text-rose-200">El tope va de 0 a {MAX_REIMAGINACIONES}.</p> : null}
            <p
                role="note"
                data-testid="imaginacion-regla-fija"
                className="mc-centrado mt-2 flex items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
            >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                Lo de importancia alta o crítica siempre espera tu visto bueno.
            </p>
            {mensaje ? (
                <p role="status" className={`mc-centrado mt-1.5 text-[11px] ${mensaje.ok ? "text-emerald-200" : "text-rose-200"}`}>
                    {mensaje.texto}
                </p>
            ) : null}
        </section>
    );
}

// ── La tarjeta de una propuesta ─────────────────────────────────────────────────────────────────────

type Abierto = "reimaginar" | "rechazar" | "posponer" | "origen" | null;

function TarjetaPropuesta({
    p,
    titulos,
    seleccionada,
    alSeleccionar,
    alIrA,
    alDecidido,
}: {
    p: PropuestaNormalizada;
    /** id → título, para los enlaces «versión de…» y «versión nueva». */
    titulos: Map<string, string>;
    seleccionada: boolean;
    alSeleccionar: (id: string, si: boolean) => void;
    alIrA: (id: string) => void;
    alDecidido: (texto: string) => Promise<void>;
}) {
    const [cuerpoAbierto, setCuerpoAbierto] = useState(false);
    const [abierto, setAbierto] = useState<Abierto>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [motivo, setMotivo] = useState("");
    const [horas, setHoras] = useState(24);
    const decidible = esDecidible(p.estado);
    const base = idDom(p.id);
    const r = p.reimaginacion;

    const decidir = async (accion: string, cuerpo: Record<string, unknown>, exito: (q: PropuestaNormalizada) => string) => {
        setOcupado(accion);
        setError(null);
        const e = await enviar({ accion, id: p.id, ...cuerpo });
        setOcupado(null);
        if (!e.ok) return setError(errorDe(e));
        setAbierto(null);
        await alDecidido(`«${p.titulo || p.id}»: ${exito(e.datos.propuesta ?? p)}`);
    };
    const integrar = () =>
        void decidir("integrar", {}, () =>
            p.fuente === "astraura" ? "integrada y aplicada en Astraura 1.58." : "integrada: el director la encola en su próximo ciclo.",
        );
    const alternar = (que: Exclude<Abierto, null>) => setAbierto((a) => (a === que ? null : que));
    const enlace = (id: string, texto: string) =>
        titulos.has(id) ? (
            <button type="button" onClick={() => alIrA(id)} className="min-h-11 cursor-pointer px-1 text-cyan-200 underline underline-offset-2 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80">
                {texto}
            </button>
        ) : (
            <span className="text-white/80">{texto} (no está en este ámbito)</span>
        );

    return (
        <article
            id={base}
            tabIndex={-1}
            aria-labelledby={`${base}-titulo`}
            data-testid={`propuesta-${p.id}`}
            className="mc-entrar rounded-xl border border-white/10 bg-black/30 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        >
            <div className="flex items-start gap-2">
                {decidible ? (
                    <label className="-ml-2 -mt-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-white/5">
                        <input
                            type="checkbox"
                            checked={seleccionada}
                            onChange={(e) => alSeleccionar(p.id, e.target.checked)}
                            aria-label={`Seleccionar «${p.titulo || p.id}»`}
                            className="h-5 w-5 cursor-pointer accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
                        />
                    </label>
                ) : null}
                <div className="min-w-0 flex-1">
                    <h4 id={`${base}-titulo`} className="text-sm font-semibold leading-snug text-white">
                        {p.titulo || p.id}
                    </h4>
                    <p className="mt-0.5 text-[11px] text-white/70">
                        {NOMBRE_FUENTE[p.fuente]}
                        {p.agente ? ` · ${p.agente}` : ""} · <span className="font-mono">{p.id}</span>
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className={`${CHIP} ${COLOR_ESTADO[p.estado] ?? "border-white/15 text-white/80"}`}>{NOMBRE_ESTADO[p.estado]}</span>
                        <span className={`${CHIP} ${COLOR_IMPORTANCIA[p.importancia]}`}>importancia {p.importancia}</span>
                        <span className={`${CHIP} border-white/15 text-white/80`}>{NOMBRE_TIPO[p.tipo]}</span>
                        <span className={`${CHIP} border-white/15 text-white/80`}>{nombreDeAmbito(p.ambito)}</span>
                        <span className={`${CHIP} border-white/15 tabular-nums text-white/80`}>utilidad {coma(p.utilidad)}</span>
                        <span className={`${CHIP} border-white/15 tabular-nums text-white/80`}>versión {p.version}</span>
                    </p>
                    {p.version_de ? (
                        <p className="mt-1 text-[11px] text-white/75">
                            Versión de {enlace(p.version_de, `«${titulos.get(p.version_de) || p.version_de}»`)}
                        </p>
                    ) : null}
                    {r ? (
                        <div className="mt-1.5 rounded-lg border border-violet-300/20 bg-violet-400/5 px-2 py-1.5 text-[11px] leading-snug text-white/80" data-testid={`${base}-reimaginacion`}>
                            <p>
                                Reimaginación pedida {r.por === "automatica" ? "por la automática" : "por ti"} {cuando(r.pedida)}
                                {r.encolada ? ` · encargada a la flota ${cuando(r.encolada)}${r.tarea ? ` (tarea ${r.tarea})` : ""}` : ""}
                                {r.devuelta ? ` · devuelta a tu lista ${cuando(r.devuelta)}` : ""}
                                {r.recibida ? ` · versión nueva recibida ${cuando(r.recibida)}` : ""}
                            </p>
                            {r.version_nueva ? <p>Versión nueva: {enlace(r.version_nueva, `«${titulos.get(r.version_nueva) || r.version_nueva}»`)}</p> : null}
                            {r.notas ? <p className="mt-0.5 text-white/75">Notas: «{r.notas}»</p> : null}
                            {r.referencias.length ? (
                                <p className="mt-0.5 flex flex-wrap gap-x-2">
                                    {r.referencias.map((x) => (
                                        <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline underline-offset-2">
                                            {x.titulo}
                                        </a>
                                    ))}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    {p.estado === "encargada" && p.tarea ? <p className="mt-1 text-[11px] text-emerald-100">Encargada a la flota: tarea {p.tarea}.</p> : null}
                    {p.motivo ? <p className="mt-1 text-[11px] leading-snug text-white/75">{p.motivo}</p> : null}

                    {p.cuerpo ? (
                        <div className="mt-2">
                            {!cuerpoAbierto ? <p className="text-xs leading-relaxed text-white/80">{extracto(p.cuerpo)}</p> : null}
                            <button
                                type="button"
                                aria-expanded={cuerpoAbierto}
                                aria-controls={`${base}-cuerpo`}
                                onClick={() => setCuerpoAbierto((x) => !x)}
                                className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-[11px] font-medium text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
                            >
                                <ChevronDown className={`h-3.5 w-3.5 motion-safe:transition-transform ${cuerpoAbierto ? "rotate-180" : ""}`} aria-hidden />
                                {cuerpoAbierto ? "Plegar la propuesta" : "Leer la propuesta completa"}
                            </button>
                            {cuerpoAbierto ? (
                                <div id={`${base}-cuerpo`} className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2">
                                    <CuerpoLibre texto={p.cuerpo} />
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {p.referencias.length ? (
                        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" aria-label="Referencias">
                            {p.referencias.map((x) => (
                                <li key={x.url}>
                                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
                                        {x.titulo}
                                        <ExternalLink className="h-3 w-3" aria-hidden />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {p.archivos.length ? (
                        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Archivos">
                            {p.archivos.map((a) => (
                                <li key={a} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
                                    {a}
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {abierto === "origen" ? (
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px]" data-testid={`${base}-origen`}>
                            {(
                                [
                                    ["Fuente", NOMBRE_FUENTE[p.fuente]],
                                    ["Agente", p.agente],
                                    ["Propuesta", cuando(p.t)],
                                    ["Decidida", cuando(p.decidida)],
                                    ["Pospuesta hasta", p.estado === "pospuesta" ? cuando(p.hasta) : undefined],
                                    ["Tarea", p.tarea ?? r?.tarea],
                                    ["Salida", r?.salida],
                                    ["Cola", r?.cola],
                                ] as [string, string | undefined][]
                            )
                                .filter(([, v]) => v)
                                .map(([k, v]) => (
                                    <div key={k} className="contents">
                                        <dt className="text-white/65">{k}:</dt>
                                        <dd className="break-words text-white/85">{v}</dd>
                                    </div>
                                ))}
                        </dl>
                    ) : null}

                    {abierto === "reimaginar" ? (
                        <FormularioReimaginar
                            idBase={`${base}-reimaginar`}
                            textoBoton="Pedir otra versión"
                            ocupado={ocupado === "reimaginar"}
                            alCancelar={() => setAbierto(null)}
                            alEnviar={(notas, referencias) =>
                                void decidir("reimaginar", { notas, referencias }, () => "pedida otra versión: el director la encarga a la flota en su próximo ciclo.")
                            }
                        />
                    ) : null}
                    {abierto === "rechazar" ? (
                        <form
                            className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-rose-300/25 bg-rose-400/5 p-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void decidir("rechazar", { motivo: motivo.trim() }, () => "rechazada.");
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.stopPropagation();
                                    setAbierto(null);
                                }
                            }}
                        >
                            <label htmlFor={`${base}-motivo`} className="flex min-w-48 flex-1 flex-col gap-0.5 text-[11px] text-white/85">
                                Motivo (opcional)
                                <input id={`${base}-motivo`} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${CAMPO} h-11`} />
                            </label>
                            <button type="button" onClick={() => setAbierto(null)} className={BOTON.neutro}>
                                Cancelar
                            </button>
                            <button type="submit" disabled={ocupado !== null} className={BOTON.rechazar}>
                                {ocupado === "rechazar" ? <Loader2 className={GIRO} aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                                Confirmar el rechazo
                            </button>
                        </form>
                    ) : null}
                    {abierto === "posponer" ? (
                        <form
                            className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-amber-300/25 bg-amber-400/5 p-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void decidir("posponer", { horas }, (q) => `pospuesta hasta ${cuando(q.hasta) || "dentro de " + horas + " h"}.`);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.stopPropagation();
                                    setAbierto(null);
                                }
                            }}
                        >
                            <label htmlFor={`${base}-horas`} className="flex flex-col gap-0.5 text-[11px] text-white/85">
                                Horas (1–720)
                                <input
                                    id={`${base}-horas`}
                                    type="number"
                                    min={1}
                                    max={720}
                                    value={horas}
                                    onChange={(e) => setHoras(Number(e.target.value))}
                                    className={`${CAMPO} h-11 w-28 tabular-nums`}
                                />
                            </label>
                            <button type="button" onClick={() => setAbierto(null)} className={BOTON.neutro}>
                                Cancelar
                            </button>
                            <button type="submit" disabled={ocupado !== null || !(horas >= 1 && horas <= 720)} className={BOTON.posponer}>
                                {ocupado === "posponer" ? <Loader2 className={GIRO} aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
                                Posponer
                            </button>
                        </form>
                    ) : null}

                    {error ? (
                        <p role="alert" className="mt-2 rounded-lg border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[11px] text-rose-100">
                            {error}
                        </p>
                    ) : null}
                    {decidible && p.importancia === "crítica" ? (
                        <p className="mt-1.5 text-[11px] text-white/70">Crítica: al integrarla verás el diff antes de que entre.</p>
                    ) : null}

                    {p.agente === "alcance" ? (
                        <div className="border-t border-white/10 pt-2">
                            <PanelAlcance id={p.id} alMensaje={alDecidido} />
                        </div>
                    ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
                        {decidible ? (
                            <>
                                <button type="button" disabled={ocupado !== null} onClick={integrar} className={BOTON.integrar}>
                                    {ocupado === "integrar" ? <Loader2 className={GIRO} aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                                    Integrar
                                </button>
                                <button type="button" aria-expanded={abierto === "reimaginar"} onClick={() => alternar("reimaginar")} className={BOTON.reimaginar}>
                                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                                    Reimaginar
                                </button>
                                <button type="button" aria-expanded={abierto === "rechazar"} onClick={() => alternar("rechazar")} className={BOTON.rechazar}>
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                    Rechazar
                                </button>
                                <button type="button" aria-expanded={abierto === "posponer"} onClick={() => alternar("posponer")} className={BOTON.posponer}>
                                    <Clock className="h-3.5 w-3.5" aria-hidden />
                                    Posponer
                                </button>
                            </>
                        ) : null}
                        <button type="button" aria-expanded={abierto === "origen"} onClick={() => alternar("origen")} className={BOTON.neutro}>
                            <FileSearch className="h-3.5 w-3.5" aria-hidden />
                            Ver origen
                        </button>
                    </div>
                    )}
                </div>
            </div>
        </article>
    );
}

// ── El panel ────────────────────────────────────────────────────────────────────────────────────────

type Lote = { hacer: HacerLote; alcance: "seleccion" | "todas" };
const VERBO: Record<HacerLote, { infinitivo: string; participio: string }> = {
    integrar: { infinitivo: "Integrar", participio: "integradas" },
    reimaginar: { infinitivo: "Reimaginar", participio: "reimaginando" },
    rechazar: { infinitivo: "Rechazar", participio: "rechazadas" },
};

/** Enlace a otro ámbito en la misma vista (MetaGenesis = sin `?ambito=`). */
function enlaceAmbito(a: AmbitoPropuesta): string {
    if (typeof window === "undefined") return a === "metagenesis" ? "?" : `?ambito=${encodeURIComponent(a)}`;
    const q = new URLSearchParams(window.location.search);
    if (a === "metagenesis") q.delete("ambito");
    else q.set("ambito", a);
    if (window.location.pathname.startsWith("/genesis")) q.set("nivel", "meta");
    const s = q.toString();
    return `${window.location.pathname}${s ? `?${s}` : ""}`;
}

export function PanelImaginacion({
    ambito,
    otrosAmbitos = [],
    alCambio,
}: {
    ambito: AmbitoPropuesta;
    /** Lo decidible que espera en otros ámbitos (del detalle del medidor): solo se enlaza. */
    otrosAmbitos?: { ambito: AmbitoPropuesta; decidibles: number }[];
    /** Tras cada decisión con éxito: relee la pastilla y la cabecera del medidor. */
    alCambio?: () => void;
}) {
    const [datos, setDatos] = useState<DatosImaginacion | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorLectura, setErrorLectura] = useState<string | null>(null);
    const [pestana, setPestana] = useState<Pestana>("por-decidir");
    const [tipo, setTipo] = useState<TipoPropuesta | "todos">("todos");
    const [fuente, setFuente] = useState<FuentePropuesta | "todas">("todas");
    const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
    const [respuesta, setRespuesta] = useState<string | null>(null);
    const [lote, setLote] = useState<Lote | null>(null);
    const [motivoLote, setMotivoLote] = useState("");
    const [ocupadoLote, setOcupadoLote] = useState(false);
    const [resultadoLote, setResultadoLote] = useState<{ hacer: HacerLote; resultados: ResultadoId[]; error?: string } | null>(null);
    const alCambioRef = useRef(alCambio);
    alCambioRef.current = alCambio;
    const refPestanas = useRef<(HTMLButtonElement | null)[]>([]);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`/api/mando/imaginacion?ambito=${encodeURIComponent(ambito)}`, { cache: "no-store" });
            const d = (await r.json().catch(() => null)) as (DatosImaginacion & { error?: string }) | null;
            if (!r.ok || !d || !Array.isArray(d.propuestas)) {
                setErrorLectura(d?.error ?? `No se pudieron leer las propuestas (HTTP ${r.status}).`);
                return;
            }
            setDatos({ propuestas: d.propuestas, ajustes: d.ajustes });
            setErrorLectura(null);
            // La selección solo guarda lo que sigue esperando decisión (lo fallido de un lote, sí).
            const siguen = new Set(d.propuestas.filter((p) => esDecidible(p.estado)).map((p) => p.id));
            setSeleccion((s) => new Set([...s].filter((id) => siguen.has(id))));
        } catch {
            setErrorLectura("La consola local no respondió: lo de abajo es la última lectura.");
        }
    }, [ambito]);

    useEffect(() => {
        setCargando(true);
        void cargar().finally(() => setCargando(false));
        const id = window.setInterval(() => {
            if (document.visibilityState === "visible") void cargar();
        }, 20_000);
        return () => window.clearInterval(id);
    }, [cargar]);

    const tras = useCallback(async () => {
        await cargar();
        alCambioRef.current?.();
    }, [cargar]);

    const alDecidido = useCallback(
        async (texto: string) => {
            setRespuesta(texto);
            await tras();
        },
        [tras],
    );

    const guardarAuto = useCallback(
        async (parcial: Partial<AjustesAuto>): Promise<string | null> => {
            const e = await enviar({ accion: "ajustes", ajustes: { auto: parcial } });
            if (!e.ok || !e.datos.ajustes) return errorDe(e);
            const ajustes = e.datos.ajustes;
            setDatos((d) => (d ? { ...d, ajustes } : d));
            alCambioRef.current?.();
            return null;
        },
        [],
    );

    const propuestas = useMemo(() => datos?.propuestas ?? [], [datos]);
    const orden = useMemo(() => new Map(filasMedidor(propuestas).map((f, i) => [f.id, i])), [propuestas]);
    const titulos = useMemo(() => new Map(propuestas.map((p) => [p.id, p.titulo])), [propuestas]);
    const filtradas = useMemo(
        () =>
            propuestas
                .filter((p) => (tipo === "todos" || p.tipo === tipo) && (fuente === "todas" || p.fuente === fuente))
                .sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0)),
        [propuestas, tipo, fuente, orden],
    );
    const actual = PESTANAS.find((x) => x.id === pestana) ?? PESTANAS[0];
    const visibles = filtradas.filter(actual.entra);
    // Ola 1028A: «todas las por decidir» espera a Alex = la MISMA cuenta de la pastilla y de la pestaña.
    const porDecidirIds = useMemo(() => filtradas.filter((p) => esperaAAlex(p.estado)).map((p) => p.id), [filtradas]);
    const hayFiltro = tipo !== "todos" || fuente !== "todas";
    const nSel = seleccion.size;
    const nTodas = porDecidirIds.length;
    const visiblesDecidibles = visibles.filter((p) => esDecidible(p.estado));
    const todasVisiblesMarcadas = visiblesDecidibles.length > 0 && visiblesDecidibles.every((p) => seleccion.has(p.id));

    const alSeleccionar = useCallback((id: string, si: boolean) => {
        setSeleccion((s) => {
            const n = new Set(s);
            if (si) n.add(id);
            else n.delete(id);
            return n;
        });
    }, []);

    const alIrA = useCallback(
        (id: string) => {
            setPestana("todas");
            setTipo("todos");
            setFuente("todas");
            window.requestAnimationFrame(() => {
                const el = document.getElementById(idDom(id));
                const quieto = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                if (typeof el?.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
                el?.focus();
            });
        },
        [],
    );

    const ejecutarLote = async (l: Lote, extra: Record<string, unknown> = {}) => {
        // «Todas» = las por decidir que se ven (en cuenta limpio: las mismas de la pastilla); con las
        // seleccionadas, ellas. Nunca se decide sobre lo que no está en pantalla.
        const ids = l.alcance === "seleccion" ? [...seleccion] : porDecidirIds;
        setOcupadoLote(true);
        setResultadoLote(null);
        const e = await enviar({ accion: "lote", ids, hacer: l.hacer, ambito, ...extra });
        setOcupadoLote(false);
        const resultados = e.datos.resultados ?? [];
        if (!resultados.length && !e.ok) {
            setResultadoLote({ hacer: l.hacer, resultados, error: errorDe(e) });
            return; // nada se intentó: el formulario sigue abierto para corregirlo
        }
        setResultadoLote({ hacer: l.hacer, resultados });
        setSeleccion(new Set(resultados.filter((x) => !x.ok).map((x) => x.id)));
        setLote(null);
        setMotivoLote("");
        if (resultados.some((x) => x.ok)) await tras();
    };
    const pedirLote = (l: Lote) => {
        setResultadoLote(null);
        if (l.hacer === "integrar" && l.alcance === "seleccion") return void ejecutarLote(l);
        setLote(l);
    };
    const cuantas = (l: Lote) => (l.alcance === "seleccion" ? nSel : nTodas);
    const avisoTodas = (l: Lote) =>
        l.alcance === "todas"
            ? `¿${VERBO[l.hacer].infinitivo} las ${nTodas} por decidir ${hayFiltro ? "que se ven con este filtro" : `de ${nombreDeAmbito(ambito)}`}? No se deshace desde aquí.`
            : undefined;

    const alTeclaPestanas = (e: KeyboardEvent<HTMLDivElement>) => {
        const i = PESTANAS.findIndex((x) => x.id === pestana);
        const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? PESTANAS.length - 1 : -2;
        if (j === -2) return;
        e.preventDefault();
        const k = (j + PESTANAS.length) % PESTANAS.length;
        setPestana(PESTANAS[k].id);
        refPestanas.current[k]?.focus();
    };

    return (
        <section className="mx-auto mt-2 grid w-full max-w-5xl gap-3 text-left" data-testid="panel-imaginacion" aria-label={`Imaginación de ${nombreDeAmbito(ambito)}`}>
            <p className="mc-centrado flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-white/75">
                <span>
                    Ámbito: <b className="text-white">{nombreDeAmbito(ambito)}</b>
                </span>
                {ambito !== "metagenesis" ? (
                    <a href={enlaceAmbito("metagenesis")} className="inline-flex min-h-11 items-center text-cyan-200 underline underline-offset-2">
                        Volver al pulso de MetaGenesis
                    </a>
                ) : null}
                {otrosAmbitos.length ? (
                    <span className="flex flex-wrap items-center justify-center gap-x-2" data-testid="imaginacion-otros-ambitos">
                        También esperan decisión en:
                        {otrosAmbitos.map((o) => (
                            <a key={o.ambito} href={enlaceAmbito(o.ambito)} className="inline-flex min-h-11 items-center text-cyan-200 underline underline-offset-2">
                                {nombreDeAmbito(o.ambito)} ({o.decidibles})
                            </a>
                        ))}
                    </span>
                ) : null}
                <button type="button" onClick={() => void tras()} className={BOTON.neutro}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Releer
                </button>
            </p>

            {datos ? <AjustesAutomatico auto={datos.ajustes.auto} alGuardar={guardarAuto} /> : null}

            {errorLectura ? (
                <p role="alert" className="mc-centrado rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
                    {errorLectura}
                </p>
            ) : null}
            {cargando && !datos ? (
                <p className="mc-centrado flex items-center justify-center gap-2 text-xs text-white/75" role="status">
                    <Loader2 className={GIRO} aria-hidden /> Leyendo las propuestas…
                </p>
            ) : null}

            {datos ? (
                <>
                    <div className="flex flex-wrap items-end justify-center gap-3">
                        <label className="flex flex-col gap-0.5 text-[11px] text-white/80">
                            Tipo
                            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPropuesta | "todos")} className={`${CAMPO} h-11`}>
                                <option value="todos">Todos</option>
                                {TIPOS_PROPUESTA.map((t) => (
                                    <option key={t} value={t}>
                                        {NOMBRE_TIPO[t]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] text-white/80">
                            Fuente
                            <select value={fuente} onChange={(e) => setFuente(e.target.value as FuentePropuesta | "todas")} className={`${CAMPO} h-11`}>
                                <option value="todas">Todas</option>
                                {FUENTES.map((f) => (
                                    <option key={f} value={f}>
                                        {NOMBRE_FUENTE[f]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div role="tablist" aria-label="Qué propuestas ver" onKeyDown={alTeclaPestanas} className="flex flex-wrap justify-center gap-1.5">
                        {PESTANAS.map((x, i) => {
                            const n = filtradas.filter(x.entra).length;
                            return (
                                <button
                                    key={x.id}
                                    ref={(el) => {
                                        refPestanas.current[i] = el;
                                    }}
                                    type="button"
                                    role="tab"
                                    id={`imaginacion-pestana-${x.id}`}
                                    aria-selected={pestana === x.id}
                                    aria-controls="imaginacion-lista"
                                    tabIndex={pestana === x.id ? 0 : -1}
                                    onClick={() => setPestana(x.id)}
                                    className={`${BOTON_BASE} ${
                                        pestana === x.id ? "border-cyan-300/60 bg-cyan-400/15 text-white" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                                    }`}
                                >
                                    {x.texto} <span className="tabular-nums text-white/70">({n})</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* El lote: con las seleccionadas o con todas las por decidir. */}
                    <div className="mc-cristal mx-auto flex w-full max-w-4xl flex-col gap-2 p-2.5" data-testid="imaginacion-lote" aria-label="Decidir en lote" role="group">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-[11px] text-white/85 hover:bg-white/5">
                                <input
                                    type="checkbox"
                                    checked={todasVisiblesMarcadas}
                                    disabled={!visiblesDecidibles.length}
                                    onChange={(e) =>
                                        setSeleccion((s) => {
                                            const n = new Set(s);
                                            for (const p of visiblesDecidibles) {
                                                if (e.target.checked) n.add(p.id);
                                                else n.delete(p.id);
                                            }
                                            return n;
                                        })
                                    }
                                    className="h-5 w-5 cursor-pointer accent-cyan-300"
                                />
                                Seleccionar las que se ven
                            </label>
                            <span className="text-[11px] tabular-nums text-white/80" aria-live="polite">
                                Seleccionadas ({nSel}):
                            </span>
                            {(["integrar", "reimaginar", "rechazar"] as HacerLote[]).map((h) => (
                                <button
                                    key={`sel-${h}`}
                                    type="button"
                                    disabled={!nSel || ocupadoLote}
                                    aria-label={`${VERBO[h].infinitivo} seleccionadas`}
                                    onClick={() => pedirLote({ hacer: h, alcance: "seleccion" })}
                                    className={BOTON[h]}
                                >
                                    {VERBO[h].infinitivo}
                                </button>
                            ))}
                            <span className="text-[11px] tabular-nums text-white/80">Todas las por decidir ({nTodas}):</span>
                            {(["integrar", "reimaginar", "rechazar"] as HacerLote[]).map((h) => (
                                <button
                                    key={`todas-${h}`}
                                    type="button"
                                    disabled={!nTodas || ocupadoLote}
                                    aria-label={`${VERBO[h].infinitivo} todas`}
                                    onClick={() => pedirLote({ hacer: h, alcance: "todas" })}
                                    className={BOTON[h]}
                                >
                                    {VERBO[h].infinitivo}
                                </button>
                            ))}
                            {ocupadoLote ? <Loader2 className={`${GIRO} text-white/70`} aria-label="Decidiendo el lote" /> : null}
                        </div>

                        {lote?.hacer === "reimaginar" ? (
                            <FormularioReimaginar
                                idBase="imaginacion-lote-reimaginar"
                                textoBoton={lote.alcance === "todas" ? `Sí, reimaginar las ${nTodas}` : `Reimaginar ${cuantas(lote)}`}
                                aviso={avisoTodas(lote)}
                                ocupado={ocupadoLote}
                                alCancelar={() => setLote(null)}
                                alEnviar={(notas, referencias) => void ejecutarLote(lote, { notas, referencias })}
                            />
                        ) : lote ? (
                            <form
                                className="flex flex-wrap items-end justify-center gap-2 rounded-lg border border-white/10 bg-black/30 p-3"
                                data-testid="imaginacion-lote-confirmar"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void ejecutarLote(lote, lote.hacer === "rechazar" ? { motivo: motivoLote.trim() } : {});
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                        e.stopPropagation();
                                        setLote(null);
                                    }
                                }}
                            >
                                {avisoTodas(lote) ? <p className="w-full text-center text-[11px] text-amber-100">{avisoTodas(lote)}</p> : null}
                                {lote.hacer === "rechazar" ? (
                                    <label htmlFor="imaginacion-lote-motivo" className="flex min-w-48 flex-1 flex-col gap-0.5 text-[11px] text-white/85">
                                        Motivo (opcional)
                                        <input id="imaginacion-lote-motivo" maxLength={300} value={motivoLote} onChange={(e) => setMotivoLote(e.target.value)} className={`${CAMPO} h-11`} />
                                    </label>
                                ) : null}
                                <button type="button" onClick={() => setLote(null)} className={BOTON.neutro}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={ocupadoLote} className={BOTON[lote.hacer]}>
                                    {lote.alcance === "todas" ? `Sí, ${VERBO[lote.hacer].infinitivo.toLowerCase()} las ${nTodas}` : `${VERBO[lote.hacer].infinitivo} ${cuantas(lote)}`}
                                </button>
                            </form>
                        ) : null}

                        {resultadoLote ? (
                            <div role="status" data-testid="imaginacion-resultado-lote" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/85">
                                {resultadoLote.error ? (
                                    <p className="text-rose-100">No se intentó nada: {resultadoLote.error}</p>
                                ) : (
                                    (() => {
                                        const mal = resultadoLote.resultados.filter((x) => !x.ok);
                                        const bien = resultadoLote.resultados.length - mal.length;
                                        return (
                                            <>
                                                <p>
                                                    <b className="text-emerald-200">{bien} {VERBO[resultadoLote.hacer].participio}</b>
                                                    {mal.length ? (
                                                        <>
                                                            {" · "}
                                                            <b className="text-rose-200">{mal.length} fallaron</b> (siguen seleccionadas para reintentarlas)
                                                        </>
                                                    ) : null}
                                                    {!resultadoLote.resultados.length ? " · no había ninguna por decidir" : ""}
                                                </p>
                                                {mal.length ? (
                                                    <ul className="mt-1 space-y-0.5 text-rose-100">
                                                        {mal.map((x) => (
                                                            <li key={x.id}>
                                                                «{titulos.get(x.id) || x.id}» (<span className="font-mono">{x.id}</span>): {x.error ?? "sin motivo"}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </>
                                        );
                                    })()
                                )}
                            </div>
                        ) : null}
                    </div>

                    {respuesta ? (
                        <p role="status" className="mc-centrado flex items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">
                            <span>{respuesta}</span>
                            <button type="button" onClick={() => setRespuesta(null)} aria-label="Descartar el mensaje" className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80">
                                <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        </p>
                    ) : null}

                    <div id="imaginacion-lista" role="tabpanel" aria-labelledby={`imaginacion-pestana-${pestana}`} className="grid gap-2">
                        {pestana === "por-decidir" && visibles.length ? (
                            <p className="mc-centrado text-[11px] text-white/75">
                                {visibles.length} esperan tu aprobación o una respuesta.
                            </p>
                        ) : null}
                        {visibles.length ? (
                            <ul className="grid gap-2 md:grid-cols-2">
                                {visibles.map((p) => (
                                    <li key={p.id}>
                                        <TarjetaPropuesta
                                            p={p}
                                            titulos={titulos}
                                            seleccionada={seleccion.has(p.id)}
                                            alSeleccionar={alSeleccionar}
                                            alIrA={alIrA}
                                            alDecidido={alDecidido}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mc-centrado py-3 text-xs text-white/75">
                                {propuestas.length ? actual.vacio : `Sin propuestas de la imaginación en ${nombreDeAmbito(ambito)}.`}
                                {hayFiltro && propuestas.length ? " (con este filtro)" : ""}
                            </p>
                        )}
                    </div>
                </>
            ) : null}
        </section>
    );
}
