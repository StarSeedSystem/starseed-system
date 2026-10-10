"use client";

/*
 * AtajosGenesis — cambios frecuentes SIN IA (2026-10-10). Sirven cuando los modelos gratuitos
 * no contestan y para quien prefiere tocar a mano: generan la misma operación tipada que el
 * agente, que pasa por la misma validación, vista previa, confirmación y deshacer.
 */

import { useEffect, useState } from "react";
import { ChevronDown, LayoutPanelTop, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContextoGenesis } from "@/lib/genesis/traductor";

const MOTIVO = "Lo pediste tú desde los atajos.";
const CAMPO =
    "min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300";

export function AtajosGenesis({ anadir, ctx }: { anadir: (bruto: unknown) => boolean; ctx: ContextoGenesis | null }) {
    const [nombre, setNombre] = useState("");
    const [bio, setBio] = useState("");
    const [poner, setPoner] = useState("");
    const [quitar, setQuitar] = useState("");

    useEffect(() => {
        setNombre(ctx?.perfil?.nombre ?? "");
        setBio(ctx?.perfil?.bio ?? "");
    }, [ctx?.perfil?.nombre, ctx?.perfil?.bio]);

    const apagados = (ctx?.dock ?? []).filter((b) => !b.activo);
    const encendidos = (ctx?.dock ?? []).filter((b) => b.activo);

    const proponerPerfil = () => {
        const cambios: Record<string, string> = {};
        if (nombre.trim() && nombre.trim() !== (ctx?.perfil?.nombre ?? "")) cambios.nombre = nombre.trim();
        if (bio.trim() !== (ctx?.perfil?.bio ?? "").trim()) cambios.bio = bio.trim();
        anadir({ tipo: "perfil.editar", cambios, motivo: MOTIVO });
    };

    return (
        <details className="group rounded-xl border border-white/10 bg-black/15 p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-white/75">
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                Atajos sin IA
            </summary>
            <div className="mt-3 space-y-4">
                <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs text-white/60">
                        <UserPen className="h-3.5 w-3.5" aria-hidden /> Tu perfil
                    </p>
                    <input className={CAMPO + " w-full"} value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre público" aria-label="Nombre público" />
                    <textarea className={CAMPO + " w-full resize-none"} rows={2} value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} placeholder="Biografía" aria-label="Biografía" />
                    <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={proponerPerfil} disabled={!ctx?.perfil}>
                            Ver vista previa
                        </Button>
                    </div>
                    {!ctx?.perfil ? <p className="text-[11px] text-white/45">No encuentro tu perfil: inicia sesión o créalo en Ajustes › Perfil.</p> : null}
                </div>
                <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs text-white/60">
                        <LayoutPanelTop className="h-3.5 w-3.5" aria-hidden /> Tu dock
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <select className={CAMPO + " cursor-pointer"} value={poner} onChange={(e) => setPoner(e.target.value)} aria-label="Botón para poner en el dock">
                            <option value="">Poner en el dock…</option>
                            {apagados.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.etiqueta}
                                </option>
                            ))}
                        </select>
                        <Button size="sm" variant="outline" className="h-9 cursor-pointer" disabled={!poner} onClick={() => anadir({ tipo: "dock.añadir", elemento: { id: poner }, motivo: MOTIVO }) && setPoner("")}>
                            Proponer
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <select className={CAMPO + " cursor-pointer"} value={quitar} onChange={(e) => setQuitar(e.target.value)} aria-label="Botón para quitar del dock">
                            <option value="">Quitar del dock…</option>
                            {encendidos.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.etiqueta}
                                </option>
                            ))}
                        </select>
                        <Button size="sm" variant="outline" className="h-9 cursor-pointer" disabled={!quitar} onClick={() => anadir({ tipo: "dock.quitar", id: quitar, motivo: MOTIVO }) && setQuitar("")}>
                            Proponer
                        </Button>
                    </div>
                </div>
            </div>
        </details>
    );
}
