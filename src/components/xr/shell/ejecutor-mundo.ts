"use client";

/**
 * StarSeed XR · EJECUTOR de intenciones de mundo (contrato §3 f y g): traduce un `PasoVoz` ya
 * entendido a la acción real (crear o editar `MundoSpec`, ir a un destino) con `validarMundo` y `adaptarANivel`.
 */

import { deshacerCreacionEscena } from "@/lib/vivo/escena3d";
import { crearVivoXr, rutaSalaXr } from "@/lib/vivo/xr";
import { guardarMundo, mundoDesdePlantilla, problemasLegibles } from "@/lib/vivo/xr-mundo";
import { adaptarANivel, validarMundo } from "@/lib/xr/mundo-spec";
import { CIELOS_MUNDO, LIMITES, TERRENOS, type CieloMundo, type MundoSpec } from "@/lib/xr/mundo-tipos";
import type { Intencion, PasoVoz } from "@/lib/xr/intenciones-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";

export interface MundoEnContexto { refId: string; mundo: MundoSpec }

export interface ContextoMundo {
    nivel: NivelCalidad;
    razonar: (prompt: string) => Promise<string>;
    mundoActual?: MundoEnContexto | null;
    creado?: MundoEnContexto | null;
    crear?: (nombre: string) => Promise<{ refId: string; ruta: string }>;
    guardar?: (refId: string, mundo: MundoSpec) => Promise<void>;
    deshacerCreacion?: (refId: string) => Promise<void>;
}

export type ResultadoMundo = { ok: true; refId: string; ruta: string; resumen: string; deshacer: () => Promise<void> } | { ok: false; motivo: string };

type IntencionCrear = Extract<Intencion, { tipo: "crear-mundo" }>;
type IntencionEditar = Extract<Intencion, { tipo: "editar-mundo" }>;

