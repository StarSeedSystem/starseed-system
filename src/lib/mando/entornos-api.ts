// src/lib/mando/entornos-api.ts
// -----------------------------------------------------------------------------
// Entornos completos de perfil (Ola 1020 · ENT1020A) — SOLO servidor.
//
// El módulo puro del núcleo (`src/lib/nucleo/entorno-completo.ts`) captura,
// revisa, duplica, compara y aplica el entorno de un perfil. Ese módulo lo
// importa el CLIENTE, que es donde vive el medio (su almacenamiento); aquí se
// le da su sitio público: el mando puede CAPTURAR (el servidor ejecuta la
// función pura sobre la instantánea cruda que manda el cliente), REVISAR,
// DUPLICAR y COMPARAR entornos guardados en `starseed_memory_root/mando/entornos/`.
//
// ⚠️ Seguridad (innegociable, regla de Alex):
//  • NADA se guarda sin pasar antes por `revisarEntorno`: una revisión no
//    instalable no deja archivo ni a medias.
//  • Los volúmenes van por REFERENCIA ({id, raiz}, manifiesto por bandas) —
//    ni el contenido, ni la ruta absoluta de disco de nadie.
//  • Los motivos de revisión ya vienen enmascarados desde el núcleo: jamás
//    un secreto tal cual, ni en un error.
// -----------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";
import { validarUiSpec } from "@/lib/nucleo/ui-spec";
import { validarContraInvariantes } from "@/lib/nucleo/invariantes";
import type { DependenciasNucleo, PaqueteSistema } from "@/lib/nucleo/paquete-sistema";
import {
    VERSION_ENTORNO,
    capturarEntorno,
    revisarEntorno,
    duplicarEntorno,
    diferencia,
    type EntornoCompleto,
    type LectorAjustes,
    type RevisionEntorno,
    type VolumenEntorno,
} from "@/lib/nucleo/entorno-completo";

/** Guardianes del núcleo de VERDAD (los mismos que registra el arranque). */
const GUARDIANES: DependenciasNucleo = { validarUiSpec, validarContraInvariantes };

const MAXIMO_VOLUMENES = 512;
const MAXIMO_VALORES_CRUDOS = 4096;
const MAXIMO_LISTA = 200;

interface CapturaResultado {
    guardado: boolean;
    id: string | null;
    motivos: string[];
}

export interface EntornoGuardado {
    id: string;
    entorno: EntornoCompleto;
}

function objeto(v: unknown): Record<string, unknown> | null {
    return v !== null && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
}

/** Texto útil: cadena no vacía tras recortar; lo demás, `null`. */
export function textoDe(v: unknown): string | null {
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** El paquete minimo que la revisión puede mirar; lo demás lo dicta el núcleo. */
export function paqueteDe(v: unknown): PaqueteSistema | null {
    const o = objeto(v);
    if (!o || typeof o.id !== "string" || !o.id || typeof o.nombre !== "string" || !o.nombre) {
        return null;
    }
    return o as unknown as PaqueteSistema;
}

/** Volúmenes por REFERENCIA: solo {id, raiz}; cualquier campo de más → rechazo. */
export function volumenesDe(v: unknown): VolumenEntorno[] | null {
    if (!Array.isArray(v) || v.length > MAXIMO_VOLUMENES) return null;
    const lista: VolumenEntorno[] = [];
    for (const item of v) {
        const o = objeto(item);
        if (!o) return null;
        const claves = Object.keys(o).sort();
        if (claves.length !== 2 || claves[0] !== "id" || claves[1] !== "raiz") return null;
        if (typeof o.id !== "string" || !o.id || typeof o.raiz !== "string" || !o.raiz) return null;
        lista.push({ id: o.id, raiz: o.raiz });
    }
    return lista;
}

/** Instantánea cruda del medio del cliente: solo cadenas o null, acotada. */
export function valoresCrudosDe(v: unknown): Record<string, string | null> {
    const o = objeto(v);
    if (!o) return {};
    const valores: Record<string, string | null> = {};
    for (const [clave, valor] of Object.entries(o)) {
        if (Object.keys(valores).length >= MAXIMO_VALORES_CRUDOS) break;
        if (typeof valor === "string" || valor === null) valores[clave] = valor;
    }
    return valores;
}

/** Entorno completo llegado de cualquier sitio, en forma mínima revisable. */
export function entornoDe(v: unknown): EntornoCompleto | null {
    const o = objeto(v);
    if (!o) return null;
    const paquete = paqueteDe(o.paquete);
    const nombre = textoDe(o.nombre);
    const ajustes = objeto(o.ajustes);
    const volumenes = volumenesDe(o.volumenes ?? []);
    if (!paquete || !nombre || !ajustes || !volumenes) return null;
    return {
        version: typeof o.version === "number" ? o.version : VERSION_ENTORNO,
        nombre,
        paquete,
        ajustes,
        volumenes,
    };
}

// ---------------------------------------------------------------------------
// Captura y revisión (ejecutan el módulo puro, nada duplicado aquí)
// ---------------------------------------------------------------------------

export function capturarEntornoEntrante(
    paquete: PaqueteSistema,
    valoresCrudos: Record<string, string | null>,
    volumenes: VolumenEntorno[],
): { entorno: EntornoCompleto; revision: RevisionEntorno } {
    const lector: LectorAjustes = { leer: (clave: string) => valoresCrudos[clave] ?? null };
    const entorno = capturarEntorno(lector, paquete, volumenes);
    return { entorno, revision: revisarEntorno(entorno, GUARDIANES) };
}

export function revisarEntornoDeCrudo(v: unknown): RevisionEntorno | null {
    const entorno = entornoDe(v);
    return entorno ? revisarEntorno(entorno, GUARDIANES) : null;
}

// ---------------------------------------------------------------------------
// Almacén: `starseed_memory_root/mando/entornos/<id>.json`
// ---------------------------------------------------------------------------

function carpeta(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "entornos");
}

