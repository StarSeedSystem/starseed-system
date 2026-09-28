/**
 * App en vivo «Tabla de datos» (2026-09-28) — contrato para el catálogo de apps en vivo.
 *
 * Una tabla es un espacio `os_spaces` (mismas reglas de acceso que la pizarra y el escritorio
 * compartidos: dueño, invitados con rol, lectura pública) con la tabla dentro de `doc.tabla`.
 * La edición simultánea funciona por CELDA (ver `./tabla/modelo` y `./tabla/fusion`): dos
 * personas que editan celdas distintas conservan ambas; si editan la MISMA celda a la vez, gana
 * la última escritura.
 *
 * El integrador cablea el catálogo con esto:
 *   crear:      crearVivoTabla(titulo)  → { refId, ruta }
 *   listarMios: listarMiosTabla()
 *   entrada:    INFO_VIVO_TABLA
 * La ruta es `/tabla/<id>` y acepta `?sesion=<id>` sin efecto propio (la presencia de la sesión
 * la anuncia el montaje global).
 */
import { autorCorto, maxTiempo, normalizarTabla, type Tabla } from "./tabla/modelo";
import { fusionarTablas, podar } from "./tabla/fusion";
import { invertirPaso } from "./tabla/historial";
import { tablaInicial } from "./tabla/operaciones";
import { MotorColab, type DepsMotor } from "./tabla/motor-colab";
import {
    crearEspacioVivo,
    guardarEspacioCAS,
    leerEspacio,
    listarEspaciosVivos,
    miUid,
    puedoEditarEspacio,
    suscribirEspacio,
} from "./tabla/espacio";

export const INFO_VIVO_TABLA = {
    etiqueta: "Tabla de datos",
    descripcion: "Una hoja de datos que se rellena entre varias personas, celda a celda, en vivo.",
    icono: "Table2",
    color: "#10B981",
} as const;

export function rutaTabla(id: string): string {
    return `/tabla/${encodeURIComponent(id)}`;
}

/** ¿Este doc de `os_spaces` es una tabla? */
export function esDocTabla(doc: Record<string, unknown> | null | undefined): boolean {
    return !!doc && doc.vivo === "tabla";
}

/** El doc de un espacio nuevo con esta tabla dentro. */
export function docTabla(tabla: Tabla): Record<string, unknown> {
    return { vivo: "tabla", v: 1, tabla };
}

export async function crearVivoTabla(titulo: string): Promise<{ refId: string; ruta: string }> {
    const uid = await miUid();
    const inicial = tablaInicial({ t: Date.now(), a: autorCorto(uid) });
    const id = await crearEspacioVivo("tabla", titulo.trim() || "Tabla de datos", docTabla(inicial));
    return { refId: id, ruta: rutaTabla(id) };
}

export async function listarMiosTabla(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const lista = await listarEspaciosVivos("tabla");
    return lista.filter((e) => e.esMio).map((e) => ({ refId: e.refId, titulo: e.titulo, ruta: rutaTabla(e.refId) }));
}

// ───────────────────────────── motor ─────────────────────────────

const PREFIJO_BORRADOR = "starseed.vivo.borrador.tabla.";

function borradorLocal(id: string): NonNullable<DepsMotor<Tabla>["borrador"]> {
    return {
        leer: () => {
            try {
                const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIJO_BORRADOR + id);
                return raw ? normalizarTabla(JSON.parse(raw)) : null;
            } catch {
                return null;
            }
        },
        escribir: (t) => {
            try {
                if (typeof localStorage === "undefined") return;
                if (t) localStorage.setItem(PREFIJO_BORRADOR + id, JSON.stringify(t));
                else localStorage.removeItem(PREFIJO_BORRADOR + id);
            } catch {
                /* sin almacenamiento o sin cuota: se sigue sin borrador */
            }
        },
    };
}

/** Las dependencias reales del motor para una tabla (Supabase + memoria local). */
export function depsTabla(espacioId: string, uid: string | null): DepsMotor<Tabla> {
    return {
        cargar: () => leerEspacio(espacioId),
        guardar: (doc, rev) => guardarEspacioCAS(espacioId, doc, rev),
        suscribir: (cb) => suscribirEspacio(espacioId, cb),
        puedeEditar: puedoEditarEspacio,
        autor: autorCorto(uid),
        validar: (doc) => (esDocTabla(doc) ? null : "Este espacio no es una tabla de datos."),
        // La poda de celdas de filas/columnas borradas hace tiempo es determinista, así que se
        // aplica al leer y al fusionar: todas las copias convergen sin que nada resucite.
        extraer: (doc) => podar(normalizarTabla(doc.tabla), Date.now()),
        fusionar: (a, b) => podar(fusionarTablas(a, b), Date.now()),
        incrustar: (base, t) => ({ ...base, vivo: "tabla", v: 1, tabla: t }),
        maxTiempo,
        invertirPaso,
        borrador: borradorLocal(espacioId),
    };
}

export function crearMotorTabla(espacioId: string, uid: string | null): MotorColab<Tabla> {
    return new MotorColab<Tabla>(depsTabla(espacioId, uid));
}
