"use client";

/**
 * Chats de Genesis · «Emparejar este aparato» (GEN1114F · 2026-11-13, contrato GEN1114 §3.3, §3.8, §3.9 y §8.5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un aparato sin emparejar LEE, pero no escribe: en lugar del cuadro de texto aparece esta tarjeta.
 * Emparejar crea aquí una clave que no se puede exportar, manda la solicitud a la puerta y enseña en
 * grande el código que Alex teclea en la Mac (con su contraseña de administrador). Mientras espera,
 * pregunta a la puerta cada 5 s. Lo que dice la puerta es solo información («según la puerta del
 * A1»): quien decide es la Mac, y la primera entrada lo comprobará.
 *
 * Cada paso dice la verdad: sin WebCrypto o IndexedDB, la clave perdida, la solicitud caducada, el
 * aparato retirado. Nada se firma aquí: emparejar no envía mensajes.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyRound, Loader2, MonitorSmartphone, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";

import { AvisoSesion } from "@/components/auth/aviso-sesion";
import { CONSULTA_CADA_MS, consultarEmparejamiento, crearClienteAparatos, pedirEmparejar, type ClienteAparatos } from "@/lib/chats-genesis/emparejar";
import { MAX_NOMBRE_APARATO, aparatoLocal, claveAparatoPerdida, cuentaDeSesion, soporteFirma, type AparatoLocal } from "@/lib/chats-genesis/firma-aparato";
import { cn } from "@/lib/utils";

import { momentoTexto } from "./cabecera-espejo";

export interface EmparejarAparatoProps {
    clienteAparatos?: ClienteAparatos;
    alCambiar?: (a: AparatoLocal | null) => void;
}

/** Minutos que vive una solicitud en la puerta (§3.3). */
export const MINUTOS_SOLICITUD = 15;

export const TEXTO_SIN_EMPAREJAR = "Este aparato puede leer, pero aún no escribir. Para escribir, emparéjalo en tu Mac: solo se hace una vez y con la Mac delante.";
export const TEXTO_SIN_SOPORTE = "Este navegador no puede guardar una clave propia (¿ventana privada?). Abre Genesis en una ventana normal o en la app.";
const ORDEN_MAC = "python3 scripts/puente/genesis_aparatos.py emparejar";

type Fase =
    | { tipo: "comprobando" }
    | { tipo: "sin-soporte"; motivo: string }
    | { tipo: "sin-sesion" }
    | { tipo: "perdida"; vistoPorUltima: string | null }
    | { tipo: "aparato"; aparato: AparatoLocal | null };

async function cuentaPropia(): Promise<string | null> {
    try {
        const sb = (await import("@/utils/supabase/client")).createClient();
        const { data } = await sb.auth.getSession();
        const jwt = data.session?.access_token;
        return jwt ? cuentaDeSesion(jwt) : null;
    } catch {
        return null;
    }
}

/** El código en tres grupos que no se parten nunca (§10). */
export function CodigoGrande({ codigo, pequeno = false }: { codigo: string; pequeno?: boolean }) {
    const grupos = codigo.split("-");
    return (
        <span data-testid="codigo-aparato" aria-label={`Código ${grupos.join(" ")}`} className={cn("inline-flex flex-wrap justify-center gap-x-2 gap-y-1 font-mono font-semibold tracking-[0.12em] text-cyan-100", pequeno ? "text-[13px]" : "text-[26px] sm:text-[32px]")}>
            {grupos.map((g, i) => (
                <span key={i} className="whitespace-nowrap">{g}{i < grupos.length - 1 ? <span aria-hidden className="text-white/30">-</span> : null}</span>
            ))}
        </span>
    );
}

/** «a las 14:05» hoy y «el 13-11 a las 23:40» otro día (SUP1114A: antes salía «a las el 13-11 a las 23:40»). */
function aLas(ms: number): string {
    const t = momentoTexto(ms, Date.now());
    return t.startsWith("el ") ? t : `a ${t}`;
}