/** id estable: 12 hex de huella del JSON completo (duplicar → id nuevo). */
export function idDeEntorno(entorno: EntornoCompleto): string {
    return createHash("sha256").update(JSON.stringify(entorno) ?? "").digest("hex").slice(0, 12);
}

function esIdSeguro(id: string): boolean {
    return /^[a-f0-9]{12}$/.test(id);
}

async function guardar(entorno: EntornoCompleto): Promise<string> {
    const carpetaAbs = carpeta();
    const destino = path.join(carpetaAbs, `${idDeEntorno(entorno)}.json`);
    await mkdir(carpetaAbs, { recursive: true });
    const temporal = `${destino}.tmp`;
    await writeFile(temporal, JSON.stringify(entorno, null, 2), "utf-8");
    await rename(temporal, destino);
    return idDeEntorno(entorno);
}

/** Captura, revisa y, SOLO si es instalable, guarda. Nada a medias. */
export async function capturarYGuardar(paquete: PaqueteSistema, valoresCrudos: Record<string, string | null>, volumenes: VolumenEntorno[]): Promise<CapturaResultado> {
    const { entorno, revision } = capturarEntornoEntrante(paquete, valoresCrudos, volumenes);
    if (!revision.seguro) return { guardado: false, id: null, motivos: revision.motivos };
    return { guardado: true, id: await guardar(entorno), motivos: [] };
}

export async function listarEntornos(): Promise<EntornoGuardado[]> {
    let ficheros: string[] = [];
    try {
        ficheros = await readdir(carpeta());
    } catch {
        return [];
    }
    const lista: EntornoGuardado[] = [];
    for (const fichero of ficheros.filter((n) => n.endsWith(".json")).sort()) {
        if (lista.length >= MAXIMO_LISTA) break;
        try {
            const crudo = await readFile(path.join(carpeta(), fichero), "utf-8");
            lista.push({ id: fichero.replace(/\.json$/, ""), entorno: JSON.parse(crudo) as EntornoCompleto });
        } catch {
            continue;
        }
    }
    return lista;
}

export async function leerEntorno(id: string): Promise<EntornoCompleto | null> {
    if (!esIdSeguro(id)) return null;
    try {
        return JSON.parse(await readFile(path.join(carpeta(), `${id}.json`), "utf-8")) as EntornoCompleto;
    } catch {
        return null;
    }
}

/** Duplica un entorno guardado con nombre nuevo y lo guarda si sigue sano. */
export async function duplicarGuardado(id: string, nombre: string): Promise<CapturaResultado> {
    if (!esIdSeguro(id)) return { guardado: false, id: null, motivos: ["id de entorno inválido"] };
    if (!nombre) return { guardado: false, id: null, motivos: ["falta el nombre nuevo"] };
    const original = await leerEntorno(id);
    if (!original) return { guardado: false, id: null, motivos: [`no hay entorno guardado con el id «${id}»`] };
    const copia = duplicarEntorno(original, nombre);
    const revision = revisarEntorno(copia, GUARDIANES);
    if (!revision.seguro) return { guardado: false, id: null, motivos: revision.motivos };
    return { guardado: true, id: await guardar(copia), motivos: [] };
}

/** Qué ajustes cambian de un entorno guardado a otro (para replicar). */
export async function diferenciaGuardados(
    idA: string,
    idB: string,
): Promise<ReturnType<typeof diferencia> | null> {
    const a = await leerEntorno(idA);
    const b = await leerEntorno(idB);
    return a && b ? diferencia(a, b) : null;
}
