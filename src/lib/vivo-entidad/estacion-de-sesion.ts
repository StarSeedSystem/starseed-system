/**
 * Estación de espectadores de una sesión en vivo (SES1115Q · P1-C).
 * «Compartir en vivo» crea el pase (`os_sesiones_vivas`) y, cuando alguien va a MIRAR o se
 * comparte por enlace, además la ESTACIÓN de espectadores en `os_estaciones` (tipo
 * pizarra|dashboard, fuente «starseed», enlace `/vivo/<id>?t=<token>`). Puro o con
 * dependencias INYECTADAS: sin red; quien llama pasa `crearPase` (en el OS, `crearSesion`)
 * y `crearEstacion` (`publicarEstacion`); si falta la migración, `MENSAJE_SIN_DESPLEGAR`.
 */
import { MENSAJE_SIN_DESPLEGAR, esUuid } from "@/lib/mensajeria/sesiones-vivas";
import type { ModoAcceso, PermisoVivo, SesionViva } from "@/lib/mensajeria/formato-tipos";
import { esTokenPublico } from "@/lib/llamadas/temas";
import type { BorradorEstacion } from "@/lib/estaciones/tipos";
import type { ResultadoEstacion } from "@/lib/estaciones/datos";
import type { RangoSesion } from "@/lib/vivo-entidad/traduccion-roles";

export type TipoSesionVivo = "pizarra" | "dashboard";

/** Fila de estación para ESPECTADORES de una sesión: valida id y token. */
export interface EntradaFilaEstacion {
    sesionId: string; tipo: TipoSesionVivo; titulo: string;
    token: string; propietario: string; entidadRef?: string;
}

export function filaEstacionDeSesion(entrada: EntradaFilaEstacion):
    { ok: true; fila: BorradorEstacion } | { ok: false; motivo: string } {
    if (!esUuid(entrada.sesionId)) return { ok: false, motivo: "El id de la sesión no es válido." };
    if (!esTokenPublico(entrada.token)) return { ok: false, motivo: "El token del enlace no es válido." };
    if (typeof entrada.propietario !== "string" || !entrada.propietario.trim()) {
        return { ok: false, motivo: "Falta quién comparte la sesión." };
    }
    const titulo = entrada.titulo.trim().slice(0, 100) || "Sesión en vivo";
    return {
        ok: true,
        fila: {
            titulo,
            descripcion: `Espectadores de la sesión en vivo de ${entrada.propietario.trim().slice(0, 80)}`,
            tipo: entrada.tipo, fuente: "starseed",
            enlace: `/vivo/${entrada.sesionId}?t=${encodeURIComponent(entrada.token)}`,
            licencia: "cc0", visibilidad: "publica",
            ambito_tipo: entrada.entidadRef ? "entidad" : "persona",
            entidad_ref: entrada.entidadRef ?? null,
        },
    };
}

/** El pase lo crea quien llama (`crearSesion`); aquí solo se define el contrato. */
export interface DependenciasCompartir {
    crearPase(entrada: {
        tipo: string; titulo: string; modo: ModoAcceso; permiso: PermisoVivo;
        hiloId: string | null; invitados: string[];
    }): Promise<{ sesion: Pick<SesionViva, "id" | "tipo" | "tokenPublico" | "creador"> | null; error: string | null }>;
    crearEstacion(borrador: BorradorEstacion): Promise<ResultadoEstacion>;
}

export interface OpcionesCompartirEnVivo {
    con?: "mis-neuronas" | "entidad" | "enlace";
    acceso?: "editar" | "mirar";
    tipo: TipoSesionVivo; titulo: string;
    hiloId?: string | null; entidadRef?: string;
    /** Personas concretas que reciben el pase (uids). */
    invitados?: string[];
}

export async function compartirEnVivo(
    deps: DependenciasCompartir,
    opciones: OpcionesCompartirEnVivo,
): Promise<{ ok: true; enlace: string; personas: string[]; sesionId: string } | { ok: false; motivo: string }> {
    const con = opciones.con ?? "mis-neuronas";
    const acceso = opciones.acceso ?? "editar";
    const titulo = opciones.titulo.trim().slice(0, 200);
    if (!titulo) return { ok: false, motivo: "Ponle un nombre a lo que compartes." };

    // La estación de espectadores necesita un enlace público con token: si alguien va a mirar o se
    // comparte por enlace, el pase sale público (con el permiso elegido).
    const conEstacion = acceso === "mirar" || con === "enlace";
    const modo: ModoAcceso = conEstacion ? "publico" : con === "entidad" ? "invitados" : "chat";
    const permiso: PermisoVivo = acceso === "mirar" ? "ver" : "editar";
    const invitados = [...new Set((opciones.invitados ?? []).filter(esUuid))];

    const pase = await deps.crearPase({
        tipo: `vivo:${opciones.tipo}`, titulo, modo, permiso, hiloId: opciones.hiloId ?? null, invitados,
    });
    if (!pase.sesion) return {
        ok: false,
        motivo: pase.error === MENSAJE_SIN_DESPLEGAR ? MENSAJE_SIN_DESPLEGAR
            : pase.error ?? "No se pudo compartir en vivo.",
    };
    const sesion = pase.sesion;
    let enlace = `/vivo/${sesion.id}`;

    if (conEstacion) {
        if (!sesion.tokenPublico || !esTokenPublico(sesion.tokenPublico)) {
            return { ok: false, motivo: "La sesión se abrió, pero no se pudo crear el enlace para espectadores." };
        }
        const filaF = filaEstacionDeSesion({
            sesionId: sesion.id, tipo: opciones.tipo, titulo, token: sesion.tokenPublico,
            propietario: sesion.creador, entidadRef: opciones.entidadRef,
        });
        if (!filaF.ok) return { ok: false, motivo: filaF.motivo };
        const publicada = await deps.crearEstacion(filaF.fila);
        if (!publicada.ok) return { ok: false, motivo: publicada.error === MENSAJE_SIN_DESPLEGAR
            ? MENSAJE_SIN_DESPLEGAR : publicada.error ?? "No se pudo publicar la estación de espectadores." };
        enlace = filaF.fila.enlace;
    }
    return { ok: true, enlace, personas: invitados.filter((u) => u !== sesion.creador), sesionId: sesion.id };
}

/** Presencia de una persona en la sesión, con su rango traducido (`traduccion-roles`). */
export interface PresenciaEnSesion { uid: string; rango: RangoSesion | null; }

/** Personas únicas que SOLO miran (rango «ver»): la misma persona con dos pestañas cuenta una vez;
 * los que editan, comentan, moderan, gestionan o son dueños no cuentan. */
export function contarEspectadores(presencias: readonly PresenciaEnSesion[]): number {
    const unicos = new Set<string>();
    for (const p of presencias ?? []) {
        if (!p || p.rango !== "ver" || typeof p.uid !== "string" || !p.uid) continue;
        unicos.add(p.uid);
    }
    return unicos.size;
}
