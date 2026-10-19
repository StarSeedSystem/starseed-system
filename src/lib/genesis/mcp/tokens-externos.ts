/**
 * Tokens externos por ámbito (Genesis conectores abiertos · Ola 1019G).
 * PURO salvo el almacén inyectado: `crearToken` devuelve el valor UNA vez,
 * guarda solo la huella (SHA-256); `verificarToken` comprueba sin revelar.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */

export interface EntradaToken {
    huella: string;
    ambito: string;
    alcance: string[];
    caduca?: number; // ms desde época; undefined = sin caducidad
    usos: number;
    revocadoEn?: number; // ms desde época
}

export interface AlmacenTokens {
    guardar(entrada: EntradaToken): void;
    leerPorHuella(huella: string): EntradaToken | null;
    listarPorAmbito(ambito: string): EntradaToken[];
}

export function crearAlmacenMemoria(): AlmacenTokens {
    const mapa = new Map<string, EntradaToken>();
    const porAmbito = new Map<string, Set<string>>();
    return {
        guardar(e) {
            mapa.set(e.huella, e);
            if (!porAmbito.has(e.ambito)) porAmbito.set(e.ambito, new Set());
            porAmbito.get(e.ambito)!.add(e.huella);
        },
        leerPorHuella(h) { return mapa.get(h) ?? null; },
        listarPorAmbito(a) {
            const s = porAmbito.get(a);
            if (!s) return [];
            return Array.from(s).map((h) => mapa.get(h)!).filter((e) => e !== undefined);
        },
    };
}

export interface ResultadoCrear {
    valor: string;
    huella: string;
}

export interface ResultadoVerificar {
    ambito: string;
    alcance: string[];
}

export async function crearToken(
    ambito: string,
    alcance: string[],
    caduca?: number,
    almacen?: AlmacenTokens,
): Promise<ResultadoCrear> {
    const valor = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    const huella = await huellaSha256(valor);
    if (almacen) {
        almacen.guardar({ huella, ambito, alcance: [...alcance], caduca, usos: 0 });
    }
    return { valor, huella };
}

export async function verificarToken(
    valor: string,
    almacen: AlmacenTokens,
    ahoraMs?: number,
): Promise<ResultadoVerificar | null> {
    const huella = await huellaSha256(valor);
    const entrada = almacen.leerPorHuella(huella);
    if (!entrada) return null;
    const ahora = ahoraMs ?? Date.now();
    if (entrada.revocadoEn !== undefined && entrada.revocadoEn <= ahora) return null;
    if (entrada.caduca !== undefined && entrada.caduca <= ahora) return null;
    if (entrada.usos < 0) return null;
    return { ambito: entrada.ambito, alcance: [...entrada.alcance] };
}

export function revocarToken(huella: string, almacen: AlmacenTokens, ahoraMs?: number): boolean {
    const entrada = almacen.leerPorHuella(huella);
    if (!entrada) return false;
    entrada.revocadoEn = ahoraMs ?? Date.now();
    almacen.guardar({ ...entrada });
    return true;
}

export function incrementarUso(huella: string, almacen: AlmacenTokens): number {
    const entrada = almacen.leerPorHuella(huella);
    if (!entrada) return -1;
    entrada.usos += 1;
    almacen.guardar({ ...entrada });
    return entrada.usos;
}

export async function huellaSha256(valor: string): Promise<string> {
    const datos = new TextEncoder().encode(valor);
    const resumen = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}
