/**
 * Índice local de paquetes descargados del traductor (localStorage inyectable, try/catch, no sincroniza).
 * Lista de {id, par, bytes, hash, version, instaladoEn}.
 * Evento: starseed:traductor-paquetes.
 * Un valor corrupto se ignora.
 */

export interface EntradaPaquete {
    id: string;
    par: string;
    bytes: number;
    hash: string;
    version: string;
    instaladoEn: number;
}

export interface AlmacenIndice {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
    datos?: Map<string, string>;
    romper?: boolean;
}

const CLAVE_INDICE = "starseed:traductor-paquetes";
const EVENTO_CAMBIO = "starseed:traductor-paquetes";

function esEntradaValida(entrada: unknown): entrada is EntradaPaquete {
    if (!entrada || typeof entrada !== "object") return false;
    const e = entrada as Record<string, unknown>;
    return (
        typeof e.id === "string" &&
        typeof e.par === "string" &&
        typeof e.bytes === "number" &&
        typeof e.hash === "string" &&
        typeof e.version === "string" &&
        typeof e.instaladoEn === "number"
    );
}

function leerIndice(almacen: AlmacenIndice): EntradaPaquete[] {
    try {
        if (almacen.romper) throw new Error("Almacen roto");
        const raw = almacen.getItem(CLAVE_INDICE);
        if (!raw) return [];
        const parseado = JSON.parse(raw);
        if (!Array.isArray(parseado)) return [];
        return parseado.filter(esEntradaValida);
    } catch {
        return [];
    }
}

function escribirIndice(almacen: AlmacenIndice, entradas: EntradaPaquete[]): void {
    try {
        if (almacen.romper) throw new Error("Almacen roto");
        almacen.setItem(CLAVE_INDICE, JSON.stringify(entradas));
    } catch {
        // Silencioso: no sincroniza, no lanza
    }
}

type Oyente = (evento: string) => void;

export class IndicePaquetes {
    private almacen: AlmacenIndice;
    private oyentes: Set<Oyente> = new Set();

    constructor(almacen: AlmacenIndice) {
        this.almacen = almacen;
    }

    listar(): EntradaPaquete[] {
        return leerIndice(this.almacen);
    }

    registrar(entrada: EntradaPaquete): void {
        if (!esEntradaValida(entrada)) return;
        const actuales = leerIndice(this.almacen);
        const sinDuplicados = actuales.filter((e) => e.id !== entrada.id);
        const actualizadas = [...sinDuplicados, entrada];
        escribirIndice(this.almacen, actualizadas);
        this.notificar();
    }

    quitar(id: string): void {
        const actuales = leerIndice(this.almacen);
        const actualizadas = actuales.filter((e) => e.id !== id);
        if (actualizadas.length !== actuales.length) {
            escribirIndice(this.almacen, actualizadas);
            this.notificar();
        }
    }

    estaInstalado(origen: string, destino: string): boolean {
        const par = `${origen}-${destino}`;
        return leerIndice(this.almacen).some((e) => e.par === par);
    }

    espacioUsado(): number {
        return leerIndice(this.almacen).reduce((acc, e) => acc + e.bytes, 0);
    }

    suscribir(oyente: Oyente): () => void {
        this.oyentes.add(oyente);
        return () => void this.oyentes.delete(oyente);
    }

    private notificar(): void {
        for (const oyente of this.oyentes) {
            try {
                oyente(EVENTO_CAMBIO);
            } catch {
                // Silencioso
            }
        }
    }
}

export function crearAlmacenFalso(): AlmacenIndice {
    const datos = new Map<string, string>();
    return {
        datos,
        getItem: (k) => datos.get(k) ?? null,
        setItem: (k, v) => void datos.set(k, v),
        removeItem: (k) => void datos.delete(k),
    };
}