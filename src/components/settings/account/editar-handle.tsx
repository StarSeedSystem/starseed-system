"use client";

/**
 * EDITAR @HANDLE (Adenda 218 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * El @handle es la identidad pública en la red; hasta ahora solo se fijaba en
 * el rito y luego no había dónde cambiarlo. Aquí se edita con las mismas
 * reglas del rito (`isValidHandle`, `isHandleAvailable`) y, al guardar, se
 * renombra la identidad interna completa —perfil público, dirección @star.seed
 * y dirección pública para todo internet— con `renombrarIdentidadInterna`,
 * para que nada quede a nombre del handle viejo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Check, Loader2, CircleDashed, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { isValidHandle, isHandleAvailable, renombrarIdentidadInterna } from "@/lib/onboarding/onboarding";

type Estado = "idle" | "checking" | "ok" | "taken" | "invalid";

export function EditarHandle({ actual, onGuardado }: { actual: string; onGuardado?: (h: string) => void }) {
    const [valor, setValor] = useState(actual.replace(/^@/, ""));
    const [estado, setEstado] = useState<Estado>("idle");
    const [guardando, setGuardando] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { setValor(actual.replace(/^@/, "")); }, [actual]);

    const cambio = valor.trim().toLowerCase() !== actual.replace(/^@/, "").toLowerCase();

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const h = valor.trim();
        if (!cambio) { setEstado("idle"); return; }
        if (!isValidHandle(h)) { setEstado("invalid"); return; }
        setEstado("checking");
        timer.current = setTimeout(async () => {
            const libre = await isHandleAvailable(h);
            setEstado(libre ? "ok" : "taken");
        }, 450);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [valor, cambio]);

    const guardar = useCallback(async () => {
        const h = valor.trim().toLowerCase();
        if (!cambio || estado !== "ok") return;
        setGuardando(true);
        try {
            const sb = createClient();
            const { data } = await sb.auth.getUser();
            const uid = data?.user?.id;
            if (!uid) { toast.error("Sesión requerida."); return; }
            const { error } = await sb.from("profiles").update({ handle: h }).eq("user_id", uid);
            if (error) { toast.error(`No se pudo cambiar: ${error.message}`); return; }
            // Renombra todo lo que cuelga del handle (perfil público, correos).
            try { await renombrarIdentidadInterna(uid, h); } catch { /* best-effort: el perfil ya cambió */ }
            toast.success(`Ahora eres @${h}.`);
            setEstado("idle");
            onGuardado?.(h);
        } finally {
            setGuardando(false);
        }
    }, [valor, cambio, estado, onGuardado]);

    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
                <AtSign className="h-4 w-4 text-fuchsia-300" />
                <span className="text-sm font-semibold">Tu @handle</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
                Tu nombre único en la red. Al cambiarlo se renombran también tu perfil público y tus direcciones de correo.
            </p>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                        value={valor}
                        onChange={(e) => setValor(e.target.value.replace(/^@/, ""))}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-9 text-sm outline-none focus:border-fuchsia-400/50"
                        placeholder="tu_handle"
                        spellCheck={false}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        {estado === "checking" && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
                        {estado === "ok" && <Check className="h-4 w-4 text-emerald-300" />}
                        {estado === "taken" && <X className="h-4 w-4 text-rose-300" />}
                        {estado === "invalid" && <CircleDashed className="h-4 w-4 text-amber-300" />}
                    </span>
                </div>
                <button
                    type="button"
                    disabled={!cambio || estado !== "ok" || guardando}
                    onClick={() => void guardar()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                </button>
            </div>
            {estado === "taken" && <p className="text-[11px] text-rose-300">Ese @handle ya está en uso por otra persona.</p>}
            {estado === "invalid" && <p className="text-[11px] text-amber-300/80">Solo letras, números, punto y guion bajo; entre 3 y 24 caracteres.</p>}
        </div>
    );
}

export default EditarHandle;
