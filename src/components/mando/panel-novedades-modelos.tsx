"use client";

/**
 * Panel «Novedades de modelos» por área (Ola 1016M · vigia-modelos.md §6): la última
 * pasada del vigía con clase de licencia, tamaño y medios donde cabe. Los `personal`
 * llevan siempre su etiqueta «solo uso personal»: nada no comercial como opción por
 * defecto ni en uso comercial. Los botones hacen POST a la misma ruta.
 */

import { useCallback, useEffect, useState } from "react";
import { Rocket, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    superponerAccion,
    type AccionFicha, type ClaseLicencia, type EstadoFicha, type FichaNovedad, type RegistroNovedades,
} from "@/lib/mando/novedades-modelos";

const CLASE_ETIQUETA: Record<ClaseLicencia, { texto: string; clase: string }> = {
    libre: { texto: "Libre", clase: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" },
    personal: { texto: "Solo uso personal", clase: "border-amber-400/30 bg-amber-500/10 text-amber-300" },
    condicionada: { texto: "Con condición", clase: "border-sky-400/30 bg-sky-500/10 text-sky-300" },
    desconocida: { texto: "Licencia sin comprobar", clase: "border-white/10 bg-white/5 text-white/50" },
};
const ESTADO_ETIQUETA: Record<EstadoFicha, string> = {
    propuesto: "Propuesta por el vigía", en_catalogo: "En catálogo", encolado: "Encolada", descartado: "Descartada",
};

export function PanelNovedadesModelos() {
    const [registro, setRegistro] = useState<RegistroNovedades | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendiente, setPendiente] = useState<string | null>(null);
    const [activa, setActiva] = useState<string | undefined>(undefined);

    const cargar = useCallback(async () => {
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/novedades-modelos", { cache: "no-store" });
            const datos = (await respuesta.json()) as { registro?: RegistroNovedades | null };
            setRegistro(datos.registro ?? null);
        } catch { setError("No se pudieron leer las novedades del vigía."); }
    }, []);
    useEffect(() => { void cargar(); }, [cargar]);
    const accionar = useCallback(async (area: string, id: string, accion: AccionFicha) => {
        setPendiente(`${area}|${id}`);
        try {
            const respuesta = await fetch("/api/mando/novedades-modelos", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ area, id, accion }),
            });
            if (!respuesta.ok) throw new Error("acción rechazada");
            const datos = (await respuesta.json()) as { ficha?: FichaNovedad };
            setRegistro((actual) => actual && {
                ...actual,
                areas: superponerAccion(actual.areas, area, id, accion, datos.ficha?.motivo),
            });
        } catch { setError("No se pudo registrar la acción."); } finally { setPendiente(null); }
    }, []);
    const areas = registro?.areas ?? [];
    return (
        <section data-testid="panel-novedades-modelos" className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Novedades de modelos</h3>
            {error && <p className="text-xs text-red-300">{error}</p>}
            {areas.length === 0 ? (
                <p className="text-xs text-white/60">Aún no hay pasada del vigía que mostrar.</p>
            ) : (
                <Tabs value={activa ?? areas[0]?.id} onValueChange={setActiva}>
                    <TabsList className="flex-wrap">
                        {areas.map((area) => (
                            <TabsTrigger key={area.id} value={area.id} className="cursor-pointer">{area.nombre}</TabsTrigger>
                        ))}
                    </TabsList>
                    {areas.map((area) => (
                        <TabsContent key={area.id} value={area.id} className="space-y-2">
                            {area.candidatos.map((ficha) => <FichaVigia key={ficha.id} ficha={ficha} area={area.id}
                                pendiente={pendiente === `${area.id}|${ficha.id}`} accionar={accionar} />)}
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </section>
    );
}

function FichaVigia({ ficha, area, pendiente, accionar }: {
    ficha: FichaNovedad; area: string; pendiente: boolean;
    accionar: (area: string, id: string, accion: AccionFicha) => Promise<void>;
}) {
    const etiqueta = CLASE_ETIQUETA[ficha.clase];
    const cabe = ficha.medios.filter((m) => m.cabe);
    const donde = cabe.map((m) => `${m.medio} (${m.archivo ?? "sin archivo"}${m.motor ? `, ${m.motor}` : ""})`).join(" · ");
    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-white">{ficha.id}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${etiqueta.clase}`}>{etiqueta.texto}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                    {ESTADO_ETIQUETA[ficha.estado]}
                </span>
                {ficha.tamanoGb !== null && <span className="text-[11px] text-white/50">≈ {ficha.tamanoGb} GB</span>}
            </div>
            {ficha.motivo && <p className="mt-1 text-[11px] text-white/60">{ficha.motivo}</p>}
            {donde && <p className="mt-1 text-[11px] text-white/50">Cabe en: {donde}</p>}
            <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={pendiente || ficha.estado === "encolado" || ficha.estado === "en_catalogo"}
                    onClick={() => void accionar(area, ficha.id, "encolar")} className="cursor-pointer gap-1.5">
                    <Rocket className="h-3.5 w-3.5" aria-hidden /> Encolar ficha
                </Button>
                <Button size="sm" variant="outline" disabled={pendiente || ficha.estado === "descartado"}
                    onClick={() => void accionar(area, ficha.id, "descartar")} className="cursor-pointer gap-1.5">
                    <XCircle className="h-3.5 w-3.5" aria-hidden /> Descartar
                </Button>
            </div>
        </article>
    );
}
