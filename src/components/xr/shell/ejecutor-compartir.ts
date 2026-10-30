/**
 * StarSeed XR · EJECUTOR de las intenciones de COMPARTIR (contrato §3 f): invitar y subir
 * (biblioteca · estación · publicación · mensaje). Módulo PURO: las entidades del OS de verdad
 * (escena, miembros, acceso, mensajería, biblioteca, estaciones, publicaciones) llegan
 * INYECTADAS en `ctx.deps` (las cablea XR1010T). Reglas: `puedeInvitar` (solo dueño/editor),
 * nunca inventa gente (miembros imaginados = fallo honesto), publicar para todo el mundo
 * exige consentimiento vigente (`evaluarSalida`) y todo lo que sale de la cuenta pasa por
 * la tarjeta ya confirmada: sin `confirmado: true` no se ejecuta nada (nunca en bucle).
 */
import type { Intencion, PasoVoz, RefResuelta } from "@/lib/xr/intenciones-tipos";
import { saleDeLaCuenta } from "@/lib/xr/intenciones-voz";
import { evaluarSalida, type Consentimiento } from "@/lib/xr/privacidad";
import { puedeInvitar, type Sala } from "@/lib/salas/sala";
import { buildInviteAttachment } from "@/lib/invitations/invitations";

type IInvitar = Extract<Intencion, { tipo: "invitar" }>;
type ISubir = Extract<Intencion, { tipo: "subir" }>;
interface FalloCompartir { ok: false; motivo: string }

export interface MiembroGrupo { id: string; nombre: string }

export interface DepsCompartir {
    /** Escena actual con su matriz de roles (para `puedeInvitar`); null → se niega de forma honesta. */
    sala: Sala | null;
    /** Lectura real de miembros de un grupo (resolver-miembros.ts). */
    miembrosDeGrupo(grupoId: string): Promise<MiembroGrupo[]>;
    /** concederAccesoEscena: cuántas invitaciones se lograron. */
    concederAcceso(refId: string, userIds: string[], permiso: "ver" | "editar"): Promise<number>;
    /** Mensajería real: cuántos mensajes se enviaron. */
    enviarMensaje(userIds: string[], texto: string, adjunto?: object): Promise<number>;
    /** entity-library.saveItem. */
    guardarBiblioteca(titulo: string, refId: string): Promise<{ ok: boolean; id?: string; error?: string }>;
    /** estaciones/crear-sesion.ts (estación nueva o existente). */
    subirEstacion(d: { nueva: boolean; estacionId: string | null; titulo: string | null }): Promise<{ ok: boolean; id?: string; error?: string }>;
    /** os-social.createPost con la visibilidad elegida. */
    publicar(d: { visibilidad: "yo" | "grupo" | "publica"; grupoId: string | null }): Promise<{ ok: boolean; error?: string }>;
}

export interface ContextoCompartir {
    refId: string;
    usuario: string;
    ahora: number;
    consentimientos: Consentimiento[];
    /** La tarjeta de confirmación ya se mostró y se aceptó (saleDeLaCuenta lo exige). */
    confirmado?: boolean;
    /** La frase pidió invitados de lectura (permiso «ver» en vez de «editar»). */
    soloLectura?: boolean;
    deps: DepsCompartir;
}

export type ResultadoCompartir =
    | { ok: true; resumen: string; logradas?: number; total?: number }
    | { ok: false; motivo: string; requiere?: "consentimiento" };

export async function ejecutarCompartir(paso: PasoVoz, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
    const i: Intencion = paso.intencion;
    if (saleDeLaCuenta(i) && !ctx.confirmado) return { ok: false, motivo: "Falta tu confirmación" };
    if (i.tipo === "invitar") return invitar(i, ctx);
    if (i.tipo === "subir") return subir(i, ctx);
    return { ok: false, motivo: "Esa orden no es de compartir: solo invito o subo." };
}

/** Personas REALES detrás de las referencias: grupos → sus miembros; `[]` o fallo → motivo honesto (nunca inventa gente). */
async function personasDe(refs: RefResuelta[], ctx: ContextoCompartir): Promise<MiembroGrupo[] | FalloCompartir> {
    const personas: MiembroGrupo[] = [];
    for (const ref of refs) {
        if (ref.tipo !== "grupo") { personas.push({ id: ref.id, nombre: ref.nombre }); continue; }
        const ms = (await ctx.deps.miembrosDeGrupo(ref.id)) ?? [];
        if (!ms.length) return { ok: false, motivo: `No puedo leer los miembros de «${ref.nombre}» desde aquí todavía` };
        personas.push(...ms);
    }
    return personas.filter((p) => p.id && p.id !== ctx.usuario);
}

