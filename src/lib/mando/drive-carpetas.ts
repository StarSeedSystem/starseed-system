import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { MOTIVO_CUOTA_DRIVE_LOCAL } from "@/lib/mando/almacenamiento";
import { raizDelProyecto } from "@/lib/mando/raiz";

export type ModoCarpeta = "solo-local" | "espejo" | "movida";

export interface CarpetaEspecial {
    id: string;
    ruta: string;
    etiqueta: string;
    descripcion: string;
    destinoDrive: string;
    modo: ModoCarpeta;
    mb: number;
    ultimaSync: string | null;
}

export interface CuotaDriveResumen {
    totalGb: number;
    usadoGb: number;
    libreGb: number;
    fuente: string;
    motivo?: string;
}

export interface AccionSincronizacion {
    id: string;
    accion: "mover" | "espejar" | "nada";
    motivo: string;
}

export interface ResumenDrive {
    titulo: string;
    valor: string;
    detalle: string;
    tono: "ok" | "aviso" | "peligro" | "normal";
}

export interface EstadoEspejoDriveInput {
    montado?: boolean;
    ruta?: string | null;
    espejo?: {
        ruta?: string;
        ultimoEspejo?: string | null;
        mb?: number | null;
        error?: string | null;
    } | null;
    ultimoEspejo?: string | null;
    mb?: number | null;
    error?: string | null;
}

export interface InterpretacionEspejo {
    tono: "ok" | "aviso" | "peligro";
    titulo: string;
    detalle: string;
    cuando: string;
}

type CarpetaBase = Omit<CarpetaEspecial, "mb" | "ultimaSync" | "modo">;

const carpetaBase = (
    id: string,
    ruta: string,
    etiqueta: string,
    descripcion: string,
    destino: string,
): CarpetaBase => ({
    id,
    ruta,
    etiqueta,
    descripcion,
    destinoDrive: `StarSeed_Memory_Root/${destino}`,
});

/**
 * 2026-09-08, Ola 291b · D1: lista blanca explícita. No incluye `.git`,
 * `node_modules`, `.next`, `venv` ni `.env*` porque son regenerables o pueden
 * contener historial, ejecutables y claves que jamás deben salir a Drive.
 */
export const CARPETAS_ESPECIALES_BASE: CarpetaBase[] = [
    carpetaBase("memoria", "starseed_memory_root/", "Memoria StarSeed", "Memoria viva y compartida del OS", "memoria"),
    carpetaBase("medios", "starseed_memory_root/media/", "Medios", "Medios grandes conservados por el OS", "medios"),
    carpetaBase("creaciones", "starseed_memory_root/creaciones/", "Creaciones", "Creaciones y exportaciones de gran tamaño", "creaciones"),
    carpetaBase("modelos", "starseed_memory_root/modelos/", "Modelos", "Modelos locales que conviene descargar del disco", "modelos"),
    carpetaBase("aprendizaje", "starseed_memory_root/aprendizaje/", "Aprendizaje", "Modelos y adaptadores del aprendizaje continuo", "aprendizaje"),
    carpetaBase("respaldos", "starseed_memory_root/respaldos/", "Respaldos", "Copias de seguridad verificadas", "respaldos"),
    carpetaBase("verificaciones", "starseed_memory_root/verificaciones/", "Verificaciones", "Informes y evidencias de verificación", "verificaciones"),
];

const SEGMENTOS_PROHIBIDOS = new Set([".git", "node_modules", ".next", "venv"]);

export function esRutaSegura(ruta: string): boolean {
    if (!ruta.trim() || path.isAbsolute(ruta)) return false;
    const normalizada = ruta.replaceAll("\\", "/");
    const segmentos = normalizada.split("/").filter(Boolean);
    if (segmentos.length === 0 || segmentos.some((parte) => parte === "..")) return false;
    return !segmentos.some((parte) => {
        const minuscula = parte.toLocaleLowerCase("es");
        return SEGMENTOS_PROHIBIDOS.has(minuscula) || minuscula.startsWith(".env");
    });
}
const entero = (valor: number): number => Math.max(0, Math.round(Number.isFinite(valor) ? valor : 0));

