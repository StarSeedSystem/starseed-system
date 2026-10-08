/**
 * /api/mando/produccion (Ola 1005R · PRD1005I)
 * ─────────────────────────────────────────────────────────────────────────────
 * La tarjeta «Producción» del panel de Publicación (contrato
 * `architecture/director-produccion.md` §7).
 *
 * GET  → el estado del director (`produccion-estado.json`, o un estado vacío
 *        coherente si todavía no existe), la config `produccion`, el
 *        interruptor de pausa y cuántos vetos hay.
 * POST → `{ accion: "pausar" | "reanudar" }`      escribe el interruptor
 *        `{ accion: "vetar", clave, motivo }`     veto por sha o tarea
 *        `{ accion: "modo", modo }`               cambia `produccion.modo`
 *        `{ accion: "autopublicar", activo }`     interruptor de la AUTOPUBLICACIÓN (2026-10-07):
 *        lo lee `scripts/puente/autopublicar.py` (servicio com.starseed.produccion); al
 *        encenderlo se lanza una pasada al momento.
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves:
 * los errores de escritura son genéricos.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { DEFAULTS, fusionar, type ProduccionConfig } from "@/lib/mando/director-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModoProduccion = ProduccionConfig["modo"];
const MODOS: readonly ModoProduccion[] = ["seco", "canario", "auto"];

function rutaEstado(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "produccion-estado.json");
}
function rutaConfig(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "director-config.json");
}
function rutaInterruptor(): string {
    return path.join(os.homedir(), ".starseed", "produccion-pausada.json");
}
function rutaVetos(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "vetos.json");
}

function rutaAutopublicar(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "autopublicar.json");
}
function rutaEstadoAutopublicar(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "autopublicar-estado.json");
}
/** (2026-10-08) «Revisar ahora» y «Publicar sin Jev esta vez»: el director la lee y la borra. */
function rutaPeticionAutopublicar(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "autopublicar-peticion.json");
}

/** Solo lo que la tarjeta pinta: nunca rutas ni salidas largas. */
function estadoAutopublicarVisible(crudo: unknown): Record<string, unknown> | null {
    if (!esObjeto(crudo)) return null;
    const texto = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : undefined);
    const historial = Array.isArray(crudo.historial)
        ? crudo.historial.filter(esObjeto).slice(-10).map((h) => ({
              sha: texto(h.sha, 40) ?? "",
              resultado: texto(h.resultado, 40) ?? "",
              dia: texto(h.dia, 10) ?? "",
              url: texto(h.url, 300) ?? null,
              motivo: texto(h.motivo, 160),
          }))
        : [];
    return {
        fase: texto(crudo.fase, 40),
        detalle: texto(crudo.detalle),
        sha: texto(crudo.sha, 40) ?? null,
        url: texto(crudo.url, 300) ?? null,
        actualizado: texto(crudo.actualizado, 40),
        pendientes: typeof crudo.pendientes === "number" ? crudo.pendientes : undefined,
        jev: esObjeto(crudo.jev)
            ? {
                  decision: texto(crudo.jev.decision, 20),
                  confianza: typeof crudo.jev.confianza === "number" ? crudo.jev.confianza : undefined,
                  sha: texto(crudo.jev.sha, 40),
              }
            : undefined,
        historial,
    };
}

/** Una pasada del director al momento (desacoplada): no hace esperar a la pantalla. */
function lanzarPasadaAutopublicar(): void {
    try {
        const python = existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
        const hijo = spawn(python, [path.join(raizDelProyecto(), "scripts", "puente", "autopublicar.py")], {
            cwd: raizDelProyecto(),
            detached: true,
            stdio: "ignore",
        });
        hijo.unref();
    } catch {
        /* el servicio lo hará en su próxima vuelta (≤ 5 min) */
    }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}

