/**
 * /api/mando/lanzamientos/pruebas (VER1111F · contrato `architecture/centro-versiones-1105.md` §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → las versiones de prueba (en marcha y las últimas), su build por plataforma, lo que traen, sus
 *        comprobaciones en aparatos y `resumen` («prueba.36 · Android compilando 12 min · 3 de 8 comprobaciones»).
 * POST → `marcar` una comprobación (Alex, con un toque) o `aprobar` una prueba publicada en todas sus
 *        plataformas: registra la aprobación en `pruebas-comprobaciones.json` y escribe la petición
 *        `aprobar-prueba` que el director de lanzamientos toma en su próxima pasada.
 *
 * ⚠️ Solo local (`guardianMando`). «Aprobar» además solo desde ESTA máquina y desde la página (no un agente,
 * una tarea programada ni otra neurona): `esPeticionDeEstaMaquina` + `Sec-Fetch-Site: same-origin`. Nunca
 * devuelve rutas del disco ni claves.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import {
    aplicarArchivo,
    marcarComprobacion,
    planDeAprobacion,
    registroDeAprobacion,
    resumenPruebas,
    validarPeticionPruebas,
} from "@/lib/mando/lanzamientos-pruebas";
import {
    cabezaDeMain,
    escribirAtomico,
    escribirComprobaciones,
    hayPeticionPendiente,
    leerComprobaciones,
    pruebasCompartidas,
    reunirPruebas,
    rutaPeticionLanzamientos,
} from "@/lib/mando/lanzamientos-pruebas-fuentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    try {
        const [foto, archivo] = await Promise.all([pruebasCompartidas(), leerComprobaciones()]);
        const versiones = aplicarArchivo(foto.versiones, archivo);
        return Response.json(
            { ...foto, versiones, resumen: resumenPruebas(versiones, Date.now()), aprobarAqui: esPeticionDeEstaMaquina(peticion) },
            { headers: SIN_CACHE },
        );
    } catch {
        return Response.json({ error: "No se pudieron leer las versiones de prueba." }, { status: 500, headers: SIN_CACHE });
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const p = validarPeticionPruebas(cuerpo);
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 });
    const ahora = new Date().toISOString();

    if (p.accion === "marcar") {
        try {
            const archivo = marcarComprobacion(await leerComprobaciones(), p.numero, p.id, p.estado, "alex", ahora, p.nota);
            await escribirComprobaciones(archivo);
            return Response.json({ ok: true }, { headers: SIN_CACHE });
        } catch (e) {
            const motivo = e instanceof Error && e.message.startsWith("No existe") ? e.message : "No se pudo guardar la comprobación.";
            return Response.json({ error: motivo }, { status: motivo.startsWith("No existe") ? 404 : 500 });
        }
    }

    // ── Aprobar: solo la Genesis local, desde su propia página ─────────────────────────────────────
    if (!esPeticionDeEstaMaquina(peticion) || peticion.headers.get("sec-fetch-site") !== "same-origin") {
        return Response.json({ error: "Solo se aprueba desde Genesis en esta Mac." }, { status: 403 });
    }
    const archivo = await leerComprobaciones();
    const previa = archivo.pruebas[String(p.numero)]?.aprobacion;
    if (previa && previa.sha === p.sha) {
        return Response.json({ ok: true, repetida: true, aprobacion: previa }, { headers: SIN_CACHE });
    }
    // Los datos de AHORA, no los del panel: lo que se aprueba es lo que hay.
    pruebasCompartidas.olvidar();
    const foto = await reunirPruebas();
    const v = aplicarArchivo(foto.versiones, archivo).find((x) => x.numero === p.numero);
    if (!v) return Response.json({ error: "No encuentro esa prueba." }, { status: 404 });
    if (v.sha !== p.sha) return Response.json({ error: "El commit de esa prueba no es el que se ve en el panel." }, { status: 409 });
    const plan = planDeAprobacion(v, foto.web);
    if (!plan.puede) return Response.json({ error: plan.motivo }, { status: 409 });
    const cabeza = await cabezaDeMain();
    if (!cabeza) return Response.json({ error: "No pude leer main: no apruebo a ciegas." }, { status: 503 });
    if (p.lanzar_sha !== cabeza) {
        return Response.json(
            { error: p.lanzar_sha === p.sha
                ? "Main avanzó desde el commit probado: el director no sabe lanzar un commit que no sea la cabeza de main. Mira lo añadido y elige."
                : "Main avanzó otra vez desde que lo miraste: vuelve a mirarlo antes de aprobar." },
            { status: 409 },
        );
    }
    if (hayPeticionPendiente()) {
        return Response.json({ error: "El director aún no ha leído la petición anterior: espera a su próxima pasada." }, { status: 409 });
    }
    const registro = registroDeAprobacion(v, p.lanzar_sha, ahora);
    const prueba = archivo.pruebas[String(p.numero)] ?? { version: v.version ?? "", sha: v.sha ?? "", comprobaciones: [], aprobacion: null };
    try {
        await escribirComprobaciones({ ...archivo, pruebas: { ...archivo.pruebas, [String(p.numero)]: { ...prueba, version: v.version ?? prueba.version, sha: p.sha, aprobacion: registro } } });
        await escribirAtomico(rutaPeticionLanzamientos(), {
            accion: "aprobar-prueba",
            version: v.version,
            sha: p.sha,
            lanzar_sha: p.lanzar_sha,
            quien: "genesis",
            t: ahora,
        });
    } catch {
        // Sin petición no hay aprobación: se deshace el registro.
        await escribirComprobaciones(archivo).catch(() => undefined);
        return Response.json({ error: "No se pudo guardar la aprobación." }, { status: 500 });
    }
    return Response.json({ ok: true, aprobacion: registro }, { headers: SIN_CACHE });
}