async function invitar(i: IInvitar, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
    const deps = ctx.deps;
    if (!deps.sala) return { ok: false, motivo: "No sé qué rol tienes en esta escena; no voy a invitar sin comprobarlo." };
    if (!puedeInvitar(deps.sala, ctx.usuario)) return { ok: false, motivo: "Solo el dueño o un editor pueden invitar en esta escena." };
    const ps = await personasDe(i.a, ctx);
    if ("ok" in ps) return ps;
    const ids = [...new Set(ps.map((p) => p.id))];
    if (!ids.length) return { ok: false, motivo: "No hay nadie real a quien invitar." };
    const logradas = await deps.concederAcceso(ctx.refId, ids, ctx.soloLectura ? "ver" : "editar");
    const grupo = i.a.find((r) => r.tipo === "grupo");
    const adjunto = grupo ? buildInviteAttachment({ targetKind: "group", refId: grupo.id, name: grupo.nombre }) : undefined;
    await deps.enviarMensaje(ids, `«${ctx.usuario}» te invitó a la escena «${deps.sala.titulo}»: /escena/${ctx.refId}`, adjunto);
    return { ok: true, resumen: `Invité a ${logradas} de ${ids.length} personas a «${deps.sala.titulo}».`, logradas, total: ids.length };
}

async function subir(i: ISubir, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
    const deps = ctx.deps;
    const titulo = deps.sala?.titulo ?? "tu mundo";
    const d = i.destino;
    if (d.donde === "biblioteca") {
        const r = await deps.guardarBiblioteca(titulo, ctx.refId);
        return r.ok ? { ok: true, resumen: `«${titulo}» quedó guardado en tu biblioteca.` } : { ok: false, motivo: r.error ?? "No pude guardar en la biblioteca." };
    }
    if (d.donde === "estacion") {
        const r = await deps.subirEstacion({ nueva: d.nueva, estacionId: d.ref?.id ?? null, titulo: deps.sala?.titulo ?? null });
        return r.ok ? { ok: true, resumen: d.nueva ? "Tu mundo ya está vivo en una estación nueva." : `Tu mundo ya está en la estación «${d.ref?.nombre}».` } : { ok: false, motivo: r.error ?? "No pude subirlo a la estación." };
    }
    if (d.donde === "publicacion") {
        if (!d.visibilidad) return { ok: false, motivo: "No sé para quién es la publicación: solo para ti, para un grupo o para todo el mundo." };
        if (d.visibilidad === "publica") {
            const v = evaluarSalida("mundo-spec", "sala-publica", ctx.ahora, ctx.consentimientos);
            if (!v.permitido) return v.requiere === "consentimiento" ? { ok: false, requiere: "consentimiento", motivo: "Publicar para todo el mundo necesita tu permiso: da el consentimiento y repite." } : { ok: false, motivo: "Esto no puede llegar a una sala pública sin tu permiso explícito." };
        }
        const grupoId = d.visibilidad === "grupo" ? d.ref?.id ?? null : null;
        if (d.visibilidad === "grupo" && !grupoId) return { ok: false, motivo: "No sé a qué grupo publicar: señálalo o repite con su nombre." };
        const r = await deps.publicar({ visibilidad: d.visibilidad, grupoId });
        const hecho: Record<"yo" | "grupo" | "publica", string> = { yo: "Publicado solo para ti.", grupo: `Publicado para tu grupo${d.ref ? ` «${d.ref.nombre}»` : ""}.`, publica: "Publicado para todo el mundo." };
        return r.ok ? { ok: true, resumen: hecho[d.visibilidad] } : { ok: false, motivo: r.error ?? "No pude crear la publicación." };
    }
    const ps = await personasDe(d.para, ctx);
    if ("ok" in ps) return ps;
    const ids = [...new Set(ps.map((p) => p.id))];
    if (!ids.length) return { ok: false, motivo: "No hay destinatarios reales para ese mensaje." };
    const n = await deps.enviarMensaje(ids, `«${ctx.usuario}» te mandó su mundo «${titulo}»: /escena/${ctx.refId}`);
    return n > 0 ? { ok: true, resumen: `Mandé el mensaje a ${n} de ${ids.length} personas.`, logradas: n, total: ids.length } : { ok: false, motivo: "No pude mandar el mensaje a nadie." };
}
