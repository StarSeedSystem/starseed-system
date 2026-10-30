/**
 * recursos-red.ts — «Recursos de la red» de Genesis (apps-en-la-malla §12), PURA:
 * normaliza lo que anuncia la red y resume ofertas por medio, préstamos vivos y
 * volúmenes bajo las réplicas deseadas. Sin disco, red ni `node:*`: el reloj y
 * los datos crudos los inyecta la ruta. Lo no medido sale `null` («sin medir»).
 */
import { replicasDeseadas, type Manifiesto } from "@/lib/recursos/volumen";

export interface OfertaRed { nodoId: string; medio: string; medido: boolean; publica: boolean; apps: number | null; capas: number | null }
export interface PrestamoRed {
    id: string; recurso: string; tipo: string; medio: string; anfitrion: string | null; invitado: string | null;
    inicio: number | null; vence: number | null; revocada: boolean; activo: boolean; consumoBytes: number | null;
}
export interface PrestamoVivo extends PrestamoRed { desdeHaceMs: number | null; restanteMs: number | null }
export interface VolumenRed { id: string; privado: boolean; bandas: number | null; replicasActuales: number; replicasDeseadas: number; faltan: number }
export interface OfertasPorMedio { medio: string; total: number; medidos: number; sinMedir: number }
export interface ResumenRecursosRed { ofertas: OfertaRed[]; ofertasPorMedio: OfertasPorMedio[]; prestamosVivos: PrestamoVivo[]; volumenesBajos: VolumenRed[] }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const CIFRAS = ["ramLibreMb", "cpu", "nucleos", "prestaMb", "subidaKbps", "bajadaKbps", "bateriaPct"];

/** Array directo o la primera de varias claves (`{ ofertas }`, `{ nodos }`…). */
function listaDe(crudo: unknown, claves: string[]): unknown[] {
    if (Array.isArray(crudo)) return crudo;
    if (!esObjeto(crudo)) return [];
    for (const clave of claves) if (Array.isArray(crudo[clave])) return crudo[clave];
    return [];
}

export function leerOfertas(crudo: unknown): OfertaRed[] {
    const salida: OfertaRed[] = [];
    for (const e of listaDe(crudo, ["ofertas", "nodos"])) {
        if (!esObjeto(e)) continue;
        const nodoId = texto(e.nodoId) ?? texto(e.id);
        if (!nodoId) continue;
        const ambitos = Array.isArray(e.ambitos) ? e.ambitos : [];
        const medido = e.medido === true || CIFRAS.some((clave) => numero(e[clave]) !== null);
        salida.push({ nodoId, medio: texto(e.medio) ?? "desconocido", medido,
            publica: e.publico === true || ambitos.includes("publico"),
            apps: Array.isArray(e.apps) ? e.apps.length : null, capas: Array.isArray(e.capas) ? e.capas.length : null });
    }
    return salida.sort((a, b) => a.medio.localeCompare(b.medio) || a.nodoId.localeCompare(b.nodoId));
}

export function leerPrestamos(crudo: unknown): PrestamoRed[] {
    const salida: PrestamoRed[] = [];
    for (const e of listaDe(crudo, ["prestamos", "sesiones"])) {
        if (!esObjeto(e)) continue;
        const id = texto(e.id) ?? texto(e.sesionId);
        if (!id) continue;
        const alcance = esObjeto(e.alcance) ? e.alcance : {};
        const estado = texto(e.estado);
        const vence = numero(e.vence) ?? numero(e.finMs);
        salida.push({ id, recurso: texto(e.recurso) ?? texto(alcance.id) ?? texto(e.tipo) ?? "recurso",
            tipo: texto(e.tipo) ?? texto(alcance.tipo) ?? "capacidad", medio: texto(e.medio) ?? "desconocido",
            anfitrion: texto(e.anfitrion), invitado: texto(e.invitado),
            inicio: numero(e.inicio) ?? numero(e.inicioMs), vence: vence !== null && vence > 0 ? vence : null,
            revocada: e.revocada === true, activo: e.activo === true || estado === "activo" || estado === "encolado",
            consumoBytes: numero(e.bytes) ?? numero(e.consumo) });
    }
    return salida;
}

export function prestamosVivos(prestamos: PrestamoRed[], ahora: number): PrestamoVivo[] {
    return prestamos
        .filter((p) => !p.revocada && (p.vence !== null ? p.vence > ahora : p.activo))
        .map((p) => ({ ...p, desdeHaceMs: p.inicio === null ? null : Math.max(0, ahora - p.inicio),
            restanteMs: p.vence === null ? null : Math.max(0, p.vence - ahora) }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** Réplicas contables: cifra anunciada o nodos únicos que tienen el volumen. */
function contarReplicas(e: Record<string, unknown>): number {
    const cifra = numero(e.replicasActuales) ?? numero(e.replicas);
    if (cifra !== null) return Math.max(0, Math.floor(cifra));
    for (const clave of ["tenedores", "fuentes", "nodos"]) {
        const lista = e[clave];
        if (!Array.isArray(lista)) continue;
        const ids = new Set<string>();
        for (const x of lista) { const id = esObjeto(x) ? texto(x.nodo) ?? texto(x.id) : texto(x); if (id) ids.add(id); }
        return ids.size;
    }
    return 0;
}

export function leerVolumenes(crudo: unknown): VolumenRed[] {
    const salida: VolumenRed[] = [];
    for (const e of listaDe(crudo, ["volumenes"])) {
        if (!esObjeto(e)) continue;
        const id = texto(e.id);
        if (!id) continue;
        const privado = e.privado === true;
        const manifiesto: Manifiesto = { id, version: "", tamano: 0, banda: 0, bandas: [], privado, importancia: numero(e.importancia) ?? 0 };
        const deseadas = numero(e.replicasDeseadas) ?? replicasDeseadas(manifiesto);
        const actuales = contarReplicas(e);
        salida.push({ id, privado, bandas: Array.isArray(e.bandas) ? e.bandas.length : numero(e.bandas),
            replicasActuales: actuales, replicasDeseadas: deseadas, faltan: Math.max(0, deseadas - actuales) });
    }
    return salida.sort((a, b) => a.id.localeCompare(b.id));
}

export function volumenesBajos(volumenes: VolumenRed[]): VolumenRed[] {
    return volumenes.filter((v) => v.replicasActuales < v.replicasDeseadas);
}

export function resumirRecursosRed(entrada: { ofertas?: unknown; prestamos?: unknown; volumenes?: unknown; ahora: number }): ResumenRecursosRed {
    const ofertas = leerOfertas(entrada.ofertas);
    const porMedio = new Map<string, OfertasPorMedio>();
    for (const oferta of ofertas) {
        const fila = porMedio.get(oferta.medio) ?? { medio: oferta.medio, total: 0, medidos: 0, sinMedir: 0 };
        fila.total += 1; fila.medidos += oferta.medido ? 1 : 0; fila.sinMedir += oferta.medido ? 0 : 1;
        porMedio.set(oferta.medio, fila);
    }
    return { ofertas, ofertasPorMedio: [...porMedio.values()].sort((a, b) => a.medio.localeCompare(b.medio)),
        prestamosVivos: prestamosVivos(leerPrestamos(entrada.prestamos), entrada.ahora),
        volumenesBajos: volumenesBajos(leerVolumenes(entrada.volumenes)) };
}
