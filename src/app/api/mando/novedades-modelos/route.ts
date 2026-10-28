/**
 * GET · POST /api/mando/novedades-modelos — panel «Novedades de modelos» del vigía
 * (Ola 1016M · architecture/vigia-modelos.md §6).
 *
 * GET: lee el ÚLTIMO `starseed_memory_root/vigia/novedades-<fecha>.json` (lo escribe una
 *      pasada de `scripts/puente/vigia_modelos.py`), lo agrupa por área con la función
 *      pura `agruparPorArea` y superpone el estado que este panel ya escribió
 *      (`starseed_memory_root/vigia/panel-estado.json`: fichas encoladas o descartadas).
 * POST: registra en ese estado una acción sobre una ficha — «encolar» (que entre en la
 *      cola de fichas del vigía) o «descartar» (con su motivo) — y devuelve la ficha
 *      actualizada.
 *
 * Ruta solo local: `guardianMando` responde 404 fuera de la Mac. Nunca devuelve claves
 * ni rutas del disco: solo los datos del JSON del vigía.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    accionesDeTexto,
    agruparPorArea,
    nombreMasReciente,
    superponerAccion,
} from "@/lib/mando/novedades-modelos";
import type { AccionFicha, AccionFichaRegistrada, RegistroNovedades } from "@/lib/mando/novedades-modelos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAÍZ = raizDelProyecto();
const CARPETA_VIGIA = path.join(RAÍZ, "starseed_memory_root", "vigia");
const ARCHIVO_ESTADO = "panel-estado.json";

/** La última pasada del vigía, agrupada y con el estado que el panel ya registró. */
async function leerRegistro(): Promise<RegistroNovedades | null> {
    const nombres = await readdir(CARPETA_VIGIA).catch(() => [] as string[]);
    const ultimo = nombreMasReciente(nombres);
    if (!ultimo) return null;
    let bruto: unknown = null;
    try {
        bruto = JSON.parse(await readFile(path.join(CARPETA_VIGIA, ultimo), "utf8"));
    } catch {
        return null;
    }
    const registro = agruparPorArea(bruto);
    // El estado escrito por el panel manda sobre lo que dijo la pasada (la última acción gana).
    registro.areas = (await leerAcciones()).reduce(
        (areas, a) => superponerAccion(areas, a.area, a.id, a.accion, a.motivo),
        registro.areas,
    );
    return registro;
}

async function leerAcciones(): Promise<AccionFichaRegistrada[]> {
    const texto = await readFile(path.join(CARPETA_VIGIA, ARCHIVO_ESTADO), "utf8").catch(() => null);
    return accionesDeTexto(texto);
}

/** Solo queda la ÚLTIMA acción por ficha: encolada y luego descartada queda descartada. */
async function guardarAccion(nueva: AccionFichaRegistrada): Promise<void> {
    await mkdir(CARPETA_VIGIA, { recursive: true });
    const limpias = (await leerAcciones()).filter((a) => !(a.area === nueva.area && a.id === nueva.id));
    limpias.push(nueva);
    await writeFile(path.join(CARPETA_VIGIA, ARCHIVO_ESTADO), JSON.stringify(limpias, null, 2), "utf8");
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const registro = await leerRegistro();
    return Response.json(
        { registro },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: { area?: string; id?: string; accion?: string; motivo?: string };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const area = typeof cuerpo.area === "string" ? cuerpo.area.trim() : "";
    const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
    const accion: AccionFicha | null = cuerpo.accion === "encolar" || cuerpo.accion === "descartar" ? cuerpo.accion : null;
    if (!area || !id || !accion) {
        return Response.json(
            { error: "Hacen falta «area», «id» y «accion» (encolar o descartar)." },
            { status: 400 },
        );
    }
    const registro = await leerRegistro();
    if (!registro) return Response.json({ error: "Aún no hay pasada del vigía." }, { status: 404 });
    const areaDatos = registro.areas.find((x) => x.id === area);
    const ficha = areaDatos?.candidatos.find((f) => f.id === id) ?? null;
    if (!ficha) return Response.json({ error: "No existe esa ficha en la última pasada." }, { status: 404 });
    const motivo = typeof cuerpo.motivo === "string" && cuerpo.motivo.trim() ? cuerpo.motivo.trim() : undefined;
    const nueva: AccionFichaRegistrada = { area, id, accion, motivo, cuando: new Date().toISOString() };
    await guardarAccion(nueva);
    const finales = superponerAccion(registro.areas, area, id, accion, motivo);
    const actualizada = finales.find((x) => x.id === area)?.candidatos.find((f) => f.id === id) ?? null;
    return Response.json(
        { ficha: actualizada ?? ficha },
        { headers: { "Cache-Control": "no-store" } },
    );
}
