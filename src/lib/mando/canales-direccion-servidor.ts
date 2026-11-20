import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
    perfilDeCanal,
    type IdCanalEspecializado,
    type PerfilCanalEspecializado,
} from "@/lib/mando/canales-especializados";
import { sanearLineaRegistro } from "@/lib/mando/presidente-servidor";
import { raizDelProyecto } from "@/lib/mando/raiz";

const ejecutarArchivo = promisify(execFile);

export interface ConfigCanalSincronizado {
    hermes_sesion?: string;
    hermes_titulo?: string;
    telegram_bot?: string;
    telegram_env_token?: string;
    telegram_env_chat_id?: string;
    telegram_polling_permitido?: boolean;
    antigravity_chat_id?: string | null;
    astraura_puente?: string;
    jsonl_local?: string;
}

export interface MensajeCanalEspecializado {
    id: string;
    t?: number;
    de: string;
    rol: string;
    tipo?: string;
    canal?: string;
    texto: string;
}

export interface ResumenAlcanceEspecializado {
    pendientes: number;
    aprobadosSinEnviar: number;
    contactosListas: number;
    contactosTotal: number;
    ultimoObjetivo?: string;
    ultimoEstado?: string;
}

export interface EstadoCanalEspecializadoRespuesta {
    generadoEn: string;
    canal: IdCanalEspecializado;
    perfil: PerfilCanalEspecializado;
    vinculo: {
        hermesSesion: string | null;
        hermesTitulo: string;
        telegramBot: string;
        astrauraPuente: string;
        gatewayEstado: string;
        telegramGateway: string;
        sincronizado: boolean;
    };
    mensajes: MensajeCanalEspecializado[];
    produccion?: {
        encargoActivo: Record<string, unknown> | null;
        ultimasPeticiones: string[];
        alcance: ResumenAlcanceEspecializado;
    };
}

function leerJsonSeguro<T>(ruta: string, respaldo: T): T {
    try {
        if (!existsSync(ruta)) return respaldo;
        return JSON.parse(readFileSync(ruta, "utf-8")) as T;
    } catch {
        return respaldo;
    }
}

export function esIdCanalEspecializado(valor: string | null | undefined): valor is IdCanalEspecializado {
    return valor === "principal" || valor === "general" || valor === "audiovisual";
}

function leerConfigCanales(): Partial<Record<IdCanalEspecializado, ConfigCanalSincronizado>> {
    const ruta = path.join(os.homedir(), ".starseed", "canales-direccion.json");
    return leerJsonSeguro<Partial<Record<IdCanalEspecializado, ConfigCanalSincronizado>>>(ruta, {});
}

function archivoJsonlDeCanal(
    canal: IdCanalEspecializado,
    cfg?: ConfigCanalSincronizado,
): string {
    const raiz = raizDelProyecto();
    if (typeof cfg?.jsonl_local === "string" && cfg.jsonl_local.trim()) {
        const rel = cfg.jsonl_local.trim();
        return path.isAbsolute(rel) ? rel : path.join(raiz, rel);
    }
    const nombre = canal === "principal" ? "chat.jsonl" : `${canal}.jsonl`;
    return path.join(raiz, "starseed_memory_root", "mando", "director", nombre);
}

function leerMensajesJsonl(ruta: string, limite = 60): MensajeCanalEspecializado[] {
    if (!existsSync(ruta)) return [];
    try {
        const lineas = readFileSync(ruta, "utf-8").split("\n").filter((l) => l.trim().length > 0);
        const salida: MensajeCanalEspecializado[] = [];
        for (const linea of lineas.slice(-limite * 2)) {
            try {
                const reg = JSON.parse(linea) as Record<string, unknown>;
                if (reg.tipo === "entrega") continue;
                const texto = typeof reg.texto === "string" ? sanearLineaRegistro(reg.texto.trim()) : "";
                if (!texto) continue;
                salida.push({
                    id: typeof reg.id === "string" ? reg.id : `msg-${salida.length}`,
                    ...(typeof reg.t === "number" ? { t: reg.t } : {}),
                    de: typeof reg.de === "string" ? reg.de : "sistema",
                    rol: typeof reg.rol === "string" ? reg.rol : "director",
                    ...(typeof reg.tipo === "string" ? { tipo: reg.tipo } : {}),
                    ...(typeof reg.canal === "string" ? { canal: reg.canal } : {}),
                    texto,
                });
            } catch {
                continue;
            }
        }
        return salida.slice(-limite);
    } catch {
        return [];
    }
}

