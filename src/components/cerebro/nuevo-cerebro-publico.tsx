"use client";

/**
 * «Nuevo» en la pestaña Públicos (CB1013A, contrato §2): un cerebro público pertenece a un grupo,
 * comunidad o página que la cuenta gestiona. Lista esas entidades (`misEntidades()`) al abrirse
 * y crea el cerebro con `scope` group/page y `scope_ref` = la entidad.
 */

import { useEffect, useState } from "react";
import { Globe, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { misEntidades, type EntidadGestionable } from "@/lib/genesis/entidades";
import { alcanceParaEntidad } from "@/lib/cerebros/pestanas";

export interface NuevoCerebroPublicoProps {
    onCreado: (cerebro: Brain) => void;
    onCerrar: () => void;
}

export function NuevoCerebroPublico({ onCreado, onCerrar }: NuevoCerebroPublicoProps) {
    const [entidades, setEntidades] = useState<EntidadGestionable[] | null>(null);
    const [motivo, setMotivo] = useState<string | null>(null);
    const [creando, setCreando] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        void misEntidades().then((r) => {
            if (!vivo) return;
            if (r.ok) setEntidades(r.lista);
            else {
                setEntidades([]);
                setMotivo(r.motivo);
            }
        });
        return () => {
            vivo = false;
        };
    }, []);

    const crear = async (e: EntidadGestionable) => {
        setCreando(e.id);
        const b = await saveBrain({
            name: `Cerebro de ${e.nombre}`,
            scope: alcanceParaEntidad(e.tipo === "pagina" ? "pagina" : "grupo"),
            scope_ref: e.id,
            description: `Cerebro público de ${e.tipo === "pagina" ? "la página" : "el grupo"} «${e.nombre}».`,
        });
        setCreando(null);
        if (b) {
            toast.success(`Cerebro público creado para «${e.nombre}».`);
            onCreado(b);
        } else {
            toast.error("No se pudo crear el cerebro. ¿Has iniciado sesión?");
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-xs leading-relaxed text-white/60">
                Un cerebro público pertenece a un grupo, comunidad o página que gestionas. Elige a cuál:
            </p>
            {entidades === null ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-white/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando tus grupos, comunidades y páginas…
                </p>
            ) : entidades.length === 0 ? (
                <p className="mt-2 text-xs text-white/50">
                    {motivo ?? "No gestionas ningún grupo, comunidad ni página todavía. Créalos desde Red o PoliGenesis."}
                </p>
            ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                    {entidades.map((e) => (
                        <Button
                            key={e.id}
                            size="sm"
                            variant="outline"
                            className="h-auto gap-1.5 whitespace-normal py-1.5 text-left"
                            disabled={creando !== null}
                            onClick={() => void crear(e)}
                        >
                            {creando === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            <Globe className="h-3.5 w-3.5 text-sky-300" />
                            {e.nombre}
                            <span className="text-[11px] text-white/45">· {e.tipo === "pagina" ? "página" : "grupo"}</span>
                        </Button>
                    ))}
                </div>
            )}
            <button type="button" onClick={onCerrar} className="mt-2 text-[11px] text-white/45 hover:text-white/70 hover:underline">
                Cerrar
            </button>
        </div>
    );
}
