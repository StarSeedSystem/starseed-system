import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { guardianMando } from "@/lib/mando/guardian";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Modo = "plan" | "escribir";
type Estado = "en_curso" | "integrada" | "fallo" | "plan_dejado";
type Sugerencia = {
    id: string; titulo: string; tipo: string; agente: string; modelo: string; motivo: string;
    coste_estimado: string; cupo_queda: string; modo: Modo; prioridad: number; visto: string;
};
type Aprobada = Sugerencia & { estado: Estado; aprobada_en: string; duracion_aprobacion?: number };
type Ventana = { tipo: string; horas: number; aprobada_en: string; expira_en: string };
type Registro = { aprobadas: Aprobada[]; rechazadas: Sugerencia[]; ventanas: Ventana[] };
function objeto(valor: unknown): Record<string, unknown> { return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}; }
function elementos(valor: unknown): unknown[] { return Array.isArray(valor) ? valor : []; }
function texto(valor: unknown, defecto = ""): string { return typeof valor === "string" ? valor : defecto; }
function numero(valor: unknown): number { return typeof valor === "number" && Number.isFinite(valor) ? valor : 0; }
function rutaSugerencias(): string { return path.join(os.homedir(), ".starseed", "capacidad-sugerencias.json"); }
function rutaAprobadas(): string { return path.join(os.homedir(), ".starseed", "capacidad-aprobadas.json"); }
async function leerJson(ruta: string): Promise<unknown> { try { return JSON.parse(await readFile(ruta, "utf-8")) as unknown; } catch { return null; } }
async function escribirJson(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true }); const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}
function sugerenciaDe(valor: unknown): Sugerencia | null {
    const o = objeto(valor); const id = texto(o.id).trim();
    if (!id) return null;
    return {
        id, titulo: texto(o.titulo), tipo: texto(o.tipo), agente: texto(o.agente), modelo: texto(o.modelo),
        motivo: texto(o.motivo), coste_estimado: texto(o.coste_estimado), cupo_queda: texto(o.cupo_queda),
        modo: o.modo === "escribir" ? "escribir" : "plan", prioridad: numero(o.prioridad), visto: texto(o.visto),
    };
}
function aprobadaDe(valor: unknown): Aprobada | null {
    const sugerencia = sugerenciaDe(valor); const o = objeto(valor);
    if (!sugerencia) return null;
    const estados: Estado[] = ["en_curso", "integrada", "fallo", "plan_dejado"];
    const estado = estados.includes(texto(o.estado) as Estado) ? (texto(o.estado) as Estado) : "en_curso";
    return {
        ...sugerencia, estado, aprobada_en: texto(o.aprobada_en),
        ...(typeof o.duracion_aprobacion === "number" ? { duracion_aprobacion: o.duracion_aprobacion } : {}),
    };
}
function registroDe(valor: unknown): Registro {
    const o = objeto(valor);
    const ventanas = elementos(o.ventanas).flatMap((v): Ventana[] => {
        const item = objeto(v);
        const tipo = texto(item.tipo).trim();
        if (!tipo) return [];
        return [{ tipo, horas: numero(item.horas), aprobada_en: texto(item.aprobada_en), expira_en: texto(item.expira_en) }];
    });
    return {
        aprobadas: elementos(o.aprobadas).flatMap((v) => { const a = aprobadaDe(v); return a ? [a] : []; }),
        rechazadas: elementos(o.rechazadas).flatMap((v) => { const s = sugerenciaDe(v); return s ? [s] : []; }),
        ventanas,
    };
}
function reemplazar(lista: Aprobada[], nueva: Aprobada): Aprobada[] {
    const indice = lista.findIndex((a) => a.id === nueva.id);
    if (indice < 0) return [...lista, nueva];
    const copia = [...lista]; copia[indice] = nueva; return copia;
}
function activa(ventana: Ventana, ahora: number): boolean { return Date.parse(ventana.expira_en) > ahora; }
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const [fuenteBruta, registroBruto] = await Promise.all([leerJson(rutaSugerencias()), leerJson(rutaAprobadas())]);
    const fuente = objeto(fuenteBruta);
    const registro = registroDe(registroBruto);
    const ahora = Date.now();
    const decididas = new Set([...registro.aprobadas.map((a) => a.id), ...registro.rechazadas.map((s) => s.id)]);
    const tiposAprobados = new Set(registro.ventanas.filter((v) => activa(v, ahora)).map((v) => v.tipo));
    const sugerencias = elementos(fuente.sugerencias).flatMap((v) => {
        const s = sugerenciaDe(v); return s && !decididas.has(s.id) && !tiposAprobados.has(s.tipo) ? [s] : [];
    });
    const sinCupo = elementos(fuente.sin_cupo).flatMap((v) => {
        const o = objeto(v); const id = texto(o.id).trim();
        return id ? [{ id, titulo: texto(o.titulo), tipo: texto(o.tipo), prioridad: numero(o.prioridad) }] : [];
    });
    return Response.json({ sugerencias, sin_cupo, total: sugerencias.length, visto: texto(fuente.visto) },
        { headers: { "Cache-Control": "no-store" } });
}
export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const cuerpo = objeto(await peticion.json().catch(() => null));
    const accion = texto(cuerpo.accion);
    if (!["aprobar", "rechazar", "aprobar-tipo"].includes(accion)) {
        return Response.json({ error: "Acción no válida." }, { status: 400 });
    }
    const [fuenteBruta, registroBruto] = await Promise.all([leerJson(rutaSugerencias()), leerJson(rutaAprobadas())]);
    const fuente = objeto(fuenteBruta); const registro = registroDe(registroBruto);
    const sugerencias = elementos(fuente.sugerencias).flatMap((v) => { const s = sugerenciaDe(v); return s ? [s] : []; });
    const ahora = new Date(); const iso = ahora.toISOString();
    if (accion === "aprobar-tipo") {
        const tipo = texto(cuerpo.tipo).trim(); const horas = numero(cuerpo.horas);
        if (!tipo || ![1, 8, 24].includes(horas)) return Response.json({ error: "Tipo o duración no válidos." }, { status: 400 });
        const expira = new Date(ahora.getTime() + horas * 3_600_000).toISOString();
        registro.ventanas = [...registro.ventanas.filter((v) => v.tipo !== tipo), { tipo, horas, aprobada_en: iso, expira_en: expira }];
        for (const s of sugerencias.filter((s) => s.tipo === tipo)) {
            registro.aprobadas = reemplazar(registro.aprobadas, { ...s, estado: "en_curso", aprobada_en: iso, duracion_aprobacion: horas });
        }
    } else {
        const id = texto(cuerpo.id).trim(); const sugerencia = sugerencias.find((s) => s.id === id);
        if (!id || !sugerencia) return Response.json({ error: "La sugerencia no existe." }, { status: 404 });
        if (accion === "aprobar") {
            registro.aprobadas = reemplazar(registro.aprobadas, { ...sugerencia, estado: "en_curso", aprobada_en: iso });
        } else {
            registro.rechazadas = [...registro.rechazadas.filter((s) => s.id !== id), sugerencia];
            registro.aprobadas = registro.aprobadas.filter((a) => a.id !== id);
        }
    }
    try { await escribirJson(rutaAprobadas(), registro); }
    catch { return Response.json({ error: "No se pudo guardar la decisión." }, { status: 500 }); }
    return Response.json({ ok: true, accion, total: registro.aprobadas.length }, { headers: { "Cache-Control": "no-store" } });
}
