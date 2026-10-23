"use client";

// Vista SOLO LECTURA del bloque «protomolecula» en el feed (Lienzo Universal).
// Lo que se ve es un DATO: nunca edita la original ni ejecuta nada. «Abrir copia
// propia» guarda una copia con id nuevo en el almacén local y abre el editor.
// Contrato: `architecture/protomolecula.md`.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { formatearValor } from "@/lib/protomolecula/parametros";
import { almacenNavegador, guardarMolecula, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Ambito, Molecula, ValorParametro } from "@/lib/protomolecula/tipos";

const NOMBRE_AMBITO: Record<Ambito, string> = { personal: "Personal", perfil: "Perfil", grupo: "Grupo", publica: "Pública" };

const idAleatorio = (): string =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Copia con id NUEVO y versión reiniciada; la original no se toca (se clona entera). */
export function copiaPropia(m: Molecula, idNuevo: string, ahora: number): Molecula {
    const clon = JSON.parse(JSON.stringify(m)) as Molecula;
    return { ...clon, id: idNuevo, version: 1, creadaEn: ahora, actualizadaEn: ahora };
}

interface Fila { clave: string; nombre: string; valor: string }

/** Herramientas de la molécula con sus valores; con la ficha del registro si está, en crudo si no. */
function filasDe(m: Molecula, atomoId: string, herramientaId: string): Fila[] {
    const def = obtenerAtomo(herramientaId);
    const prefijo = `${atomoId}::`;
    if (def) {
        return def.parametros.map((p) => {
            const v = m.valores[prefijo + p.id] ?? p.defecto;
            return { clave: p.id, nombre: p.nombre, valor: v === undefined ? "—" : formatearValor(p, v) };
        });
    }
    return Object.entries(m.valores)
        .filter(([k]) => k.startsWith(prefijo))
        .map(([k, v]: [string, ValorParametro]) => ({ clave: k, nombre: k.slice(prefijo.length), valor: String(v) }));
}

export function VistaBloqueProtomolecula({
    texto,
    almacen,
    nuevoId = idAleatorio,
}: {
    texto: string;
    almacen?: AlmacenLocal | null;
    nuevoId?: () => string;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const leido = leerBloque(texto);

    if (!leido.ok) {
        return (
            <div role="alert" className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
                <p className="font-medium">Esta molécula no se puede mostrar</p>
                <p className="text-xs text-muted-foreground">Motivo: {leido.motivo}</p>
            </div>
        );
    }
    const m = leido.valor;

    const abrirCopia = () => {
        const destino = almacen === undefined ? almacenNavegador() : almacen;
        const idNuevo = nuevoId();
        if (!destino || !guardarMolecula(destino, copiaPropia(m, idNuevo, Date.now()))) {
            setError("No se pudo guardar la copia en este dispositivo.");
            return;
        }
        router.push(`/protomolecula?molecula=${encodeURIComponent(idNuevo)}`);
    };

    return (
        <section aria-label={`Molécula ${m.titulo}`} className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
            <header className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{m.titulo || "Molécula sin título"}</h3>
                <span className="rounded-full border border-border/50 px-2 py-0.5 text-xs">{NOMBRE_AMBITO[m.ambito]}</span>
            </header>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Capas</p>
            {m.capas.length === 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">Sin capas.</p>
            ) : (
                <ul className="mb-2 list-inside list-disc text-xs">
                    {[...m.capas].sort((a, b) => a.orden - b.orden).map((c) => (
                        <li key={c.id}>{c.titulo} · {c.tipo} ({c.formato})</li>
                    ))}
                </ul>
            )}
            <p className="mb-1 text-xs font-medium text-muted-foreground">Herramientas</p>
            {m.atomos.length === 0 && <p className="mb-2 text-xs text-muted-foreground">Sin herramientas.</p>}
            {m.atomos.map((a) => (
                <div key={a.id} className="mb-2 rounded-lg border border-border/40 p-2">
                    <p className="text-xs font-medium">{a.titulo ?? obtenerAtomo(a.herramientaId)?.nombre ?? a.herramientaId}</p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-xs">
                        {filasDe(m, a.id, a.herramientaId).map((f) => (
                            <div key={f.clave} className="contents">
                                <dt className="text-muted-foreground">{f.nombre}</dt>
                                <dd className="font-mono">{f.valor}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ))}
            <button type="button" onClick={abrirCopia} className="mt-1 cursor-pointer rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:bg-muted/40">
                Abrir copia propia
            </button>
            {error && <p role="status" className="mt-1 text-xs text-destructive">{error}</p>}
        </section>
    );
}
