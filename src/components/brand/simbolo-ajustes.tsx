'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Ajuste «Símbolo del escritorio» (ESC1110B)
// ----------------------------------------------------------------
// Para un perfil, una página o un grupo: usar el oficial, elegir un
// archivo (.simbolo.json, .glb/.gltf, .svg, .png/.jpg/.webp), exportar el
// actual, abrirlo en la Protomolécula y restaurar el oficial. Lo propio se
// rotula como de la entidad; la marca oficial nunca se deforma ni recolorea.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { Download, FileUp, RotateCcw, Atom } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimboloStarSeed3D } from "./simbolo-starseed-3d";
import { useAjusteSimbolo } from "./simbolo-almacen";
import type { DestinoSimbolo } from "./simbolo-registro";

const ACEPTA = ".json,.glb,.gltf,.svg,.png,.jpg,.jpeg,.webp,application/json,model/gltf-binary,model/gltf+json,image/svg+xml,image/png,image/jpeg,image/webp";

const BOTON = "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-foreground/90 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50";

export function AjusteSimboloEscritorio({ destino, compacto = false }: { destino: DestinoSimbolo | null; compacto?: boolean }): React.ReactElement {
    const s = useAjusteSimbolo(destino);
    const entrada = React.useRef<HTMLInputElement>(null);
    const de = destino?.ambito === "pagina" ? "esta página" : destino?.ambito === "grupo" ? "este grupo" : "este perfil";
    return (
        <section className={cn("space-y-2.5", compacto && "space-y-2")} data-testid="ajuste-simbolo-escritorio">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Símbolo del escritorio</h3>
            <div className="flex items-center gap-3">
                <SimboloStarSeed3D alto={66} archivo={s.archivo} etiqueta={s.propio ? `Símbolo propio de ${de}` : "Símbolo oficial de StarSeed"} />
                <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                    <p className="truncate font-semibold text-foreground/90">{s.archivo.nombre}</p>
                    <p>{s.propio ? `Propio de ${de}` : "Oficial de StarSeed (no se deforma ni se recolorea)"}</p>
                    {s.enlazado && <p className="text-cyan-200/80">Enlazado con la Protomolécula</p>}
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <button type="button" className={BOTON} disabled={!destino || s.ocupado} onClick={() => entrada.current?.click()}>
                    <FileUp className="size-3.5" /> Elegir archivo…
                </button>
                <button type="button" className={BOTON} disabled={!destino} onClick={s.exportar}>
                    <Download className="size-3.5" /> Exportar el actual
                </button>
                <button type="button" className={BOTON} disabled={!destino || s.ocupado} onClick={s.abrirEnProtomolecula}>
                    <Atom className="size-3.5" /> Abrir en la Protomolécula
                </button>
                {(s.propio || s.enlazado) && (
                    <button type="button" className={BOTON} disabled={!destino || s.ocupado} onClick={() => void s.usarOficial()}>
                        <RotateCcw className="size-3.5" /> Restaurar el oficial
                    </button>
                )}
                <input
                    ref={entrada}
                    type="file"
                    accept={ACEPTA}
                    className="hidden"
                    aria-label="Elegir archivo de símbolo"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void s.elegir(f);
                    }}
                />
            </div>
            {!destino && <p className="text-[11px] text-muted-foreground">Sin {de} activo todavía: el ajuste se activa cuando lo haya.</p>}
            {s.aviso && <p role="status" className="text-[11px] text-cyan-100/80">{s.aviso}</p>}
        </section>
    );
}

export default AjusteSimboloEscritorio;
