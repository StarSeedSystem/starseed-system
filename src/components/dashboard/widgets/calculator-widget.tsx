'use client';

// ════════════════════════════════════════════════════════════════
// CalculatorWidget — calculadora de verdad (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Cálculo 100 % local con un analizador propio (paquete-e/calculo.ts): sin eval ni
// new Function. Precedencia, paréntesis, potencias, raíz, π, porcentaje de
// calculadora («200 + 10 %» = 220), vista previa mientras escribes, copiar el
// resultado e historial local (últimos 30, compartido entre calculadoras).
// El teclado físico funciona SOLO con el widget enfocado (antes escuchaba toda la
// ventana y cualquier número escrito en otra parte acababa aquí).
// Composición por tamaño: micro = el resultado · s = pantalla + teclado mínimo ·
// m = pantalla + teclado · l = + historial (al lado si hay anchura) · xl = + fila
// científica · panorámico = pantalla a la izquierda y teclado a la derecha ·
// torre = pantalla, teclado e historial en columna. Táctil: teclas ≥ 44 px.
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Calculator, Copy, Check, Delete, History, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { BotonE, RaizE, estilosE, tintaE } from "./paquete-e/piezas";
import { aplicarTecla, calcular, formatearNumero, numeroParaExpresion, teclaACalculadora } from "./paquete-e/calculo";

// ── Historial local compartido ─────────────────────────────────────

interface Apunte { expr: string; valor: number; t: number }
const CLAVE_HISTORIAL = "starseed.calculadora.historial.v1";
const EVENTO_HISTORIAL = "starseed:calculadora";
const SIN_HISTORIAL: Apunte[] = [];
let cacheHistorial: Apunte[] | null = null;

function leerHistorial(): Apunte[] {
    if (typeof window === "undefined") return SIN_HISTORIAL;
    if (cacheHistorial) return cacheHistorial;
    try {
        const crudo = JSON.parse(window.localStorage.getItem(CLAVE_HISTORIAL) ?? "[]");
        cacheHistorial = Array.isArray(crudo) ? crudo.filter((a): a is Apunte => !!a && typeof a.expr === "string" && typeof a.valor === "number") : [];
    } catch {
        cacheHistorial = [];
    }
    return cacheHistorial;
}

function guardarHistorial(lista: Apunte[]) {
    cacheHistorial = lista.slice(0, 30);
    try { window.localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(cacheHistorial)); } catch { /* sin almacenamiento: queda en memoria */ }
    try { window.dispatchEvent(new CustomEvent(EVENTO_HISTORIAL)); } catch { /* sin eventos */ }
}

function suscribirHistorial(cb: () => void) {
    if (typeof window === "undefined") return () => undefined;
    const almacen = (e: StorageEvent) => { if (e.key === CLAVE_HISTORIAL) { cacheHistorial = null; cb(); } };
    window.addEventListener(EVENTO_HISTORIAL, cb);
    window.addEventListener("storage", almacen);
    return () => { window.removeEventListener(EVENTO_HISTORIAL, cb); window.removeEventListener("storage", almacen); };
}

// ── Teclas ─────────────────────────────────────────────────────────

type TipoTecla = "num" | "op" | "fn" | "igual";
interface DefTecla { k: string; tipo: TipoTecla; etiqueta?: string; ancha?: boolean }

const BASICAS: DefTecla[] = [
    { k: "C", tipo: "fn", etiqueta: "Borrar todo" }, { k: "⌫", tipo: "fn", etiqueta: "Borrar" }, { k: "%", tipo: "fn", etiqueta: "Porcentaje" }, { k: "÷", tipo: "op", etiqueta: "Dividir" },
    { k: "7", tipo: "num" }, { k: "8", tipo: "num" }, { k: "9", tipo: "num" }, { k: "×", tipo: "op", etiqueta: "Multiplicar" },
    { k: "4", tipo: "num" }, { k: "5", tipo: "num" }, { k: "6", tipo: "num" }, { k: "−", tipo: "op", etiqueta: "Restar" },
    { k: "1", tipo: "num" }, { k: "2", tipo: "num" }, { k: "3", tipo: "num" }, { k: "+", tipo: "op", etiqueta: "Sumar" },
    { k: "()", tipo: "fn", etiqueta: "Paréntesis" }, { k: "0", tipo: "num" }, { k: ",", tipo: "num", etiqueta: "Coma decimal" }, { k: "=", tipo: "igual", etiqueta: "Igual" },
];
const CIENTIFICAS: DefTecla[] = [
    { k: "(", tipo: "fn", etiqueta: "Abrir paréntesis" }, { k: ")", tipo: "fn", etiqueta: "Cerrar paréntesis" },
    { k: "√", tipo: "fn", etiqueta: "Raíz cuadrada" }, { k: "^", tipo: "fn", etiqueta: "Potencia" }, { k: "π", tipo: "fn", etiqueta: "Pi" },
];

