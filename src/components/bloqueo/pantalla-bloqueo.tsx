"use client";
/**
 * Pantalla de bloqueo (Ola 382 · BLQ5). Cubre todo el OS con un velo difuminado y un
 * degradado violeta→turquesa muy oscuro: la hora grande sobre un orbe que respira, la fecha
 * y cuántos avisos hay (sin su contenido: privacidad). Se desbloquea con la biometría de la
 * plataforma (passkey verificada de verdad, BLQ3) o con el PIN / la contraseña (PBKDF2, BLQ1),
 * con la espera creciente tras varios fallos guardada en la neurona (recargar no la salta).
 * Esc no la cierra.
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Delete, Fingerprint, KeyRound, Lock } from "lucide-react";
import type { ConfigBloqueo } from "@/lib/bloqueo/politica-bloqueo";
import { esperaRestante, registrarFallo, verificarSecreto, type EstadoIntentos, type SecretoGuardado } from "@/lib/bloqueo/secreto-local";
import { desbloquearConPasskey } from "@/lib/bloqueo/passkey-verificacion";
import { useAhora } from "@/components/widgets-libres/familias/comun";

const CLAVE_INTENTOS = "starseed.bloqueo.intentos.v1";

const SIN_FALLOS: EstadoIntentos = { fallos: 0, bloqueadoHasta: 0 };
/** Los fallos se guardan en la neurona: recargar la página no se salta la espera. */
function leerIntentos(): EstadoIntentos {
    try { const e = JSON.parse(localStorage.getItem(CLAVE_INTENTOS) || "null"); return e && typeof e.fallos === "number" ? e : SIN_FALLOS; } catch { return SIN_FALLOS; }
}
function guardarIntentos(e: EstadoIntentos) {
    try { if (e.fallos === 0) localStorage.removeItem(CLAVE_INTENTOS); else localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(e)); } catch { /* sin almacén */ }
}

function Teclado({ onDigito, onBorrar, onOk, deshabilitado }: { onDigito: (d: string) => void; onBorrar: () => void; onOk: () => void; deshabilitado: boolean }) {
    const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "ok"];
    return (
        <div className="grid grid-cols-3 gap-4" role="group" aria-label="Teclado del PIN">
            {teclas.map((t) => (
                <button key={t} type="button" disabled={deshabilitado}
                    onClick={() => (t === "borrar" ? onBorrar() : t === "ok" ? onOk() : onDigito(t))}
                    aria-label={t === "borrar" ? "Borrar" : t === "ok" ? "Desbloquear" : t}
                    className="grid size-16 cursor-pointer place-items-center rounded-full ss-redondo text-2xl font-light text-white transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: t === "ok" ? "radial-gradient(closest-side,#23d5ab66,#23d5ab14)" : "radial-gradient(closest-side,#ffffff22,#ffffff06)" }}>
                    {t === "borrar" ? <Delete className="size-5" /> : t === "ok" ? <KeyRound className="size-5" /> : t}
                </button>
            ))}
        </div>
    );
}