export function planDeSincronizacion(
    carpetas: CarpetaEspecial[],
    libreMb: number,
    umbralMb = 6144,
): AccionSincronizacion[] {
    const libre = entero(libreMb);
    const umbral = entero(umbralMb);
    if (libre >= umbral) {
        return carpetas.map((carpeta) => ({
            id: carpeta.id,
            accion: carpeta.modo === "espejo" ? "espejar" : "nada",
            motivo: carpeta.modo === "espejo"
                ? `${libre} MB libres superan el umbral de ${umbral} MB: se conserva el espejo.`
                : `${libre} MB libres superan el umbral de ${umbral} MB y el modo es ${carpeta.modo}.`,
        }));
    }

    const faltan = umbral - libre;
    let recuperables = 0;
    return [...carpetas]
        .sort((a, b) => b.mb - a.mb)
        .map((carpeta) => {
            const tamano = entero(carpeta.mb);
            if (carpeta.modo === "espejo" && recuperables < faltan) {
                recuperables += tamano;
                return {
                    id: carpeta.id,
                    accion: "mover" as const,
                    motivo: `Hay ${libre} MB libres: faltan ${faltan} MB para el umbral de ${umbral} MB. ${carpeta.etiqueta} ocupa ${tamano} MB; moverla recuperaría ese espacio.`,
                };
            }
            if (carpeta.modo === "espejo") {
                return {
                    id: carpeta.id,
                    accion: "espejar" as const,
                    motivo: `Las carpetas mayores ya recuperarían ${recuperables} MB de los ${faltan} MB necesarios; ${carpeta.etiqueta} puede seguir espejada.`,
                };
            }
            return {
                id: carpeta.id,
                accion: "nada" as const,
                motivo: `${carpeta.etiqueta} está en modo ${carpeta.modo}; no necesita otra acción aunque solo haya ${libre} MB libres.`,
            };
        });
}
const NUMERO_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function capacidad(gb: number): string {
    return gb >= 1024
        ? `${NUMERO_ES.format(gb / 1024)} TB`
        : `${NUMERO_ES.format(gb)} GB`;
}

function tiempoDesde(fecha: string | null): string {
    if (!fecha) return "sin sincronizar";
    const ms = Date.parse(fecha);
    if (!Number.isFinite(ms)) return "sin sincronizar";
    const minutos = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
    if (minutos < 1) return "ahora";
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 48) return `hace ${horas} h`;
    return `hace ${Math.floor(horas / 24)} días`;
}

export function resumenDrive(
    cuota: CuotaDriveResumen | null,
    carpetas: CarpetaEspecial[],
): ResumenDrive {
    if (!cuota) {
        return {
            titulo: "Google Drive",
            valor: "—",
            detalle: MOTIVO_CUOTA_DRIVE_LOCAL,
            tono: "normal",
        };
    }

    const espejadas = carpetas.filter((carpeta) => carpeta.modo === "espejo");
    const ultima = espejadas
        .map((carpeta) => carpeta.ultimaSync)
        .filter((fecha): fecha is string => fecha !== null)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    const proporcionLibre = cuota.totalGb > 0 ? cuota.libreGb / cuota.totalGb : 0;
    const tono: ResumenDrive["tono"] = proporcionLibre <= 0.1
        ? "peligro"
        : proporcionLibre <= 0.25 ? "aviso" : "ok";
    const cantidad = espejadas.length;
    return {
        titulo: "Google Drive",
        valor: `${capacidad(cuota.libreGb)} libres`,
        detalle: `de ${capacidad(cuota.totalGb)} · ${cantidad} carpeta${cantidad === 1 ? "" : "s"} espejada${cantidad === 1 ? "" : "s"} · última sync ${tiempoDesde(ultima)}`,
        tono,
    };
}

