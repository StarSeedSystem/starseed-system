/**
 * oficina-servidor.ts — Oficina 3D del Mando, lado servidor (Ola 272 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reúne las fuentes vivas (latidos de la máquina, progreso de las olas y la
 * rama 1.58 del backend local — nunca red externa más allá de `leerRama158`,
 * que ya es tolerante y local), calcula la oficina con `seresDelMando` y la
 * funde con el genoma persistido en `starseed_memory_root/mando/oficina/`.
 *
 * Solo escribe `genomas.json` cuando algo cambió de verdad (comparando
 * contenido), para no reescribir el disco en cada refresco del Mando.
 *
 * ⚠️ Seguridad: las rutas que salen de aquí son SIEMPRE relativas al
 * repositorio; jamás se devuelven claves ni rutas absolutas del disco.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EstadoOficina } from "@/lib/astraura/genesis-types";
import { derivarAdn } from "@/lib/astraura/genesis-dna";
import { leerLatidos, leerProgreso } from "@/lib/mando/lector-local";
import { leerRama158 } from "@/lib/mando/agentes-158";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    estadoOficinaDe,
    fusionarGenoma,
    predeterminadoDe,
    seresDelMando,
    type GenomaSer,
    type SerPredeterminado,
} from "@/lib/mando/oficina";

/** Carpeta del genoma, relativa a la raíz (`starseed_memory_root/` no se versiona). */
const DIR_OFICINA = "starseed_memory_root/mando/oficina";
const ARCHIVO_GENOMAS = `${DIR_OFICINA}/genomas.json`;

/** Respuesta de GET /api/mando/oficina. */
export interface OficinaMando {
    t: string;
    estado: EstadoOficina;
    seres: import("@/lib/astraura/genesis-types").SerListado[];
    genomas: GenomaSer[];
}

/** Lee los genomas guardados; tolerante: archivo ausente o corrupto = sin historia. */
async function leerGenomas(): Promise<Map<string, GenomaSer>> {
    try {
        const crudo = await readFile(path.join(raizDelProyecto(), ARCHIVO_GENOMAS), "utf-8");
        const datos = JSON.parse(crudo) as unknown;
        if (!Array.isArray(datos)) return new Map();
        const mapa = new Map<string, GenomaSer>();
        for (const g of datos as GenomaSer[]) {
            if (g && typeof g.id === "string" && typeof g.xp === "number") mapa.set(g.id, g);
        }
        return mapa;
    } catch {
        return new Map();
    }
}

/** Escribe los genomas SOLO si el contenido cambió (ahorra disco en cada refresco). */
async function guardarGenomasSiCambia(genomas: GenomaSer[]): Promise<void> {
    const ruta = path.join(raizDelProyecto(), ARCHIVO_GENOMAS);
    const siguiente = JSON.stringify(genomas, null, 2);
    try {
        const actual = await readFile(ruta, "utf-8");
        if (actual === siguiente) return;
    } catch {
        // no existía: se escribe por primera vez
    }
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, siguiente, "utf-8");
}

/**
 * Calcula la oficina del Mando con el genoma evolucionado aplicado: experiencia
 * y nivel nunca bajan (un ser no desaprende), y el ADN se re-deriva con la
 * experiencia fusionada para que el cuerpo refleje la historia acumulada.
 */
export async function leerOficina(): Promise<OficinaMando> {
    const ahora = Date.now();
    // Sin red externa: latidos y progreso son locales; leerRama158 solo habla
    // con el backend 1.58 de esta neurona y tolera que esté apagado.
    const [latidos, progreso, rama158] = await Promise.all([leerLatidos(), leerProgreso(), leerRama158()]);
    const calculada = seresDelMando({ latidos, progreso, rama158 }, ahora);

    const previos = await leerGenomas();
    const fusionados = calculada.genomas.map((g) => fusionarGenoma(previos.get(g.id) ?? null, g));
    await guardarGenomasSiCambia(fusionados);

    // Los seres salen con la experiencia y generación del genoma (la historia
    // manda sobre el cálculo del momento) y el ADN se re-deriva con ellos.
    const porId = new Map(fusionados.map((g) => [g.id, g]));
    const seres = calculada.seres.map((ser) => {
        const g = porId.get(ser.id);
        if (!g) return ser;
        return {
            ...ser,
            experiencia: g.xp,
            generacion: g.generacion,
            adn: derivarAdn({
                id: g.id,
                nombre: g.nombre,
                colorPersonalidad: g.color ?? null,
                arquetipo: g.tipo,
                generacion: g.generacion,
                experiencia: g.xp,
            }),
        };
    });

    return {
        t: new Date(ahora).toISOString(),
        estado: estadoOficinaDe(calculada, ahora),
        seres,
        genomas: fusionados,
    };
}

/**
 * Exporta un ser como «versión predeterminada»: su genoma + ADN en un JSON
 * propio bajo `predeterminados/`. Devuelve la ruta RELATIVA o null si el ser
 * no existe (todavía no tiene genoma calculado).
 */
export async function exportarPredeterminado(id: string): Promise<{ ruta: string; ser: SerPredeterminado } | null> {
    // El id viaja a un nombre de archivo: se sanea para que jamás escape del
    // directorio (sin «/», «\» ni «..»).
    const seguro = id.replace(/[/\\]/g, "__").replace(/[^a-zA-Z0-9_.:-]/g, "_").replace(/^\.+/, "_");
    if (!seguro) return null;

    const oficina = await leerOficina();
    const genoma = oficina.genomas.find((g) => g.id === id);
    if (!genoma) return null;
    const adn = derivarAdn({
        id: genoma.id,
        nombre: genoma.nombre,
        colorPersonalidad: genoma.color ?? null,
        arquetipo: genoma.tipo,
        generacion: genoma.generacion,
        experiencia: genoma.xp,
    });
    const ser = predeterminadoDe(genoma, adn);
    const rutaRelativa = `${DIR_OFICINA}/predeterminados/${seguro}.json`;
    const ruta = path.join(raizDelProyecto(), rutaRelativa);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, JSON.stringify(ser, null, 2), "utf-8");
    return { ruta: rutaRelativa, ser };
}
