"use client";
/**
 * Configurar el bloqueo de ESTA neurona (Ola 382 · BLQ6): sin bloqueo (de fábrica), PIN,
 * contraseña o huella/rostro con un PIN de respaldo. El secreto nunca se muestra ni se guarda
 * en claro (PBKDF2, BLQ1); de la biometría solo se guarda la clave pública (BLQ2).
 */
import * as React from "react";
import { Fingerprint, KeyRound, Lock, LockOpen } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import type { TipoForma } from "@/lib/widgets/forma/formas";
import { crearSecreto } from "@/lib/bloqueo/secreto-local";
import { biometriaDisponible, registrarPasskey, type PasskeyGuardada } from "@/lib/bloqueo/passkey-registro";
import { guardarConfigBloqueo, leerConfigBloqueo, SIN_BLOQUEO, type ConfigBloqueo, type MetodoBloqueo } from "@/lib/bloqueo/politica-bloqueo";

const METODOS: { id: MetodoBloqueo; titulo: string; forma: TipoForma; acento: string; Icono: typeof Lock }[] = [
    { id: "ninguno", titulo: "Sin bloqueo", forma: "orbe", acento: "#64748b", Icono: LockOpen },
    { id: "pin", titulo: "PIN", forma: "hexagono", acento: "#23d5ab", Icono: KeyRound },
    { id: "contrasena", titulo: "Contraseña", forma: "capsula", acento: "#7c5cff", Icono: Lock },
    { id: "biometria", titulo: "Huella o rostro", forma: "gota", acento: "#10B981", Icono: Fingerprint },
];
const MINUTOS = [0, 1, 5, 15, 30];
const campo = "w-full rounded-full ss-redondo bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300";

