import type { IdMotor } from "./tipos";
export type { IdMotor } from "./tipos";

export interface AlmacenAvisos {
    obtener(clave: string): string | null;
    guardar(clave: string, valor: string): void;
}

export interface AvisoMotor {
    titulo: string;
    sale: string;
    sale_del_aparato: boolean;
}

export const AVISOS: Record<IdMotor, AvisoMotor> = {
    "paquete-local": {
        titulo: "Traducción local",
        sale: "No sale nada",
        sale_del_aparato: false,
    },
    navegador: {
        titulo: "Traducción del navegador",
        sale: "No sale nada",
        sale_del_aparato: false,
    },
    libretranslate: {
        titulo: "LibreTranslate (neurona)",
        sale: "Va a tu propio equipo",
        sale_del_aparato: true,
    },
    malla: {
        titulo: "Malla P2P",
        sale: "Cifrado hacia tus aparatos o vínculos",
        sale_del_aparato: true,
    },
    astraura: {
        titulo: "Astraura",
        sale: "El texto lo ve el modelo que Astraura elija; no se usa con el modo privado",
        sale_del_aparato: true,
    },
};

const CLAVE_AVISOS = "starseed.traductor.avisos.v1";

function leerAceptados(almacen: AlmacenAvisos): Record<string, boolean> {
    try {
        const raw = almacen.obtener(CLAVE_AVISOS);
        if (!raw) return {};
        const parseado = JSON.parse(raw);
        if (typeof parseado !== "object" || parseado === null) return {};
        return parseado as Record<string, boolean>;
    } catch {
        return {};
    }
}

function escribirAceptados(aceptados: Record<string, boolean>, almacen: AlmacenAvisos): void {
    try {
        almacen.guardar(CLAVE_AVISOS, JSON.stringify(aceptados));
    } catch {
        // silencioso
    }
}

export function avisoPendiente(motor: IdMotor, almacen: AlmacenAvisos): boolean {
    const aviso = AVISOS[motor];
    if (!aviso.sale_del_aparato) return false;
    const aceptados = leerAceptados(almacen);
    return !aceptados[motor];
}

export function aceptarAviso(motor: IdMotor, almacen: AlmacenAvisos): void {
    const aviso = AVISOS[motor];
    if (!aviso.sale_del_aparato) return;
    const aceptados = leerAceptados(almacen);
    aceptados[motor] = true;
    escribirAceptados(aceptados, almacen);
}

export function crearAlmacenMemoria(): AlmacenAvisos {
    const mapa = new Map<string, string>();
    return {
        obtener: (clave: string) => mapa.get(clave) ?? null,
        guardar: (clave: string, valor: string) => { mapa.set(clave, valor); },
    };
}