const estadoVacio = () => ({ actualizadoEn: null, candidatos: [], medios: {}, ultimas: [] });

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const [crudoEstado, crudoConfig, crudoPausa, crudoVetos, crudoAuto, crudoEstadoAuto] = await Promise.all([
        leerJson(rutaEstado()),
        leerJson(rutaConfig()),
        leerJson(rutaInterruptor()),
        leerJson(rutaVetos()),
        leerJson(rutaAutopublicar()),
        leerJson(rutaEstadoAutopublicar()),
    ]);
    const autopublicar = { activo: esObjeto(crudoAuto) && crudoAuto.activo === true };
    const autopublicarEstado = estadoAutopublicarVisible(crudoEstadoAuto);
    const estado = esObjeto(crudoEstado) ? crudoEstado : estadoVacio();
    const config = fusionar(DEFAULTS, esObjeto(crudoConfig) ? crudoConfig : {}).produccion;
    const pausada = esObjeto(crudoPausa) && crudoPausa.pausada === true;
    const vetos = esObjeto(crudoVetos) ? Object.keys(crudoVetos).length : 0;

    return Response.json(
        { estado, config, pausada, vetos, autopublicar, autopublicarEstado, actualizadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (!esObjeto(crudo)) throw new Error("no-objeto");
        cuerpo = crudo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const ahora = new Date().toISOString();

    if (accion === "pausar" || accion === "reanudar") {
        try {
            await escribirAtomico(rutaInterruptor(), { pausada: accion === "pausar", quien: "mando", desde: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar el interruptor." }, { status: 500 });
        }
        return Response.json({ ok: true, pausada: accion === "pausar" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "autopublicar") {
        if (typeof cuerpo.activo !== "boolean") {
            return Response.json({ error: "Falta «activo» (true o false)." }, { status: 400 });
        }
        try {
            await escribirAtomico(rutaAutopublicar(), { activo: cuerpo.activo, quien: "genesis", desde: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar el interruptor." }, { status: 500 });
        }
        if (cuerpo.activo) lanzarPasadaAutopublicar();
        return Response.json({ ok: true, activo: cuerpo.activo }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "autopublicar-revisar" || accion === "autopublicar-saltar-jev") {
        // Solo actúa sobre el lote que Genesis está viendo (sha del estado): si main avanzó entre
        // medias, el director lo ignora y evalúa el lote nuevo con todas sus puertas.
        try {
            const estadoAuto = await leerJson(rutaEstadoAutopublicar());
            const sha = esObjeto(estadoAuto) && typeof estadoAuto.sha === "string" ? estadoAuto.sha : null;
            await escribirAtomico(rutaPeticionAutopublicar(), {
                accion: accion === "autopublicar-revisar" ? "revisar" : "saltar-jev",
                sha,
                quien: "genesis",
                t: ahora,
            });
        } catch {
            return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
        }
        lanzarPasadaAutopublicar();
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "vetar") {
        const clave = typeof cuerpo.clave === "string" ? cuerpo.clave.trim() : "";
        const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim() : "";
        if (!clave) return Response.json({ error: "Falta la clave (sha o tarea) a vetar." }, { status: 400 });
        try {
            const actuales = await leerJson(rutaVetos());
            const vetos = esObjeto(actuales) ? actuales : {};
            vetos[clave] = { quien: "mando", motivo, desde: ahora };
            await escribirAtomico(rutaVetos(), vetos);
        } catch {
            return Response.json({ error: "No se pudo guardar el veto." }, { status: 500 });
        }
        return Response.json({ ok: true, vetada: clave }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "modo") {
        const modo = typeof cuerpo.modo === "string" ? cuerpo.modo : "";
        if (!MODOS.includes(modo as ModoProduccion)) {
            return Response.json({ error: "El modo debe ser 'seco', 'canario' o 'auto'." }, { status: 400 });
        }
        try {
            const crudo = await leerJson(rutaConfig());
            const existente = esObjeto(crudo) ? fusionar(DEFAULTS, crudo) : DEFAULTS;
            const pausado = esObjeto(crudo) ? Boolean(crudo.pausado) : false;
            const final = fusionar(existente, { produccion: { modo } });
            await escribirAtomico(rutaConfig(), { ...final, pausado });
            return Response.json({ ok: true, modo: final.produccion.modo }, { headers: { "Cache-Control": "no-store" } });
        } catch {
            return Response.json({ error: "No se pudo guardar el modo." }, { status: 500 });
        }
    }

    return Response.json({ error: "Acción desconocida: usa pausar, reanudar, vetar, modo o autopublicar." }, { status: 400 });
}
