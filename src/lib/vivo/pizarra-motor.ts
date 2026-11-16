/**
 * Pizarra viva (SVF1A4f): el motor de edición colaborativa de la pizarra compartida, sobre `MotorColab`.
 *
 * Mismo patrón que `depsDashboard`/`crearMotorDashboard`: guardado compare-and-swap por `rev` (si alguien
 * guardó antes, el motor recarga, FUSIONA con `fusionarPizarras` y reintenta), cambios ajenos por Realtime,
 * borrador local y solo lectura sin permiso. Acceso a `os_spaces` por `tabla/espacio.ts`, el mismo que
 * usan tabla y dashboard (es el que da el CAS: `updateSpaceDoc` de `spaces.ts` escribe sin comprobar `rev`).
 *
 * El doc guardado lleva los registros (`formato`, `bloques`, `aristas`) y, además, `blocks`/`edges` con la
 * vista plana: así una app aún sin actualizar ve la pizarra real en vez de una vacía. Se acepta el doc
 * viejo `{blocks, edges}` y se guarda ya migrado.
 */
import { autorCorto } from "./tabla/modelo";
import { MotorColab, type DepsMotor } from "./tabla/motor-colab";
import { guardarEspacioCAS, leerEspacio, puedoEditarEspacio, suscribirEspacio } from "./tabla/espacio";
import { docPizarra, esDocPizarra, maxTiempoPizarra, normalizarPizarra, podarPizarra, type DocPizarra } from "./pizarra";
import { fusionarPizarras } from "./pizarra-fusion";
import { haciaLienzo } from "./pizarra-lienzo";

const PREFIJO_BORRADOR = "starseed.pizarra.borrador.";

function borradorLocal(id: string): NonNullable<DepsMotor<DocPizarra>["borrador"]> {
    return {
        leer: () => {
            try {
                const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIJO_BORRADOR + id);
                return raw ? normalizarPizarra(JSON.parse(raw)) : null;
            } catch {
                return null;
            }
        },
        escribir: (d) => {
            try {
                if (typeof localStorage === "undefined") return;
                if (d) localStorage.setItem(PREFIJO_BORRADOR + id, JSON.stringify(d));
                else localStorage.removeItem(PREFIJO_BORRADOR + id);
            } catch {
                /* sin almacenamiento o sin cuota: se sigue sin borrador */
            }
        },
    };
}

/** Acepta el doc nuevo, el viejo `{blocks, edges}` y el vacío; rechaza el de otra clase de espacio. */
function validar(doc: Record<string, unknown>): string | null {
    if (esDocPizarra(doc) || Array.isArray(doc.blocks) || Array.isArray(doc.edges)) return null;
    return doc.vivo === undefined && Object.keys(doc).length === 0 ? null : "Este espacio no es una pizarra compartida.";
}

export function depsPizarra(espacioId: string, uid: string | null): DepsMotor<DocPizarra> {
    return {
        cargar: () => leerEspacio(espacioId),
        guardar: (doc, rev) => guardarEspacioCAS(espacioId, doc, rev),
        suscribir: (cb) => suscribirEspacio(espacioId, cb),
        puedeEditar: puedoEditarEspacio,
        autor: autorCorto(uid),
        validar,
        extraer: (doc) => podarPizarra(normalizarPizarra(doc), Date.now()),
        fusionar: (a, b) => podarPizarra(fusionarPizarras(a, b), Date.now()),
        incrustar: (base, d) => ({ ...base, ...docPizarra(d), ...(({ blocks, edges }) => ({ blocks, edges }))(haciaLienzo(d)) }),
        maxTiempo: maxTiempoPizarra,
        borrador: borradorLocal(espacioId),
    };
}

export function crearMotorPizarra(espacioId: string, uid: string | null): MotorColab<DocPizarra> {
    return new MotorColab<DocPizarra>(depsPizarra(espacioId, uid));
}
