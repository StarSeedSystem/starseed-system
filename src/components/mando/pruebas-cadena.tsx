"use client";

/**
 * La cadena de entrega de la prueba en primer plano (PRB1111V): tarea → puerta → publicación → compilación →
 * publicada → instalada en los aparatos → comprobada → aprobada. Cada eslabón dice su estado y desde cuándo, con datos
 * que existen (`enMarcha`, las versiones de prueba, el archivo de evidencia); lo que no se sabe, lo dice.
 */

import { cadenaDeEntrega, versionEnFoco } from "@/lib/mando/pruebas-vivas";
import type { EstadoEslabon } from "@/lib/mando/pruebas-vivas-tipos";

import { haceTexto, Seccion, usePruebas } from "./pruebas-contexto";

const PUNTO: Record<EstadoEslabon, string> = {
    hecho: "bg-emerald-400",
    "en-curso": "bg-amber-300 animate-pulse",
    pendiente: "bg-zinc-500",
    fallo: "bg-red-400",
    desconocido: "border border-dashed border-white/40 bg-transparent",
};
const ETIQUETA: Record<EstadoEslabon, string> = {
    hecho: "hecho",
    "en-curso": "en curso",
    pendiente: "pendiente",
    fallo: "falló",
    desconocido: "no se sabe",
};
const BORDE: Record<EstadoEslabon, string> = {
    hecho: "border-emerald-500/25",
    "en-curso": "border-amber-400/40",
    pendiente: "border-white/10",
    fallo: "border-red-500/40",
    desconocido: "border-dashed border-white/20",
};

export function CadenaDeEntrega() {
    const c = usePruebas();
    if (!c) return null;
    const v = versionEnFoco(c.datos.versiones);
    const eslabones = cadenaDeEntrega({ ahora: c.ahora, v, enMarcha: c.datos.enMarcha, cola: c.datos.cola, banco: c.datos.banco, director: c.datos.director });
    return (
        <Seccion titulo={`Cadena de entrega${v ? ` · ${v.version ?? v.etiqueta}` : ""}`} id="cadena">
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="cadena">
                {eslabones.map((e, i) => (
                    <li key={e.id} className={`min-w-0 rounded-lg border bg-black/25 p-2 text-xs ${BORDE[e.estado]}`} data-testid={`eslabon-${e.id}`} data-estado={e.estado}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[10px] text-white/35">{i + 1}</span>
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[e.estado]}`} aria-hidden />
                            <span className="font-semibold text-white/90">{e.titulo}</span>
                            <span className="text-[11px] text-white/55">{ETIQUETA[e.estado]}</span>
                        </div>
                        <p className="mt-1 break-words text-white/65">{e.texto}</p>
                        <p className="mt-0.5 text-[11px] text-white/40">
                            {e.desde
                                ? `${e.estado === "en-curso" ? "desde" : e.estado === "fallo" ? "falló" : e.estado === "hecho" ? "hecho" : "visto"} ${haceTexto(e.desde, c.ahora) ?? "en una fecha ilegible"}`
                                : e.estado === "pendiente" ? "" : "no consta desde cuándo"}
                        </p>
                    </li>
                ))}
            </ol>
        </Seccion>
    );
}