export function interpretarEstadoEspejo(
    estado?: EstadoEspejoDriveInput | null,
    ahoraMs: number = Date.now(),
): InterpretacionEspejo {
    if (!estado || estado.montado === false) {
        return {
            tono: "peligro",
            titulo: "Drive no montado",
            detalle: "Google Drive (DriveFS) no está montado en esta neurona",
            cuando: "sin montar",
        };
    }

    const error = estado.error ?? estado.espejo?.error;
    if (error) {
        return {
            tono: "peligro",
            titulo: "Error en espejo",
            detalle: `Error al conectar o copiar en Drive: ${error}`,
            cuando: "error",
        };
    }

    const fechaIso = estado.espejo?.ultimoEspejo ?? estado.ultimoEspejo;
    if (!fechaIso) {
        return {
            tono: "aviso",
            titulo: "Sin espejo",
            detalle: "Aún no se ha realizado ningún espejo a Google Drive",
            cuando: "nunca",
        };
    }

    const ms = Date.parse(fechaIso);
    if (!Number.isFinite(ms)) {
        return {
            tono: "peligro",
            titulo: "Fecha inválida",
            detalle: "Registro de fecha de espejo corrupto o no válido",
            cuando: "desconocido",
        };
    }

    const diffMs = Math.max(0, ahoraMs - ms);
    const minutos = Math.floor(diffMs / 60_000);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);

    let cuando = "ahora";
    if (minutos >= 1 && minutos < 60) {
        cuando = `hace ${minutos} min`;
    } else if (horas >= 1 && horas < 48) {
        cuando = `hace ${horas} h`;
    } else if (dias >= 2) {
        cuando = `hace ${dias} días`;
    }

    const mb = estado.espejo?.mb ?? estado.mb;
    const mbTexto = typeof mb === "number" && mb > 0
        ? ` (${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`})`
        : "";

    if (dias >= 1) {
        const textoAtraso = dias === 1 ? "sin espejo desde ayer" : `sin espejo desde hace ${dias} días`;
        return {
            tono: "peligro",
            titulo: "Espejo atrasado",
            detalle: `${textoAtraso}${mbTexto}`,
            cuando: dias === 1 ? "ayer" : `hace ${dias} días`,
        };
    }

    if (minutos > 180) {
        return {
            tono: "aviso",
            titulo: "Espejo de hoy",
            detalle: `Última copia ${cuando}${mbTexto}`,
            cuando,
        };
    }

    return {
        tono: "ok",
        titulo: "Espejo al día",
        detalle: `espejo al día (${cuando})${mbTexto}`,
        cuando,
    };
}
const MODOS: ReadonlySet<string> = new Set(["solo-local", "espejo", "movida"]);

function esModo(valor: unknown): valor is ModoCarpeta {
    return typeof valor === "string" && MODOS.has(valor);
}

function archivoEstado(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "drive-carpetas.json");
}

function estadoInicial(): CarpetaEspecial[] {
    return CARPETAS_ESPECIALES_BASE.map((base) => ({
        ...base,
        modo: "solo-local",
        mb: 0,
        ultimaSync: null,
    }));
}

function objeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === "object" && valor !== null;
}

function reconstruirEstado(valor: unknown): CarpetaEspecial[] {
    if (!Array.isArray(valor)) return estadoInicial();
    const guardadas = new Map<string, Record<string, unknown>>();
    for (const item of valor) {
        if (objeto(item) && typeof item.id === "string") guardadas.set(item.id, item);
    }
    return CARPETAS_ESPECIALES_BASE.map((base) => {
        const guardada = guardadas.get(base.id);
        const mb = guardada?.mb;
        const ultimaSync = guardada?.ultimaSync;
        return {
            ...base,
            modo: esModo(guardada?.modo) ? guardada.modo : "solo-local",
            mb: typeof mb === "number" && Number.isFinite(mb) && mb >= 0 ? mb : 0,
            ultimaSync: typeof ultimaSync === "string" ? ultimaSync : null,
        };
    });
}

export async function leerCarpetasEspeciales(): Promise<CarpetaEspecial[]> {
    try {
        const crudo = await readFile(archivoEstado(), "utf8");
        return reconstruirEstado(JSON.parse(crudo) as unknown);
    } catch {
        return estadoInicial();
    }
}

export async function guardarCarpetaEspecial(id: string, modo: ModoCarpeta): Promise<boolean> {
    if (!esModo(modo) || !CARPETAS_ESPECIALES_BASE.some((base) => base.id === id)) return false;
    try {
        const carpetas = await leerCarpetasEspeciales();
        const actualizadas = carpetas.map((carpeta) => carpeta.id === id ? { ...carpeta, modo } : carpeta);
        const destino = archivoEstado();
        await mkdir(path.dirname(destino), { recursive: true });
        const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporal, `${JSON.stringify(actualizadas, null, 2)}\n`, "utf8");
        await rename(temporal, destino);
        return true;
    } catch {
        return false;
    }
}