function Tecla({ d, lienzo, alPulsar, alto }: { d: DefTecla; lienzo: LienzoE; alPulsar: (k: string) => void; alto: number }) {
    const a = lienzo.acento;
    const estilo: React.CSSProperties =
        d.tipo === "igual" ? { background: `linear-gradient(145deg, ${a}, ${conAlfa(a, 0.55)})`, color: "#fff", boxShadow: `0 8px 20px -10px ${conAlfa(a, 0.9)}, inset 0 1px 0 rgba(255,255,255,.3)` }
            : d.tipo === "op" ? { background: conAlfa(a, 0.16), color: tintaE(a), boxShadow: `inset 0 0 0 1px ${conAlfa(a, 0.35)}` }
                : d.tipo === "fn" ? { background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.72)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }
                    : { background: "rgba(255,255,255,.075)", color: "#fff", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" };
    const tam = Math.max(12, Math.min(lienzo.tv ? 30 : 24, alto * 0.42));
    return (
        <button
            type="button"
            onClick={() => alPulsar(d.k)}
            aria-label={d.etiqueta ?? d.k}
            title={d.etiqueta}
            className={cn(estilosE.tecla, "grid min-h-0 min-w-0 cursor-pointer select-none place-items-center font-medium outline-none hover:brightness-125 focus-visible:ring-2", d.ancha && "col-span-2")}
            style={{ ...estilo, fontSize: tam, ["--tw-ring-color" as string]: a } as React.CSSProperties}
        >
            {d.k === "⌫" ? <Delete aria-hidden style={{ width: tam * 0.9, height: tam * 0.9 }} /> : d.k === "()" ? "( )" : d.k}
        </button>
    );
}

function Teclado({ lienzo, alPulsar, cientifico, altoFila, className }: { lienzo: LienzoE; alPulsar: (k: string) => void; cientifico?: boolean; altoFila: number; className?: string }) {
    const hueco = lienzo.tactil ? 8 : altoFila < 30 ? 4 : 6;
    return (
        <div role="group" aria-label="Teclado de la calculadora" className={cn("grid min-h-0 flex-1", className)} style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "minmax(0, 1fr)", gap: hueco }}>
            {cientifico && (
                <div className="col-span-4 grid min-h-0" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: hueco }}>
                    {CIENTIFICAS.map((d) => <Tecla key={d.k} d={d} lienzo={lienzo} alPulsar={alPulsar} alto={altoFila} />)}
                </div>
            )}
            {BASICAS.map((d) => <Tecla key={d.k} d={d} lienzo={lienzo} alPulsar={alPulsar} alto={altoFila} />)}
        </div>
    );
}

// ── Widget ─────────────────────────────────────────────────────────