function promptMundo(i: IntencionCrear, nivel: NivelCalidad, correccion: string): string {
    const l = LIMITES[nivel];
    return [
        'Eres Astraura. Devuelve SOLO un JSON de MundoSpec (version 1, tipo "mundo-xr"), sin texto alrededor.',
        `Descripción: ${i.descripcion || "(sin descripción)"}. Características: ${i.caracteristicas.join(", ") || "ninguna"}.`,
        `Vocabulario cerrado: cielo ${CIELOS_MUNDO.join("|")}; terreno ${TERRENOS.join("|")}; modo vr|ar|ambos. Nada de scripts, HTML ni URLs que no sean https.`,
        `Límites del nivel ${nivel}: ${l.objetos} objetos, ${l.luces} luces, ${l.cuerpos} cuerpos, ${l.portales} portales, ${l.pantallas} pantallas, ${l.pizarras} pizarras, ${l.zonas} zonas, ${l.triangulos} triángulos, ${l.jugadores} jugadores.`,
        correccion,
    ].filter(Boolean).join("\n");
}
function extraerJson(t: string): unknown {
    const i = t.indexOf("{"), f = t.lastIndexOf("}");
    try { return i >= 0 && f > i ? JSON.parse(t.slice(i, f + 1)) : null; } catch { return null; }
}
async function pedirMundo(i: IntencionCrear, ctx: ContextoMundo): Promise<{ mundo: MundoSpec } | { motivo: string }> {
    let correccion = "", ultimos: string[] = [];
    for (let intento = 0; intento < 2; intento++) {
        let texto: string;
        try { texto = await ctx.razonar(promptMundo(i, ctx.nivel, correccion)); }
        catch { return { motivo: "Astraura no pudo responder para crear el mundo." }; }
        const r = validarMundo(extraerJson(texto));
        if (r.ok && r.mundo) return { mundo: r.mundo };
        ultimos = problemasLegibles(r.problemas);
        correccion = `Corrige estos problemas y devuelve el JSON completo otra vez: ${ultimos.join(" · ")}`;
    }
    return { motivo: `El mundo propuesto no es válido: ${ultimos.join(" · ")}` };
}
const modoRuta = (m: MundoSpec["modo"]): "vr" | "ar" | null => (m === "ar" ? "ar" : m === "vr" ? "vr" : null);
async function crearMundo(i: IntencionCrear, ctx: ContextoMundo): Promise<ResultadoMundo> {
    let mundo: MundoSpec;
    if (i.libre) {
        const r = await pedirMundo(i, ctx);
        if ("motivo" in r) return { ok: false, motivo: r.motivo };
        mundo = { ...r.mundo, modo: i.modo };
    } else {
        mundo = { ...mundoDesdePlantilla(i.descripcion, i.caracteristicas), modo: i.modo };
    }
    const { mundo: adaptado, recortes } = adaptarANivel(mundo, ctx.nivel);
    const sala = await (ctx.crear ?? crearVivoXr)(adaptado.nombre);
    try {
        await (ctx.guardar ?? guardarMundo)(sala.refId, adaptado);
    } catch (e) {
        await (ctx.deshacerCreacion ?? deshacerCreacionEscena)(sala.refId);
        return { ok: false, motivo: e instanceof Error ? e.message : "No pude guardar el mundo creado." };
    }
    return {
        ok: true, refId: sala.refId, ruta: rutaSalaXr(sala.refId, modoRuta(adaptado.modo)),
        resumen: `Mundo «${adaptado.nombre}» listo${recortes.length ? `: ${recortes.join(" ")}` : "."}`,
        deshacer: () => (ctx.deshacerCreacion ?? deshacerCreacionEscena)(sala.refId),
    };
}
async function editarMundo(i: IntencionEditar, ctx: ContextoMundo): Promise<ResultadoMundo> {
    const objetivo = i.sobre === "lo-creado" ? ctx.creado : ctx.mundoActual;
    if (!objetivo) return { ok: false, motivo: i.sobre === "lo-creado" ? "No hay un mundo recién creado que editar." : "No hay un mundo abierto que editar." };
    if (i.campo === "otro") return { ok: false, motivo: "Solo puedo cambiar el cielo o la gravedad de un mundo." };
    const antes = objetivo.mundo;
    const siguiente = i.campo === "cielo"
        ? { ...antes, entorno: { ...antes.entorno, cielo: i.valor as CieloMundo } }
        : { ...antes, fisica: { ...antes.fisica, gravedad: i.valor === "cero" ? 0 : i.valor === "luna" ? -1.62 : -9.81 } };
    const r = validarMundo(siguiente);
    if (!r.ok || !r.mundo) return { ok: false, motivo: `El cambio no es válido: ${problemasLegibles(r.problemas).join(" · ")}` };
    const { mundo: adaptado, recortes } = adaptarANivel(r.mundo, ctx.nivel);
    const guardar = ctx.guardar ?? guardarMundo;
    await guardar(objetivo.refId, adaptado);
    return {
        ok: true, refId: objetivo.refId, ruta: rutaSalaXr(objetivo.refId, modoRuta(adaptado.modo)),
        resumen: `Cambiado ${i.campo} en «${adaptado.nombre}»${recortes.length ? `: ${recortes.join(" ")}` : "."}`,
        deshacer: async () => { await guardar(objetivo.refId, antes); },
    };
}
function rutaDestino(d: Extract<Intencion, { tipo: "ir-a" }>["destino"]): string {
    if (d.tipo === "estacion") return `/estaciones/${encodeURIComponent(d.id)}`;
    if (d.tipo === "servidor") return `/servidores-apps?panel=${encodeURIComponent(d.id)}`;
    return d.tipo === "grupo" ? "/comunidad" : "/messages";
}
export async function ejecutarMundo(paso: PasoVoz, ctx: ContextoMundo): Promise<ResultadoMundo> {
    const i = paso.intencion;
    try {
        if (i.tipo === "crear-mundo") return await crearMundo(i, ctx);
        if (i.tipo === "editar-mundo") return await editarMundo(i, ctx);
        if (i.tipo === "ir-a") return { ok: true, refId: i.destino.id, ruta: rutaDestino(i.destino), resumen: `Ir a «${i.destino.nombre}».`, deshacer: async () => {} };
        if (i.tipo === "abrir") return { ok: true, refId: "", ruta: i.que === "pizarra" ? "/pizarra" : "/llamada", resumen: `Abrir ${i.que}${i.con.length ? ` con ${i.con.map((x) => x.nombre).join(", ")}` : ""}.`, deshacer: async () => {} };
        return { ok: false, motivo: "Esta orden no la ejecuta el mundo: la aplica el almacén XR." };
    } catch (e) {
        return { ok: false, motivo: `No pude completarlo: ${e instanceof Error ? e.message : "error inesperado"}.` };
    }
}