function leerResumenAlcance(raiz: string): ResumenAlcanceEspecializado {
    const dirAlcance = path.join(raiz, "starseed_memory_root", "alcance");
    const pendientesArr = leerJsonSeguro<Array<Record<string, unknown>>>(
        path.join(dirAlcance, "pendientes.json"),
        [],
    );
    const pendientes = Array.isArray(pendientesArr)
        ? pendientesArr.filter((x) => !x?.enviado).length
        : 0;
    const aprobadosSinEnviar = Array.isArray(pendientesArr)
        ? pendientesArr.filter((x) => Boolean(x?.aprobado) && !x?.enviado).length
        : 0;
    const ultimo = Array.isArray(pendientesArr) && pendientesArr.length > 0
        ? pendientesArr[pendientesArr.length - 1]
        : null;

    let contactosListas = 0;
    let contactosTotal = 0;
    if (existsSync(dirAlcance)) {
        try {
            const archivos = readdirSync(dirAlcance).filter(
                (f) => f.startsWith("contactos-") && f.endsWith(".json"),
            );
            contactosListas = archivos.length;
            for (const f of archivos) {
                const datos = leerJsonSeguro<Record<string, unknown> | unknown[]>(
                    path.join(dirAlcance, f),
                    [],
                );
                if (Array.isArray(datos)) {
                    contactosTotal += datos.length;
                } else if (datos && typeof datos === "object") {
                    const items = (datos.contactos ?? datos.items ?? datos.destinatarios) as unknown;
                    if (Array.isArray(items)) contactosTotal += items.length;
                }
            }
        } catch {
            // Ignora errores de lectura de directorio opcional.
        }
    }

    return {
        pendientes,
        aprobadosSinEnviar,
        contactosListas,
        contactosTotal,
        ...(typeof ultimo?.destinatario === "string"
            ? { ultimoObjetivo: sanearLineaRegistro(ultimo.destinatario.slice(0, 80)) }
            : {}),
        ...(typeof ultimo?.estado === "string"
            ? { ultimoEstado: sanearLineaRegistro(ultimo.estado.slice(0, 40)) }
            : {}),
    };
}

function leerResumenProduccion(raiz: string): EstadoCanalEspecializadoRespuesta["produccion"] {
    const basePeticiones = path.join(os.homedir(), ".starseed", "peticiones");
    const encargoRaw = leerJsonSeguro<Record<string, unknown> | null>(
        path.join(basePeticiones, "encargo_activo.json"),
        null,
    );
    const encargoActivo =
        encargoRaw && typeof encargoRaw === "object" && Object.keys(encargoRaw).length > 0
            ? Object.fromEntries(
                  Object.entries(encargoRaw).map(([k, v]) => [
                      k,
                      typeof v === "string" ? sanearLineaRegistro(v.slice(0, 240)) : v,
                  ]),
              )
            : null;

    let ultimasPeticiones: string[] = [];
    const rutaLog = path.join(basePeticiones, "mensajes_recibidos.log");
    if (existsSync(rutaLog)) {
        try {
            ultimasPeticiones = readFileSync(rutaLog, "utf-8")
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(-12)
                .map((l) => sanearLineaRegistro(l));
        } catch {
            ultimasPeticiones = [];
        }
    }

    return {
        encargoActivo,
        ultimasPeticiones,
        alcance: leerResumenAlcance(raiz),
    };
}

export async function obtenerEstadoCanalEspecializado(
    canal: IdCanalEspecializado,
): Promise<EstadoCanalEspecializadoRespuesta> {
    const raiz = raizDelProyecto();
    const perfil = perfilDeCanal(canal);
    const mapa = leerConfigCanales();
    const cfg = mapa[canal];

    const gwState = leerJsonSeguro<{
        gateway_state?: string;
        platforms?: { telegram?: { state?: string } };
    }>(path.join(os.homedir(), ".hermes", "gateway_state.json"), {});

    const rutaJsonl = archivoJsonlDeCanal(canal, cfg);
    const mensajes = leerMensajesJsonl(rutaJsonl, 60);
    const hermesSesion =
        typeof cfg?.hermes_sesion === "string" && cfg.hermes_sesion.trim().length > 0
            ? cfg.hermes_sesion.trim()
            : null;

    return {
        generadoEn: new Date().toISOString(),
        canal,
        perfil,
        vinculo: {
            hermesSesion,
            hermesTitulo: cfg?.hermes_titulo || perfil.sesionHermesTitulo,
            telegramBot: cfg?.telegram_bot || perfil.botTelegram,
            astrauraPuente: cfg?.astraura_puente || perfil.puenteAstraura,
            gatewayEstado: gwState.gateway_state || "desconocido",
            telegramGateway: gwState.platforms?.telegram?.state || "desconocido",
            sincronizado: Boolean(hermesSesion),
        },
        mensajes,
        ...(canal === "audiovisual" ? { produccion: leerResumenProduccion(raiz) } : {}),
    };
}

export async function enviarMensajeCanalEspecializado(
    canal: IdCanalEspecializado,
    texto: string,
    origen = "metagenesis",
): Promise<{
    ok: boolean;
    id?: string;
    canal: IdCanalEspecializado;
    telegram_ok?: boolean;
    detalle?: string;
}> {
    const limpio = texto.trim().slice(0, 4000);
    if (!limpio) {
        return { ok: false, canal, detalle: "El mensaje está vacío." };
    }
    const origenSeguro = origen.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "metagenesis";
    const raiz = raizDelProyecto();
    const script = path.join(raiz, "scripts", "puente", "sincronizador_direccion.py");
    const env = {
        ...process.env,
        PATH: `${path.join(os.homedir(), ".local", "bin")}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
    };
    const { stdout } = await ejecutarArchivo(
        "python3",
        [
            script,
            "publicar-canal",
            "--canal",
            canal,
            "--texto",
            limpio,
            "--de",
            "alex",
            "--origen",
            origenSeguro,
        ],
        {
            cwd: raiz,
            env,
            timeout: 25_000,
            maxBuffer: 1_000_000,
        },
    );
    const parsed = JSON.parse(stdout.trim()) as {
        ok?: boolean;
        id?: string;
        canal?: IdCanalEspecializado;
        telegram_ok?: boolean;
        detalle?: string;
    };
    return {
        ok: Boolean(parsed.ok),
        ...(parsed.id ? { id: parsed.id } : {}),
        canal: parsed.canal ?? canal,
        telegram_ok: parsed.telegram_ok,
        ...(parsed.detalle ? { detalle: sanearLineaRegistro(String(parsed.detalle)) } : {}),
    };
}
