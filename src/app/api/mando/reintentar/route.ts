/** API local que convierte fallos en reparaciones y las adelanta en la cola viva. */
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { orquestadoresVivos } from "@/lib/mando/procesos-orquestador";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    ejecutarReintentoInteligente,
    ponerPrimera,
    type FuentesCambio,
    type TareaAnalizar,
} from "@/lib/mando/reintento-inteligente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ejecutar = promisify(execFile);

interface Cuerpo {
    ids?: string[];
    cambio?: string;
    automatico?: boolean;
    escalar?: boolean;
}

async function texto(ruta: string): Promise<string> {
    try { return await readFile(ruta, "utf8"); } catch { return ""; }
}

async function json(ruta: string): Promise<unknown> {
    try { return JSON.parse(await readFile(ruta, "utf8")) as unknown; } catch { return null; }
}

async function atomico(ruta: string, datos: unknown): Promise<void> {
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf8");
    await rename(temporal, ruta);
}

function lista(valor: unknown): TareaAnalizar[] {
    const crudo: unknown[] = Array.isArray(valor) ? valor
        : valor && typeof valor === "object" && "tareas" in valor && Array.isArray(valor.tareas) ? valor.tareas : [];
    return crudo.filter((t): t is TareaAnalizar => Boolean(t && typeof t === "object" && "id" in t && typeof t.id === "string"));
}

async function directorioOlas(): Promise<string> {
    const raiz = raizDelProyecto();
    for (const relativa of ["starseed_memory_root/olas", "olas"]) {
        const ruta = path.join(raiz, relativa);
        try { await readdir(ruta); return ruta; } catch { /* prueba la alternativa local */ }
    }
    return path.join(raiz, "starseed_memory_root", "olas");
}

function cadenas(valor: unknown): string[] {
    if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === "string");
    return [];
}

async function modelosDisponibles(progreso: unknown): Promise<string[]> {
    const ruta = path.join(homedir(), ".starseed", "optimizador", "rotacion-optimizada.json");
    const rotacion = await json(ruta);
    const datos = rotacion && typeof rotacion === "object" ? rotacion as Record<string, unknown> : {};
    const recomendados: string[] = [];
    if (progreso && typeof progreso === "object" && !Array.isArray(progreso)) {
        for (const valor of Object.values(progreso)) {
            if (!valor || typeof valor !== "object") continue;
            const entrada = valor as Record<string, unknown>;
            for (const clave of ["modelo_diseno", "modelo_recomendado", "recomendacion_modelo"]) {
                if (typeof entrada[clave] === "string") recomendados.push(entrada[clave]);
            }
        }
    }
    return [...new Set([...recomendados, ...cadenas(datos.delante), ...cadenas(datos.probar), ...cadenas(datos.detras)])];
}

async function marcarAdelantadas(dir: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const programa = [
        "import fcntl,json,os,sys,time", "p,l,u=sys.argv[1:4]", "os.makedirs(os.path.dirname(l),exist_ok=True)",
        "f=open(l,'a+')", "fcntl.flock(f,fcntl.LOCK_EX)",
        "try:\n d=json.load(open(p)) if os.path.exists(p) else {}\nexcept Exception:\n d={}",
        "for i in json.loads(u):\n e=d.get(i) if isinstance(d.get(i),dict) else {}\n e.update({'estado':'pendiente','adelantar':time.strftime('%Y-%m-%d %H:%M:%S')})\n d[i]=e",
        "t=p+'.tmp-'+str(os.getpid());json.dump(d,open(t,'w'),ensure_ascii=False,indent=1);os.replace(t,p)",
        "fcntl.flock(f,fcntl.LOCK_UN);f.close()",
    ].join("\n");
    const lock = path.join(homedir(), ".starseed", "cerrojos", "progreso.lock");
    await ejecutar("python3", ["-c", programa, path.join(dir, "progreso.json"), lock, JSON.stringify(ids)]);
}

