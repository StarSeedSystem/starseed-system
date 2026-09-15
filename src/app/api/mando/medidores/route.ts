/**
 * /api/mando/medidores — lo que hay detrás de cada medidor, y las acciones.
 *
 * GET  ?clave=bloqueadas  → el detalle (filas, porqués y acciones legales).
 * POST { clave, accion, id?, texto? } → ejecuta una acción sobre progreso.json.
 *
 * Las REGLAS viven en `@/lib/mando/medidores` (puro). Aquí solo se lee el disco y
 * se escribe con cuidado. Tres guardias que no se saltan:
 *   1. Nunca se toca una tarea en `commit` o `hecho`: 409 y se dice por qué.
 *   2. `reintentar` sin texto → 400. Un reintento sin cambio descrito es el mismo
 *      intento y va a fallar exactamente igual.
 *   3. Se escribe a un `.tmp` y se renombra: el orquestador escribe ese mismo
 *      archivo a la vez y un volcado a medias lo dejaría ilegible.
 */
import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { leerColas, leerLatidosDelBus, leerProgreso } from "@/lib/mando/lector-local";
import {
    TERMINALES,
    detalleDeMedidor,
    type ClaveMedidor,
    type DatosMedidores,
} from "@/lib/mando/medidores";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const RAÍZ = raizDelProyecto();
const PROGRESO = path.join(RAÍZ, "starseed_memory_root", "olas", "progreso.json");

type Entrada = { estado?: string; nota?: string; t?: string; modelo?: string; [k: string]: unknown };

async function git(args: string[]): Promise<string> {
    try {
        const { stdout } = await correr("git", args, { cwd: RAÍZ, timeout: 20_000, maxBuffer: 4_000_000 });
        return stdout;
    } catch {
        return "";
    }
}

async function leerEntradas(): Promise<Record<string, Entrada>> {
    const crudo = await leerProgreso();
    const salida: Record<string, Entrada> = {};
    for (const [k, v] of Object.entries(crudo)) {
        if (v && typeof v === "object") salida[k] = v as Entrada;
    }
    return salida;
}

async function reunir(): Promise<Partial<DatosMedidores>> {
    const [progreso, colas, bus] = await Promise.all([
        leerEntradas(),
        leerColas().catch(() => []),
        leerLatidosDelBus().catch(() => ({ latidos: [], enjambres: [] })),
    ]);

    const titulos: Record<string, string> = {};
    for (const t of colas) titulos[t.id] = t.titulo;

    // Commits que esta rama tiene y el remoto no.
    const salida = await git(["log", "@{upstream}..HEAD", "--format=%H%x1f%s%x1f%cI"]);
    const commitsSinPublicar = salida
        .split("\n")
        .filter(Boolean)
        .map((l) => {
            const [sha, asunto, fecha] = l.split("");
            return { sha: sha ?? "", asunto: asunto ?? "", fecha: fecha ?? "" };
        });

    // Ejecutables ahora: definidas por una cola y sin estado que lo impida.
    const ABIERTOS = new Set(["pendiente", ""]);
    const ejecutables = colas
        .filter((t) => ABIERTOS.has(progreso[t.id]?.estado ?? ""))
        .map((t) => ({ id: t.id, titulo: t.titulo, ola: t.ola }));

    return {
        progreso,
        titulos,
        latidos: bus.latidos.map((l) => ({
            tarea: l.tarea,
            fase: l.fase,
            modelo: l.modelo,
            minutos: l.minutos,
            donde: l.donde,
            proveedor: l.proveedor,
        })),
        commitsSinPublicar,
        ejecutables,
    };
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const clave = (new URL(peticion.url).searchParams.get("clave") ?? "ola-activa") as ClaveMedidor;
    // Un fallo leyendo git o el bus no puede tumbar el panel: se devuelve lo que sí haya.
    const datos = await reunir().catch(() => ({}));
    return Response.json(
        { detalle: detalleDeMedidor(clave, datos), generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

async function guardar(entradas: Record<string, Entrada>): Promise<void> {
    const texto = JSON.stringify(entradas, null, 1);
    const temporal = `${PROGRESO}.tmp-${process.pid}`;
    await writeFile(temporal, texto, "utf8");
    await rename(temporal, PROGRESO);
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: { clave?: string; accion?: string; id?: string; texto?: string };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const { clave = "", accion = "", id = "", texto = "" } = cuerpo;

    if (accion === "publicar") {
        return Response.json(
            {
                error:
                    "Publicar pasa por la pestaña Publicar, que corre tsc, vitest y las pruebas del puente antes de empujar.",
            },
            { status: 409 },
        );
    }

    if (accion === "reintentar" && !texto.trim()) {
        return Response.json(
            { error: "Describe qué hay que cambiar: reintentar sin cambio da exactamente el mismo resultado." },
            { status: 400 },
        );
    }

    const crudo = await readFile(PROGRESO, "utf8").catch(() => "{}");
    let entradas: Record<string, Entrada>;
    try {
        entradas = JSON.parse(crudo) as Record<string, Entrada>;
    } catch {
        return Response.json({ error: "progreso.json ilegible; no toco nada." }, { status: 500 });
    }

    const ahora = new Date().toISOString().slice(0, 16).replace("T", " ");
    const objetivo =
        accion === "descartar-todas"
            ? detalleDeMedidor(clave as ClaveMedidor, { progreso: entradas }).filas.map((f) => f.id)
            : id
              ? [id]
              : [];

    if (objetivo.length === 0) {
        return Response.json({ error: "No hay ninguna tarea a la que aplicar esto." }, { status: 400 });
    }

    const intocables = objetivo.filter((t) => TERMINALES.has(entradas[t]?.estado ?? ""));
    if (intocables.length > 0) {
        return Response.json(
            { error: `${intocables.join(", ")} ya está en main: eso no se toca desde un panel.` },
            { status: 409 },
        );
    }

    const hechas: string[] = [];
    for (const t of objetivo) {
        const e = entradas[t];
        if (!e) continue;
        if (accion === "descartar" || accion === "descartar-todas") {
            e.estado = "rechazada";
            e.nota = `descartada desde el medidor «${clave}» el ${ahora}`;
        } else if (accion === "reintentar") {
            e.estado = "pendiente";
            e.nota = `reintento pedido desde el Mando: ${texto.trim().slice(0, 400)}`;
            e.cambio_pedido = texto.trim().slice(0, 2000);
            // La rotación empieza de cero: si no, arrastra los modelos que fallaron con el
            // prompt VIEJO, que es justo el que se acaba de cambiar.
            delete e.modelos_fallidos;
            delete e.escalada;
        } else {
            return Response.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
        }
        e.reconciliado = ahora;
        hechas.push(t);
    }

    await guardar(entradas);
    return Response.json({ ok: true, tareas: hechas, accion }, { headers: { "Cache-Control": "no-store" } });
}
