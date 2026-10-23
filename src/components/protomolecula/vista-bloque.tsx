"use client";

// Bloque «protomolecula» en el feed (PM1010F2G): tarjeta SOLO LECTURA de una
// molécula publicada. Lo que se ve es un DATO: nada se ejecuta ni se edita aquí.
// «Abrir copia propia» guarda una copia con id NUEVO en el almacén local y abre
// el editor con ella; la original del post queda intacta. Contrato: architecture/protomolecula.md.

import { useRouter } from "next/navigation";
import { Atom, Copy } from "lucide-react";
import { leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { almacenNavegador, guardarMolecula, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { formatearValor } from "@/lib/protomolecula/parametros";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

const nuevoId = (): string =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `mol-${crypto.randomUUID()}`
        : `mol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Copia propia: id nuevo, ámbito personal y objetos nuevos (nunca comparte referencias con la original). */
export function copiaPropia(m: Molecula, id: string = nuevoId(), ahora: number = Date.now()): Molecula {
    const clon = JSON.parse(JSON.stringify(m)) as Molecula;
    return { ...clon, id, titulo: `${m.titulo} (copia)`, ambito: "personal", version: 1, creadaEn: ahora, actualizadaEn: ahora };
}

/** Valores de un átomo listos para leer: con la definición registrada, nombre y unidad; si no, la clave cruda. */
function valoresDe(m: Molecula, atomoId: string, herramientaId: string): { nombre: string; valor: string }[] {
    const def = obtenerAtomo(herramientaId);
    const prefijo = `${atomoId}::`;
    return Object.entries(m.valores)
        .filter(([clave]) => clave.startsWith(prefijo))
        .map(([clave, v]) => {
            const parametroId = clave.slice(prefijo.length);
            const p = def?.parametros.find((x) => x.id === parametroId);
            return p ? { nombre: p.nombre, valor: formatearValor(p, v) } : { nombre: parametroId, valor: String(v) };
        });
}

export interface VistaBloqueProps {
    texto: string;
    /** Inyectables para las pruebas; por defecto, localStorage y el router de Next. */
    almacen?: AlmacenLocal | null;
    navegar?: (ruta: string) => void;
}

export function VistaBloqueProtomolecula({ texto, almacen, navegar }: VistaBloqueProps) {
    const router = useRouter();
    const leido = leerBloque(texto);

    if (!leido.ok) {
        return (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/[0.06] p-3 text-sm">
                <p className="font-medium text-destructive">Esta molécula no se puede mostrar</p>
                <p className="text-xs text-muted-foreground">Motivo: {leido.motivo}</p>
            </div>
        );
    }
    const m = leido.valor;

    const abrirCopia = () => {
        const a = almacen === undefined ? almacenNavegador() : almacen;
        const copia = copiaPropia(m);
        if (!a || !guardarMolecula(a, copia)) return;
        (navegar ?? ((r: string) => router.push(r)))(`/protomolecula?molecula=${encodeURIComponent(copia.id)}`);
    };

    return (
        <div data-testid="vista-bloque-protomolecula" className="rounded-xl border border-indigo-400/25 bg-indigo-500/[0.05] p-3">
            <div className="mb-2 flex items-center gap-2">
                <Atom className="h-4 w-4 shrink-0 text-indigo-300" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{m.titulo || "Molécula sin título"}</h3>
                <span className="shrink-0 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">{m.ambito}</span>
            </div>
            <p className="mb-1 text-xs font-medium text-white/70">Capas ({m.capas.length})</p>
            <ul className="mb-2 list-inside list-disc text-xs text-muted-foreground">
                {[...m.capas].sort((a, b) => a.orden - b.orden).map((c) => (
                    <li key={c.id}>{c.titulo} · {c.tipo}</li>
                ))}
            </ul>
            <p className="mb-1 text-xs font-medium text-white/70">Herramientas ({m.atomos.length})</p>
            <div className="mb-3 space-y-1.5">
                {m.atomos.map((at) => (
                    <div key={at.id} className="rounded-lg border border-white/10 p-2 text-xs">
                        <p className="font-medium text-white/80">{at.titulo ?? obtenerAtomo(at.herramientaId)?.nombre ?? at.herramientaId}</p>
                        {valoresDe(m, at.id, at.herramientaId).map((v) => (
                            <p key={v.nombre} className="flex justify-between gap-2 text-muted-foreground">
                                <span>{v.nombre}</span>
                                <span className="font-mono">{v.valor}</span>
                            </p>
                        ))}
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={abrirCopia}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs text-indigo-100 transition-colors duration-200 hover:bg-indigo-500/25"
            >
                <Copy className="h-3.5 w-3.5" /> Abrir copia propia
            </button>
        </div>
    );
}
