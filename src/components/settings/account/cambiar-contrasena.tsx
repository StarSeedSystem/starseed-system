"use client";

/**
 * CAMBIAR CONTRASEÑA (Adenda 218 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Faltaba en Configuración → Cuenta → Seguridad. Reglas:
 *  · Se pide la contraseña ACTUAL y se verifica de verdad con un inicio de
 *    sesión silencioso antes de cambiar nada: `updateUser` de Supabase no la
 *    comprueba por sí mismo, y cambiar la clave sin demostrar que conoces la
 *    anterior es exactamente lo que haría alguien con una sesión robada.
 *  · Mínimo 8 caracteres y confirmación. Sin reglas absurdas de símbolos:
 *    longitud manda.
 *  · Al terminar se cierran las DEMÁS sesiones (`scope: "others"`): la nueva
 *    clave invalida cualquier dispositivo que no sea este.
 */

import { useState } from "react";
import { KeyRound, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export function CambiarContrasena({ email }: { email: string | null | undefined }) {
    const [actual, setActual] = useState("");
    const [nueva, setNueva] = useState("");
    const [confirma, setConfirma] = useState("");
    const [ver, setVer] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [hecho, setHecho] = useState(false);

    const valida = nueva.length >= 8 && nueva === confirma && actual.length > 0 && nueva !== actual;

    const cambiar = async () => {
        if (!valida || !email) return;
        setOcupado(true);
        try {
            const sb = createClient();
            // 1 · Demostrar que se conoce la contraseña actual.
            const { error: e1 } = await sb.auth.signInWithPassword({ email, password: actual });
            if (e1) { toast.error("La contraseña actual no es correcta."); return; }
            // 2 · Cambiarla.
            const { error: e2 } = await sb.auth.updateUser({ password: nueva });
            if (e2) { toast.error(`No se pudo cambiar: ${e2.message}`); return; }
            // 3 · Expulsar a los demás dispositivos; este sigue dentro.
            try { await sb.auth.signOut({ scope: "others" }); } catch { /* best-effort */ }
            setHecho(true);
            setActual(""); setNueva(""); setConfirma("");
            toast.success("Contraseña cambiada. Las demás sesiones se han cerrado.");
        } catch (e) {
            toast.error((e as Error)?.message || "Error al cambiar la contraseña.");
        } finally {
            setOcupado(false);
        }
    };

    const campo = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-fuchsia-400/50";

    return (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-fuchsia-300" />
                <span className="text-sm font-semibold">Cambiar contraseña</span>
                {hecho && <Check className="h-4 w-4 text-emerald-300" />}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Se comprueba la actual antes de cambiarla, y al terminar se cierran las sesiones de tus otros dispositivos.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
                <input className={campo} type={ver ? "text" : "password"} placeholder="Contraseña actual" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
                <input className={campo} type={ver ? "text" : "password"} placeholder="Nueva (mín. 8)" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
                <input className={campo} type={ver ? "text" : "password"} placeholder="Repite la nueva" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
            </div>
            {nueva && confirma && nueva !== confirma && (
                <p className="text-[11px] text-rose-300">Las dos contraseñas nuevas no coinciden.</p>
            )}
            {nueva && nueva.length < 8 && (
                <p className="text-[11px] text-amber-300/80">Mínimo 8 caracteres.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={!valida || ocupado}
                    onClick={() => void cambiar()}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Cambiar contraseña
                </button>
                <button type="button" onClick={() => setVer((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] text-white/60 hover:text-white/85">
                    {ver ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {ver ? "Ocultar" : "Mostrar"}
                </button>
            </div>
        </div>
    );
}

export default CambiarContrasena;