async function fuentesPorId(dir: string, ids: string[], revisionesMd: string, progreso: unknown): Promise<Record<string, FuentesCambio>> {
    const eventos = await texto(path.join(dir, "eventos.jsonl"));
    const pares = await Promise.all(ids.map(async (id) => {
        const pasos = await texto(path.join(dir, "pasos", `${id}.jsonl`));
        const log = await texto(path.join(dir, "logs", `${id}.log`));
        const entrada = progreso && typeof progreso === "object" && !Array.isArray(progreso)
            ? (progreso as Record<string, unknown>)[id] : null;
        const datos = entrada && typeof entrada === "object" ? entrada as Record<string, unknown> : {};
        const faltantes = cadenas(datos.faltantes ?? datos.archivos_faltantes);
        return [id, { revisionesMd, eventos, pasos, log, faltantes }] as const;
    }));
    return Object.fromEntries(pares);
}

export async function POST(peticion: Request): Promise<Response> {
    try {
        const veto = await guardianMando(peticion);
        if (veto) return veto;
        const recibido = await peticion.json().catch(() => ({})) as Partial<Cuerpo>;
        const cuerpo: Cuerpo = {
            ids: Array.isArray(recibido.ids) ? recibido.ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : undefined,
            cambio: typeof recibido.cambio === "string" ? recibido.cambio : undefined,
            automatico: recibido.automatico !== false,
            escalar: recibido.escalar === true,
        };
        if (!cuerpo.automatico && !cuerpo.cambio?.trim() && !cuerpo.escalar) {
            return Response.json({ error: "Escribe el cambio o activa la reparación automática." }, { status: 400 });
        }

        const dir = await directorioOlas();
        await mkdir(dir, { recursive: true });
        const progreso = await json(path.join(dir, "progreso.json")) ?? {};
        const revisionesMd = await texto(path.join(dir, "revisiones.md"));
        const nombres = await readdir(dir).catch(() => []);
        const colas = nombres.filter((n) => n.startsWith("cola-") && n.endsWith(".json") && !n.includes(".tmp"));
        const tareas = (await Promise.all(colas.map(async (n) => lista(await json(path.join(dir, n)))))).flat();
        const idsProgreso = progreso && typeof progreso === "object" ? Object.keys(progreso) : [];
        const idsFuentes = [...new Set([...(cuerpo.ids ?? []), ...idsProgreso, ...tareas.map((t) => t.id)])];
        const fuentes = await fuentesPorId(dir, idsFuentes, revisionesMd, progreso);
        const resultado = ejecutarReintentoInteligente({
            ids: cuerpo.ids, progreso, revisionesMd, colasTareas: tareas, fuentes,
            cambio: cuerpo.cambio, modelos: await modelosDisponibles(progreso), escalar: cuerpo.escalar,
        });

        if (resultado.reencoladas.length) {
            const viva = (await orquestadoresVivos()).find((p) => p.cola)?.cola;
            const archivo = viva && path.basename(viva) === viva ? viva : `cola-reintentos-${new Date().toISOString().slice(0, 10)}.json`;
            const ruta = path.join(dir, archivo);
            const ordenada = ponerPrimera(lista(await json(ruta)), resultado.reencoladas);
            await atomico(ruta, ordenada);
            await marcarAdelantadas(dir, resultado.reencoladas.map((t) => t.id));
            for (const r of resultado.resultados) {
                if (r.sucesor) r.posicion = ordenada.findIndex((t) => t.id === r.sucesor) + 1;
            }
        }

        const resultados = resultado.resultados.map((r) => ({
            ...r,
            texto: r.accion === "reintentada" ? `reintentada como ${r.sucesor} (posición ${r.posicion})`
                : `${r.accion}${r.motivo ? `: ${r.motivo}` : ""}`,
        }));
        return Response.json({
            resultados, reintentadas: resultado.reintentadas, escaladas: resultado.escaladas,
            esperando: resultado.esperando, descartadas: resultado.descartadas,
        }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "No se pudo procesar la reparación." }, {
            status: 500, headers: { "Cache-Control": "no-store" },
        });
    }
}