export function PantallaBloqueo({ cfg, avisos, onDesbloqueado }: { cfg: ConfigBloqueo; avisos?: number; onDesbloqueado: () => void }) {
    const ahora = useAhora(1000);
    const reducido = useReducedMotion();
    const secretoPrincipal: SecretoGuardado | undefined = cfg.metodo === "biometria" ? cfg.respaldo : cfg.secreto;
    const [modo, setModo] = React.useState<"biometria" | "secreto">(cfg.metodo === "biometria" && cfg.passkey ? "biometria" : "secreto");
    const [entrada, setEntrada] = React.useState("");
    const [error, setError] = React.useState("");
    const [ocupado, setOcupado] = React.useState(false);
    const [intentos, setIntentos] = React.useState<EstadoIntentos>(leerIntentos);
    const principal = React.useRef<HTMLButtonElement | HTMLInputElement | null>(null);
    const espera = ahora ? esperaRestante(intentos, ahora.getTime()) : 0;
    const esPin = secretoPrincipal?.metodo === "pin";

    React.useEffect(() => { principal.current?.focus(); }, [modo]);

    const exito = () => { guardarIntentos(SIN_FALLOS); onDesbloqueado(); };
    const fallo = (msg: string) => {
        const nuevo = registrarFallo(intentos, Date.now());
        setIntentos(nuevo); guardarIntentos(nuevo); setError(msg); setEntrada("");
    };
    const probarSecreto = async () => {
        if (!secretoPrincipal || !entrada || espera > 0 || ocupado) return;
        setOcupado(true);
        try { (await verificarSecreto(secretoPrincipal, entrada)) ? exito() : fallo(esPin ? "PIN incorrecto" : "Contraseña incorrecta"); }
        finally { setOcupado(false); }
    };
    const probarBiometria = async () => {
        if (!cfg.passkey || ocupado) return;
        setOcupado(true); setError("");
        try { (await desbloquearConPasskey(cfg.passkey)) ? exito() : setError("No se pudo verificar la huella o el rostro. Prueba otra vez o usa el PIN."); }
        finally { setOcupado(false); }
    };

    // Teclado físico para el PIN; Esc no hace nada a propósito.
    React.useEffect(() => {
        if (modo !== "secreto" || !esPin) return;
        const k = (e: KeyboardEvent) => {
            if (/^\d$/.test(e.key)) setEntrada((v) => (v.length < 12 ? v + e.key : v));
            else if (e.key === "Backspace") setEntrada((v) => v.slice(0, -1));
            else if (e.key === "Enter") void probarSecreto();
            else if (e.key === "Escape") e.preventDefault();
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    });

    const hora = ahora ? ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
    const fecha = ahora ? ahora.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";

    return (
        <motion.div role="dialog" aria-modal="true" aria-label="Pantalla de bloqueo"
            initial={reducido ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2147483000] flex flex-col items-center justify-between overflow-hidden px-6 py-12 text-white backdrop-blur-2xl"
            style={{ background: "radial-gradient(120% 90% at 50% 20%, #2a1a6ecc, #06121acc 60%, #020409f2)" }}>
            <div className="relative flex flex-col items-center gap-2 pt-6">
                <div aria-hidden className="ss-respirar absolute -top-10 size-64 rounded-full ss-redondo" style={{ ["--ss-dur" as string]: "7s", background: "radial-gradient(closest-side,#7c5cff55,#23d5ab22 60%,transparent)" }} />
                <span className="relative text-7xl font-extralight tabular-nums tracking-tight sm:text-8xl">{hora}</span>
                <span className="relative text-sm text-white/75 first-letter:uppercase">{fecha}</span>
                {typeof avisos === "number" && avisos > 0 && <span className="relative mt-2 text-xs text-white/60">{avisos} {avisos === 1 ? "aviso" : "avisos"}</span>}
            </div>

            <div className="flex flex-col items-center gap-5">
                {modo === "biometria" ? (
                    <>
                        <button ref={(n) => { principal.current = n; }} type="button" onClick={probarBiometria} disabled={ocupado}
                            className="grid size-24 cursor-pointer place-items-center rounded-full ss-redondo transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:opacity-60"
                            style={{ background: "radial-gradient(closest-side,#23d5ab66,#7c5cff22 70%,transparent)" }}
                            aria-label="Desbloquear con huella o rostro">
                            <Fingerprint className="size-10" />
                        </button>
                        <span className="text-sm text-white/80">Desbloquear con huella o rostro</span>
                        {cfg.respaldo && <button type="button" onClick={() => { setModo("secreto"); setError(""); }} className="cursor-pointer text-xs text-teal-200 underline-offset-4 hover:underline">Usar PIN</button>}
                    </>
                ) : !secretoPrincipal ? (
                    <p className="max-w-xs text-center text-sm text-white/80">Este dispositivo no tiene un PIN de respaldo guardado. Usa la biometría.</p>
                ) : esPin ? (
                    <>
                        <div className="flex h-4 items-center gap-2" aria-live="polite" aria-label={`${entrada.length} dígitos`}>
                            {Array.from({ length: Math.max(4, entrada.length) }, (_, i) => (
                                <span key={i} className="size-3 rounded-full ss-redondo transition-colors" style={{ background: i < entrada.length ? "#23d5ab" : "#ffffff33" }} />
                            ))}
                        </div>
                        <Teclado deshabilitado={espera > 0 || ocupado} onDigito={(d) => setEntrada((v) => (v.length < 12 ? v + d : v))} onBorrar={() => setEntrada((v) => v.slice(0, -1))} onOk={probarSecreto} />
                    </>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); void probarSecreto(); }} className="flex items-center gap-2 rounded-full ss-redondo bg-white/10 py-1 pl-4 pr-1">
                        <Lock className="size-4 text-white/60" />
                        <input ref={(n) => { principal.current = n; }} type="password" autoComplete="current-password" value={entrada} onChange={(e) => setEntrada(e.target.value)}
                            disabled={espera > 0 || ocupado} aria-label="Contraseña" placeholder="Contraseña" className="w-56 bg-transparent py-2 text-sm text-white placeholder:text-white/40 focus:outline-none" />
                        <button type="submit" aria-label="Desbloquear" disabled={espera > 0 || ocupado} className="grid size-9 cursor-pointer place-items-center rounded-full ss-redondo bg-teal-500/40 hover:bg-teal-500/60 disabled:opacity-50"><KeyRound className="size-4" /></button>
                    </form>
                )}
                <p role="alert" className="min-h-[1.25rem] text-center text-xs text-rose-200">
                    {espera > 0 ? `Demasiados intentos. Espera ${Math.ceil(espera / 1000)} s.` : error}
                </p>
                {modo === "secreto" && cfg.metodo === "biometria" && cfg.passkey && (
                    <button type="button" onClick={() => { setModo("biometria"); setError(""); }} className="cursor-pointer text-xs text-teal-200 underline-offset-4 hover:underline">Usar huella o rostro</button>
                )}
            </div>
        </motion.div>
    );
}

export default PantallaBloqueo;