export function EmparejarAparato({ clienteAparatos, alCambiar }: EmparejarAparatoProps) {
    const cliente = useRef<ClienteAparatos | null>(clienteAparatos ?? null);
    if (!cliente.current) cliente.current = crearClienteAparatos();
    const [fase, setFase] = useState<Fase>({ tipo: "comprobando" });
    const [cuenta, setCuenta] = useState<string | null>(null);
    const [nombre, setNombre] = useState("");
    const [pidiendo, setPidiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Sin sesión al pulsar «Emparejar»: el aviso común de sesión (con «Iniciar sesión» y la guía, GUI1021N), no una frase suelta.
    const [pideSesion, setPideSesion] = useState(false);
    const [ahora, setAhora] = useState(() => Date.now());
    const alCambiarRef = useRef(alCambiar);
    alCambiarRef.current = alCambiar;

    const poner = useCallback((a: AparatoLocal | null) => {
        setFase({ tipo: "aparato", aparato: a });
        alCambiarRef.current?.(a);
    }, []);

    useEffect(() => {
        let vivo = true;
        void (async () => {
            const soporte = await soporteFirma().catch(() => ({ ok: false as const, motivo: "sin-indexeddb" as const }));
            if (!vivo) return;
            if (!soporte.ok) {
                setFase({ tipo: "sin-soporte", motivo: soporte.motivo });
                return;
            }
            const [a, c] = await Promise.all([aparatoLocal().catch(() => null), cuentaPropia()]);
            if (!vivo) return;
            setCuenta(c);
            if (a) {
                setFase({ tipo: "aparato", aparato: a });
                return;
            }
            const perdida = await claveAparatoPerdida().catch(() => null);
            if (!vivo) return;
            if (perdida) setFase({ tipo: "perdida", vistoPorUltima: perdida.vistoPorUltima });
            else if (!c) setFase({ tipo: "sin-sesion" });
            else setFase({ tipo: "aparato", aparato: null });
        })();
        return () => { vivo = false; };
    }, []);

    const aparato = fase.tipo === "aparato" ? fase.aparato : null;
    const pendiente = aparato?.estado === "pendiente";
    const desdeMs = aparato?.desde ? Date.parse(aparato.desde) : NaN;
    const caducaMs = Number.isFinite(desdeMs) ? desdeMs + MINUTOS_SOLICITUD * 60_000 : NaN;
    const caducada = pendiente && Number.isFinite(caducaMs) && ahora > caducaMs;

    // Mientras espera: pregunta a la puerta cada 5 s y avanza el reloj de «caduca a las…».
    useEffect(() => {
        if (!pendiente || caducada) return;
        let vivo = true;
        const mirar = async () => {
            setAhora(Date.now());
            const nuevo = await consultarEmparejamiento(cliente.current!).catch(() => null);
            if (!vivo || !nuevo) return;
            if (nuevo.estado !== "pendiente") poner(nuevo);
        };
        const id = window.setInterval(() => void mirar(), CONSULTA_CADA_MS);
        return () => { vivo = false; window.clearInterval(id); };
    }, [pendiente, caducada, poner]);

    const emparejar = async () => {
        const limpio = nombre.trim();
        setPideSesion(false);
        if (!limpio) { setError("Pon un nombre para reconocer este aparato en la Mac (p. ej. «iPhone de Alex»)"); return; }
        if (!cuenta) { setError(null); setPideSesion(true); return; }
        setPidiendo(true);
        setError(null);
        const r = await pedirEmparejar(cliente.current!, { nombre: limpio.slice(0, MAX_NOMBRE_APARATO), cuenta }).catch((e: unknown) => ({
            ok: false as const, codigo: "fallo", error: e instanceof Error ? e.message : "No se pudo pedir", aparato: null,
        }));
        setPidiendo(false);
        setAhora(Date.now());
        if (r.ok) poner(r.aparato);
        else setError(r.error);
    };

    // ── Pantallas ────────────────────────────────────────────────────────────

    if (fase.tipo === "comprobando") {
        return <Marco><p role="status" className="flex items-center gap-2 text-[12px] text-white/55"><Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> Comprobando la clave de este aparato…</p></Marco>;
    }
    if (fase.tipo === "sin-soporte") {
        return <Marco tono="aviso" icono={ShieldAlert}><p className="text-[13px] leading-snug">{TEXTO_SIN_SOPORTE}</p></Marco>;
    }
    if (fase.tipo === "sin-sesion") {
        return <Marco icono={KeyRound}><p className="text-[13px] leading-snug">{TEXTO_SIN_EMPAREJAR}</p><p className="text-[12px] text-white/55">Inicia sesión en este aparato para emparejarlo.</p></Marco>;
    }

    const formulario = (boton: string) => (
        <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); if (!pidiendo) void emparejar(); }}
        >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-white/55">
                Nombre de este aparato
                <input
                    value={nombre}
                    maxLength={MAX_NOMBRE_APARATO}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="p. ej. iPhone de Alex"
                    className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-background/50 px-3 text-[15px] text-white placeholder:text-white/35 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
            </label>
            <button type="submit" disabled={pidiendo} className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50">
                {pidiendo ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <MonitorSmartphone className="size-4" aria-hidden />}
                {boton}
            </button>
        </form>
    );
    const fallo = pideSesion ? <AvisoSesion compacto texto="Inicia sesión para emparejar este aparato" /> : error ? <p role="alert" data-testid="error-emparejar" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-100">{error}</p> : null;

    if (fase.tipo === "perdida") {
        const cuando = fase.vistoPorUltima ? momentoTexto(Date.parse(fase.vistoPorUltima), Date.now()) : null;
        return (
            <Marco tono="aviso" icono={ShieldAlert}>
                <p className="text-[13px] leading-snug">
                    La clave de este aparato ya no está (se borraron los datos del sitio{cuando ? `; se vio por última vez ${cuando}` : ""}). Empareja de nuevo; el aparato viejo queda retirado en la Mac cuando lo revoques.
                </p>
                {cuenta ? formulario("Emparejar de nuevo") : <p className="text-[12px] text-white/55">Inicia sesión en este aparato para emparejarlo.</p>}
                {fallo}
            </Marco>
        );
    }

    if (!aparato || aparato.estado === "sin-emparejar") {
        return (
            <Marco icono={KeyRound} testid="tarjeta-sin-emparejar">
                <p className="text-[13px] leading-snug">{TEXTO_SIN_EMPAREJAR}</p>
                {formulario("Emparejar este aparato")}
                {fallo}
            </Marco>
        );
    }

    if (aparato.estado === "revocado") {
        const cuando = aparato.desde ? momentoTexto(Date.parse(aparato.desde), Date.now()) : null;
        return (
            <Marco tono="aviso" icono={ShieldAlert} testid="tarjeta-retirado">
                <p className="text-[13px] leading-snug">Este aparato fue retirado en la Mac{cuando ? ` ${cuando.startsWith("el ") ? cuando : `a ${cuando}`}` : ""}. Para volver a escribir, emparéjalo de nuevo.</p>
                {formulario("Emparejar de nuevo")}
                {fallo}
            </Marco>
        );
    }

    if (pendiente && caducada) {
        return (
            <Marco tono="aviso" icono={RotateCcw} testid="tarjeta-caducada">
                <p className="text-[13px] leading-snug">La solicitud caducó {aLas(caducaMs)} sin confirmarse en la Mac. Pide otra.</p>
                {formulario("Pedir otra")}
                {fallo}
            </Marco>
        );
    }

    if (pendiente) {
        return (
            <Marco icono={KeyRound} testid="tarjeta-pendiente">
                <div className="flex flex-col items-center gap-1 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-3 text-center">
                    <CodigoGrande codigo={aparato.codigo} />
                    <p className="break-words text-[12px] text-white/70 [overflow-wrap:anywhere]">«{aparato.nombre}» · cuenta {aparato.cuenta.slice(0, 8)}</p>
                </div>
                <p className="text-[12.5px] leading-snug">
                    En tu Mac, haz doble clic en «Emparejar aparato» del Escritorio (o, en una terminal: <code className="break-all rounded bg-white/[0.06] px-1 text-[11.5px]">{ORDEN_MAC}</code>). Te pedirá este código y la contraseña de la Mac.
                </p>
                <p role="status" data-testid="espera-emparejar" className="flex items-center gap-1.5 text-[12px] text-white/55">
                    <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
                    {Number.isFinite(desdeMs) ? `Esperando desde ${momentoTexto(desdeMs, Date.now())} (caduca ${aLas(caducaMs)}).` : "Esperando a la Mac."}
                </p>
            </Marco>
        );
    }

    // Emparejado (según la puerta): normalmente el hilo ya enseña el cuadro de texto en su lugar.
    const cuando = aparato.desde ? momentoTexto(Date.parse(aparato.desde), Date.now()) : null;
    return (
        <Marco tono="bien" icono={ShieldCheck} testid="tarjeta-emparejado">
            <p className="text-[13px] leading-snug">
                Emparejado en la Mac{cuando ? ` ${cuando.startsWith("el ") ? cuando : `a ${cuando}`}` : ""} (según la puerta del A1). Escribe con la clave de este aparato · código <CodigoGrande codigo={aparato.codigo} pequeno />
            </p>
            <p className="text-[12px] text-white/55">{aparato.nivel === "completo" ? "Nivel completo: puede poner agentes a trabajar." : "Nivel texto: escribe en el hilo y pide el estado; para poner agentes a trabajar, emparéjalo como completo en la Mac."}</p>
        </Marco>
    );
}

function Marco({ children, tono = "normal", icono: Icono = KeyRound, testid = "emparejar-aparato" }: { children: ReactNode; tono?: "normal" | "aviso" | "bien"; icono?: typeof KeyRound; testid?: string }) {
    return (
        <section
            data-testid={testid}
            aria-label="Emparejar este aparato"
            className={cn(
                "flex max-h-[55dvh] flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-2xl border p-3 text-white/85",
                tono === "aviso" ? "border-amber-400/30 bg-amber-500/[0.07]" : tono === "bien" ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]",
            )}
        >
            <div className="flex items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <Icono className={cn("size-4", tono === "aviso" ? "text-amber-200" : tono === "bien" ? "text-emerald-300" : "text-cyan-300")} aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">{children}</div>
            </div>
        </section>
    );
}

export default EmparejarAparato;
