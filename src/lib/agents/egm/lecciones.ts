// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS · EGM · Lecciones (resolver = aprender) · Ola 1104R
// ------------------------------------------------------------------------------
// Las objeciones bloquea/importa que el elefante resuelve o rechaza se guardan
// en el cerebro del perfil como recuerdos de tipo `leccion` con etiqueta `egm`.
// Hechos, no opiniones (mismo principio que scripts/puente/director_aprendizaje.py):
// objeción + corrección/porqué + fecha. Las `menor` no se guardan.
// Módulo PURO: solo tipos, sin `node:*` ni red. Importa SOLO el tipo
// CreateBrainMemoryInput de src/lib/cerebro/brain-memories.ts.
// ════════════════════════════════════════════════════════════════════════════

import type { CreateBrainMemoryInput } from "@/lib/cerebro/brain-memories";
import type { Objecion } from "./peces";

export interface LeccionResuelta {
    texto: string;
    correccion: string;
}

export interface LeccionRechazada {
    texto: string;
    porque: string;
}

export interface EntradaLecciones {
    perfilId: string;
    cerebroId: string | null;
    objeciones: Objecion[];
    resueltas: LeccionResuelta[];
    rechazadas: LeccionRechazada[];
    fecha: string;
}

export type TipoLeccion = "resuelta" | "rechazada";

interface ParejaLeccion {
    texto: string;
    detalle: string;
    tipo: TipoLeccion;
}

/** Empareja cada objeción bloquea/importa con su corrección o su porqué. */
function parejasDe(entrada: EntradaLecciones): ParejaLeccion[] {
    const parejas: ParejaLeccion[] = [];
    for (const o of entrada.objeciones) {
        if (o.gravedad === "menor") continue;
        const resuelta = entrada.resueltas.find((r) => r.texto === o.texto);
        if (resuelta) {
            parejas.push({ texto: o.texto, detalle: resuelta.correccion, tipo: "resuelta" });
            continue;
        }
        const rechazada = entrada.rechazadas.find((r) => r.texto === o.texto);
        if (rechazada) {
            parejas.push({ texto: o.texto, detalle: rechazada.porque, tipo: "rechazada" });
        }
    }
    return parejas;
}

function contenidoLeccion(entrada: EntradaLecciones, pareja: ParejaLeccion, gravedad: string): string {
    return (
        `# Lección EGM (${pareja.tipo})\n` +
        `- Fecha: ${entrada.fecha}\n` +
        `- Perfil: ${entrada.perfilId}\n` +
        `- Gravedad: ${gravedad}\n` +
        `- Objeción: ${pareja.texto}\n` +
        `- ${pareja.tipo === "resuelta" ? "Corrección" : "Porqué se rechaza"}: ${pareja.detalle}\n`
    );
}

export function leccionesDe(entrada: EntradaLecciones): CreateBrainMemoryInput[] {
    if (!entrada.cerebroId) return [];
    const porTexto = new Map(entrada.objeciones.map((o) => [o.texto, o.gravedad]));
    return parejasDe(entrada).map((pareja) => ({
        brainId: entrada.cerebroId,
        name: `Lección EGM (${pareja.tipo}) · ${entrada.fecha}`,
        kinds: ["leccion", "egm"],
        format: "markdown",
        content: contenidoLeccion(entrada, pareja, porTexto.get(pareja.texto) ?? "importa"),
    }));
}
