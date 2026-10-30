"use client";

/**
 * FondosSetsPanel — conexión de `fondos-biblioteca.ts` (Ola 1018F · I · fondos-shaders.md §2-§3): guarda el
 * fondo actual de la pila como set `.starseed-fondo.json` en la Biblioteca (carpeta «Fondos», la crea si falta)
 * y enlista los guardados, validados con sets-fondo. Aplicar va por el MISMO aviso de la Protomolécula
 * (`EVENTO_APLICAR_FONDO`): el set se guarda con `base: null`, así que aplicar NUNCA cambia el motor base.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import { normalizeLayers } from "@/lib/appearance/background-layers";
import { EVENTO_APLICAR_FONDO, type DetalleAplicarFondo } from "@/lib/protomolecula/peticion/fondo-evento";
import { cargarCatalogo, type ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import { exportarSet, type SetFondo } from "@/lib/appearance/sets-fondo";
import { guardarSet, listarSets, type SetGuardado } from "@/lib/appearance/fondos-biblioteca";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";

export function FondosSetsPanel() {
    const { config } = useAppearance();
    const { destinations, loading } = useMyLibraryDestinations();
    const destino = destinations[0] ?? null; // «Mi biblioteca»: guardar sobre TU biblioteca nunca es compartido
    const [catalogo, setCatalogo] = useState<ShaderCatalog | null>(null);
    const [sets, setSets] = useState<SetGuardado[] | null>(null);
    const [nombre, setNombre] = useState("");
    const [guardando, setGuardando] = useState(false);

    // El catálogo de la versión instalada: `import` dinámico solo en cliente (fondos-shaders.md §1).
    useEffect(() => {
        cargarCatalogo().then(setCatalogo).catch(() => setCatalogo(null));
    }, []);

    useEffect(() => {
        if (!destino || !catalogo) { setSets(null); return; }
        let vivo = true;
        const compartido = destino.ref.kind !== "user";
        listarSets(destino.ref, { catalogo, compartido }).then((lista) => { if (vivo) setSets(lista); });
        return () => { vivo = false; };
    }, [destino, catalogo]);

    const capas = useMemo(() => normalizeLayers(config.background.layers), [config.background.layers]);

    const guardar = async () => {
        if (!destino || !catalogo) return;
        setGuardando(true);
        try {
            const e = exportarSet({ nombre: nombre.trim() || "Mi fondo", base: null, capas, autor: "Yo", licencias: [] }, { catalogo });
            if (!e.ok) { toast.error(`No se pudo crear el set: ${e.motivos[0]}`); return; }
            const r = await guardarSet(destino.ref, e.set, undefined); // carpeta «Fondos», la crea si falta
            if (!r.ok) { toast.error(`No se pudo guardar: ${r.motivo}`); return; }
            toast.success(`Set «${e.set.nombre}» guardado en la carpeta «Fondos» de ${destino.label}`);
            listarSets(destino.ref, { catalogo, compartido: destino.ref.kind !== "user" }).then(setSets);
        } finally {
            setGuardando(false);
        }
    };

    const aplicar = (set: SetFondo) => {
        const detalle: DetalleAplicarFondo = { aplicar: () => set.capas.map((c) => ({ ...c })) }; // el set trae la PILA completa
        const atendido = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: detalle, cancelable: true }));
        toast[atendido ? "success" : "error"](atendido
            ? `Fondo aplicado: «${set.nombre}» (motor base conservado)` : "No pude aplicar el fondo: la apariencia no respondió");
    };

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Save className="size-4 text-primary" /> Sets de fondos en la Biblioteca
            </h3>
            <p className="max-w-prose text-[11px] text-muted-foreground/70">
                Guarda la pila de capas tal y como está como un <b>set</b> <code>.starseed-fondo.json</code> en la
                carpeta «Fondos» de tu Biblioteca, y reaplícalo desde aquí.
            </p>            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120}
                    placeholder="Nombre del set" aria-label="Nombre del set"
                    className="w-48 rounded-lg border border-border/50 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                />
                <button
                    type="button" onClick={guardar} disabled={!destino || !catalogo || guardando}
                    title={destino ? `Guardar en ${destino.label} · carpeta «Fondos»` : "Entra en tu cuenta para guardar sets"}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Save className="size-3.5" /> {guardando ? "Guardando…" : "Guardar fondo actual"}
                </button>
            </div>
            <div className="space-y-1.5">
                {loading && <p className="text-[11px] text-muted-foreground/60">Abriendo tu Biblioteca…</p>}
                {!loading && !destino && <p className="text-[11px] text-muted-foreground/60">Entra en tu cuenta para guardar y ver tus sets.</p>}
                {sets !== null && sets.length === 0 && <p className="text-[11px] text-muted-foreground/60">Aún no has guardado ningún set.</p>}
                {sets?.map((guardado) =>
                    guardado.ok ? (
                        <div key={guardado.itemId} className="flex items-center gap-2.5 rounded-lg border border-border/40 px-2.5 py-1.5">
                            {guardado.set.vistaPrevia && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={guardado.set.vistaPrevia} alt={`Vista previa de ${guardado.set.nombre}`} className="h-9 w-14 shrink-0 rounded-md border border-border/40 object-cover" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold">{guardado.set.nombre}</p>
                                <p className="text-[10px] text-muted-foreground/60">{guardado.set.capas.length} capas · {guardado.set.autor || "sin autor"}</p>
                            </div>
                            <button
                                type="button" onClick={() => aplicar(guardado.set)} title="Aplicar este set de fondos"
                                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                            >
                                <RotateCcw className="size-3" /> Aplicar
                            </button>
                        </div>
                    ) : (
                        <div key={guardado.itemId} className="rounded-lg border border-amber-400/30 bg-amber-400/[0.04] px-2.5 py-1.5">
                            <p className="text-[11px] text-amber-200">Guardado que ya no pasa la validación:</p>
                            <p className="text-[10px] text-amber-200/70">{guardado.motivo}</p>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}