export function ConfigurarBloqueo({ neuronaId, nombreNeurona, onGuardado }: { neuronaId: string; nombreNeurona: string; onGuardado?: (c: ConfigBloqueo) => void }) {
    const [cfg, setCfg] = React.useState<ConfigBloqueo>(SIN_BLOQUEO);
    const [metodo, setMetodo] = React.useState<MetodoBloqueo>("ninguno");
    const [bio, setBio] = React.useState<boolean | null>(null);
    const [a, setA] = React.useState("");
    const [b, setB] = React.useState("");
    const [passkey, setPasskey] = React.useState<PasskeyGuardada | undefined>();
    const [alAbrir, setAlAbrir] = React.useState(true);
    const [minutos, setMinutos] = React.useState(5);
    const [aviso, setAviso] = React.useState<{ ok: boolean; texto: string } | null>(null);
    const [ocupado, setOcupado] = React.useState(false);

    React.useEffect(() => {
        const c = leerConfigBloqueo(neuronaId);
        setCfg(c); setMetodo(c.metodo); setPasskey(c.passkey);
        if (c.metodo !== "ninguno") { setAlAbrir(c.alAbrir); setMinutos(c.minutosInactividad); }
        biometriaDisponible().then(setBio);
    }, [neuronaId]);

    const esPin = metodo === "pin" || metodo === "biometria";
    const guardar = async () => {
        setAviso(null);
        try {
            setOcupado(true);
            let nueva: ConfigBloqueo = { ...SIN_BLOQUEO };
            if (metodo !== "ninguno") {
                if (a !== b) throw new Error(esPin ? "Los dos PIN no coinciden." : "Las dos contraseñas no coinciden.");
                const secreto = await crearSecreto(esPin ? "pin" : "contrasena", a);
                nueva = metodo === "biometria"
                    ? { metodo, alAbrir, minutosInactividad: minutos, passkey, respaldo: secreto, v: 1 }
                    : { metodo, alAbrir, minutosInactividad: minutos, secreto, v: 1 };
            }
            guardarConfigBloqueo(neuronaId, nueva);
            setCfg(nueva); setA(""); setB("");
            setAviso({ ok: true, texto: metodo === "ninguno" ? "Este dispositivo queda sin bloqueo." : "Bloqueo guardado en este dispositivo." });
            onGuardado?.(nueva);
        } catch (e) {
            setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar." });
        } finally {
            setOcupado(false);
        }
    };
    const registrar = async () => {
        setAviso(null);
        try { setOcupado(true); setPasskey(await registrarPasskey(nombreNeurona)); setAviso({ ok: true, texto: "Huella o rostro registrado. Ahora elige un PIN de respaldo." }); }
        catch (e) { setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo registrar." }); }
        finally { setOcupado(false); }
    };

    return (
        <div className="flex flex-col gap-4 text-white">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Método de bloqueo">
                {METODOS.map((m) => {
                    const sinBio = m.id === "biometria" && bio === false;
                    const activo = metodo === m.id;
                    return (
                        <button key={m.id} type="button" role="radio" aria-checked={activo} disabled={sinBio}
                            title={sinBio ? "Este navegador o dispositivo no permite verificar la biometría." : undefined}
                            onClick={() => { setMetodo(m.id); setAviso(null); setA(""); setB(""); }}
                            className="h-28 cursor-pointer rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40">
                            <WidgetLibre forma={m.forma} acento={m.acento} etiqueta={m.titulo} intensidad={activo ? 0.85 : 0.2}>
                                <span className="flex h-full flex-col items-center justify-center gap-1 text-center">
                                    <m.Icono className="size-5" style={{ color: m.acento }} />
                                    <span className="text-xs font-semibold">{m.titulo}</span>
                                    {sinBio && <span className="px-2 text-[9px] leading-tight text-white/60">no disponible aquí</span>}
                                    {cfg.metodo === m.id && <span className="text-[9px] text-teal-200">en uso</span>}
                                </span>
                            </WidgetLibre>
                        </button>
                    );
                })}
            </div>

            {metodo === "biometria" && (
                <button type="button" onClick={registrar} disabled={ocupado}
                    className="flex cursor-pointer items-center justify-center gap-2 self-center rounded-full ss-redondo px-4 py-2 text-sm font-semibold"
                    style={{ background: "radial-gradient(closest-side,#10B98166,#10B98118)" }}>
                    <Fingerprint className="size-4" />{passkey ? "Volver a registrar la huella o el rostro" : "Registrar huella o rostro"}
                </button>
            )}
            {metodo !== "ninguno" && (metodo !== "biometria" || passkey) && (
                <div className="grid gap-2 sm:grid-cols-2">
                    <input className={campo} type="password" autoComplete="new-password" inputMode={esPin ? "numeric" : undefined} value={a} onChange={(e) => setA(e.target.value)}
                        placeholder={metodo === "biometria" ? "PIN de respaldo (4–12 cifras)" : esPin ? "PIN (4–12 cifras)" : "Contraseña (6 o más)"} aria-label={esPin ? "PIN" : "Contraseña"} />
                    <input className={campo} type="password" autoComplete="new-password" inputMode={esPin ? "numeric" : undefined} value={b} onChange={(e) => setB(e.target.value)}
                        placeholder="Repítelo" aria-label={esPin ? "Repite el PIN" : "Repite la contraseña"} />
                </div>
            )}
            {metodo !== "ninguno" && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-white/80">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={alAbrir} onChange={(e) => setAlAbrir(e.target.checked)} />Pedir al abrir</label>
                    <label className="flex items-center gap-2">Bloquear tras
                        <select value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="rounded-full ss-redondo bg-white/10 px-2 py-1 text-white" aria-label="Minutos sin uso">
                            {MINUTOS.map((m) => <option key={m} value={m} className="bg-slate-900">{m === 0 ? "nunca" : `${m} min`}</option>)}
                        </select>
                        sin uso
                    </label>
                </div>
            )}
            <div className="flex items-center gap-3">
                <button type="button" onClick={guardar} disabled={ocupado || (metodo === "biometria" && !passkey)}
                    className="cursor-pointer rounded-full ss-redondo bg-teal-500/40 px-5 py-2 text-sm font-semibold hover:bg-teal-500/60 disabled:cursor-not-allowed disabled:opacity-50">Guardar</button>
                {cfg.metodo !== "ninguno" && (
                    <button type="button" onClick={() => window.dispatchEvent(new Event("starseed:bloquear"))} className="cursor-pointer text-xs text-white/70 underline-offset-4 hover:underline">Bloquear ahora</button>
                )}
            </div>
            {aviso && <p role={aviso.ok ? "status" : "alert"} className={`text-xs ${aviso.ok ? "text-teal-200" : "text-rose-200"}`}>{aviso.texto}</p>}
        </div>
    );
}

export default ConfigurarBloqueo;