export function CalculatorWidget() {
    const { ref, lienzo } = useLienzoE();
    const [expr, setExpr] = useState("");
    const [fijado, setFijado] = useState<{ expr: string; valor: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const historial = useSyncExternalStore(suscribirHistorial, leerHistorial, () => SIN_HISTORIAL);

    const previa = useMemo(() => {
        if (!expr || /^[−-]?[\d,]+$/.test(expr)) return null;
        const r = calcular(expr);
        return r.ok ? r.valor : null;
    }, [expr]);

    const pulsar = useCallback((k: string) => {
        setCopiado(false);
        if (k === "=") {
            if (!expr) return;
            const r = calcular(expr);
            if (!r.ok) { setError(r.error === "Vacío" ? null : r.error); return; }
            setError(null);
            setFijado({ expr, valor: r.valor });
            guardarHistorial([{ expr, valor: r.valor, t: Date.now() }, ...leerHistorial().filter((a) => !(a.expr === expr && a.valor === r.valor))]);
            setExpr(numeroParaExpresion(r.valor));
            return;
        }
        setError(null);
        setExpr((prev) => {
            // Tras un «=», un número empieza de cero; un operador sigue con el resultado.
            const base = fijado && prev === numeroParaExpresion(fijado.valor) && /^[\d,(√π]$/.test(k) ? "" : prev;
            return aplicarTecla(base, k);
        });
        setFijado(null);
    }, [expr, fijado]);

    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = teclaACalculadora(e.key);
        if (!k) return;
        e.preventDefault();
        pulsar(k);
    };

    const copiar = async () => {
        const directo = calcular(expr);
        const valor = fijado?.valor ?? previa ?? (directo.ok ? directo.valor : null);
        if (valor === null || typeof navigator === "undefined" || !navigator.clipboard) return;
        try { await navigator.clipboard.writeText(formatearNumero(valor)); setCopiado(true); window.setTimeout(() => setCopiado(false), 1600); } catch { /* sin permiso de portapapeles */ }
    };

    const reutilizar = (a: Apunte) => { setExpr(numeroParaExpresion(a.valor)); setFijado({ expr: a.expr, valor: a.valor }); setError(null); };

    // ── Pantalla ──
    const principal = fijado ? formatearNumero(fijado.valor) : expr || "0";
    const secundaria = fijado ? `${fijado.expr} =` : previa !== null ? `= ${formatearNumero(previa)}` : "";
    const { base, clase, horizontal } = lienzo;
    const lado = Math.min(lienzo.ancho || 240, lienzo.alto || 240);
    const tamPrincipal = (max: number) => Math.max(18, Math.min(max, max * (12 / Math.max(12, principal.length + 2))));

    // Funciones de pintado (no componentes: así no se remontan en cada tecla y el foco se conserva).
    const pantalla = ({ grande = 44, conCopiar = true }: { grande?: number; conCopiar?: boolean }) => (
        <div className="relative flex min-w-0 shrink-0 flex-col items-end justify-end gap-0.5 px-1" aria-live="polite">
            <span className="w-full truncate text-right tabular-nums text-white/50" style={{ fontSize: px(lienzo, 12), minHeight: 16 }} title={secundaria}>
                {secundaria || " "}
            </span>
            <span className="flex w-full min-w-0 items-center justify-end gap-2">
                {conCopiar && (fijado || previa !== null) && (
                    <BotonE lienzo={lienzo} variante="fantasma" compacto icono={copiado ? Check : Copy} etiqueta={copiado ? "Copiado" : "Copiar resultado"} onClick={copiar} />
                )}
                <output
                    className="min-w-0 truncate text-right tabular-nums text-white"
                    style={{ fontSize: tamPrincipal(grande), fontWeight: 250, letterSpacing: "-0.02em", lineHeight: 1.05 }}
                    title={principal}
                    aria-label={`Resultado: ${principal}`}
                >
                    {principal}
                </output>
            </span>
            {error && <span role="alert" className="text-[11px] font-medium text-rose-300">{error}</span>}
        </div>
    );

    const historialEl = ({ max, compacto }: { max: number; compacto?: boolean }) => (
        <section aria-label="Historial de cálculos" className="flex min-h-0 min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 text-white/55">
                <History aria-hidden className="size-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Historial</span>
                <span className="flex-1" />
                {historial.length > 0 && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Trash2} etiqueta="Vaciar historial" onClick={() => guardarHistorial([])} />}
            </div>
            {historial.length === 0 ? (
                <p className="text-[12px] text-white/45">Vacío: tus cálculos aparecerán aquí.</p>
            ) : (
                <ol className={cn("flex min-h-0 flex-col gap-0.5", estilosE.desliza)}>
                    {historial.slice(0, max).map((a) => (
                        <li key={`${a.t}-${a.expr}`}>
                            <button type="button" onClick={() => reutilizar(a)} title="Usar este resultado"
                                className="flex w-full min-w-0 cursor-pointer flex-col items-end rounded-xl px-2 py-1 text-right transition-colors duration-150 hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:outline-none">
                                {!compacto && <span className="w-full truncate text-[11px] tabular-nums text-white/45">{a.expr} =</span>}
                                <span className="w-full truncate text-[14px] tabular-nums text-white/90">{formatearNumero(a.valor)}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );

    const raiz = { lienzo, refRaiz: ref, etiqueta: "Calculadora", tipo: "CALCULATOR", onKeyDown: alTeclear, tabIndex: 0 } as const;

    // micro: solo el resultado (enfocado, se puede teclear).
    if (base === "micro") {
        return (
            <RaizE {...raiz}>
                {/* (Pulido 0930) Icono y resultado en fila si la tesela es apaisada. */}
                <div className={cn("flex h-full items-center justify-center px-1.5 text-center", lienzo.ancho >= lienzo.alto * 1.15 || lienzo.alto < 60 ? "flex-row gap-2" : "flex-col gap-1")}>
                    <Calculator aria-hidden className="size-4 shrink-0" style={{ color: tintaE(lienzo.acento) }} />
                    <output className="max-w-full truncate tabular-nums text-white" style={{ fontSize: Math.max(16, lado * 0.22), fontWeight: 300 }} aria-label={`Resultado: ${principal}`}>{principal}</output>
                </div>
            </RaizE>
        );
    }

    // panorámico: pantalla a la izquierda, teclado a la derecha.
    if (horizontal) {
        const altoFila = Math.max(18, ((lienzo.alto || 150) - 8) / 5 - 6);
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 gap-3 p-1">
                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-white/60"><Calculator aria-hidden className="size-4" style={{ color: tintaE(lienzo.acento) }} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Calculadora</span></div>
                        {pantalla({ grande: Math.min(48, (lienzo.alto || 150) * 0.32) })}
                    </div>
                    <div className="flex min-h-0 shrink-0 flex-col" style={{ width: Math.min(360, Math.max(200, (lienzo.ancho || 600) * 0.48)) }}>
                        <Teclado lienzo={lienzo} alPulsar={pulsar} altoFila={altoFila} />
                    </div>
                </div>
            </RaizE>
        );
    }

    // torre: todo en columna, con historial abajo.
    if (clase === "torre") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {pantalla({ grande: 36 })}
                    <div className="flex min-h-0" style={{ flex: "1 1 60%" }}><Teclado lienzo={lienzo} alPulsar={pulsar} altoFila={34} /></div>
                    <div className="min-h-0" style={{ flex: "1 1 30%" }}>{historialEl({ max: 6, compacto: true })}</div>
                </div>
            </RaizE>
        );
    }

    const grande = base === "l" || base === "xl";
    const ancho = lienzo.ancho || 0;
    const alLado = grande && ancho > (lienzo.alto || 0) * 1.25 && ancho >= 420;
    const altoTeclado = (lienzo.alto || 240) - (base === "s" ? 44 : 70) - (grande && !alLado ? 84 : 0);
    const filas = base === "xl" ? 6 : 5;
    const altoFila = Math.max(16, altoTeclado / filas - 6);

    return (
        <RaizE {...raiz}>
            <div className={cn("flex h-full min-h-0 gap-3 p-1", alLado ? "flex-row" : "flex-col gap-2")}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                    {pantalla({ grande: base === "s" ? 26 : base === "m" ? 38 : 46, conCopiar: base !== "s" })}
                    <Teclado lienzo={lienzo} alPulsar={pulsar} cientifico={base === "xl"} altoFila={altoFila} />
                </div>
                {grande && (
                    <div className={cn("min-h-0 min-w-0", alLado ? "w-[38%] shrink-0" : "shrink-0")} style={alLado ? undefined : { maxHeight: 84 }}>
                        {historialEl({ max: alLado ? 12 : 2, compacto: !alLado })}
                    </div>
                )}
            </div>
        </RaizE>
    );
}
