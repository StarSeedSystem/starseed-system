/**
 * Lógica de servidor para el Director presidente autónomo y panel headless (`/api/mando/director/presidente`).
 * Solo servidor: lee estado real en disco/gateway y ejecuta acciones seguras en lista blanca.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
    clonarDefaultsPresidente,
    validarConfigPresidente,
    type AccionHeadlessPresidente,
    type ConfigPresidente,
    type EstadoCanalUnificado,
    type EstadoPasarelaGratis,
    type EstadoPresidenteRespuesta,
    type EstadoProveedorPresidente,
    type FuenteRegistroHeadless,
} from "@/lib/mando/presidente-config";

const ejecutarArchivo = promisify(execFile);

function raizProyecto(): string {
    return process.env.STARSEED_ROOT ?? "/Users/alex/Documents/starseed-os-main";
}

function hogar(): string {
    return os.homedir();
}

function rutaConfigPresidente(): string {
    return path.join(hogar(), ".starseed", "director-presidente-config.json");
}

function leerJsonSeguro<T>(ruta: string, respaldo: T): T {
    try {
        if (!existsSync(ruta)) return respaldo;
        return JSON.parse(readFileSync(ruta, "utf-8")) as T;
    } catch {
        return respaldo;
    }
}

export function sanearLineaRegistro(linea: string): string {
    return linea
        .replace(/Bearer\s+[A-Za-z0-9._\-+=]+/gi, "Bearer [OCULTO]")
        .replace(/\b(sk|AIza|ghp|gho|ghs|xai|nvapi|gsk)_[A-Za-z0-9_\-]{8,}\b/g, "$1_[OCULTO]")
        .replace(/AIza[0-9A-Za-z\-_]{16,}/g, "AIza[OCULTO]")
        .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=([^\s"'`]+)/gi, "$1=[OCULTO]");
}

const ARCHIVOS_REGISTRO: Record<FuenteRegistroHeadless, string[]> = {
    cartero: ["/tmp/starseed-cartero.log", path.join(os.homedir(), ".starseed", "cartero-director.log")],
    director: ["/tmp/starseed-director.log", path.join(os.homedir(), ".starseed", "director.log")],
    mando: ["/tmp/starseed-mando.log"],
    enjambre: ["/tmp/enjambre.log"],
    "hermes-gateway": [
        path.join(os.homedir(), ".hermes", "logs", "gateway.log"),
        path.join(os.homedir(), ".hermes", "logs", "gateway.error.log"),
    ],
    "genesis-chats": ["/tmp/starseed-genesis-chats.log"],
    "tunel-metagenesis": ["/tmp/starseed-tunel-metagenesis.log"],
    pruebas: [
        "/tmp/starseed-pruebas.log",
        path.join(os.homedir(), ".starseed", "produccion", "director-pruebas.log"),
    ],
};

export function leerRegistroHeadless(fuente: FuenteRegistroHeadless, lineasMax = 40): string[] {
    const rutas = ARCHIVOS_REGISTRO[fuente] ?? [];
    const limite = Math.max(5, Math.min(200, Math.round(lineasMax)));
    for (const r of rutas) {
        if (!existsSync(r)) continue;
        try {
            const contenido = readFileSync(r, "utf-8");
            const lineas = contenido.split("\n").filter((l) => l.trim().length > 0);
            return lineas.slice(-limite).map(sanearLineaRegistro);
        } catch {
            continue;
        }
    }
    return [`(Sin archivo de registro reciente para ${fuente})`];
}

export function cargarConfigPresidenteServidor(): ConfigPresidente {
    const crudo = leerJsonSeguro<unknown>(rutaConfigPresidente(), null);
    const val = validarConfigPresidente(crudo);
    return val.ok ? val.valor : clonarDefaultsPresidente();
}

export function guardarConfigPresidenteServidor(cfg: ConfigPresidente): ConfigPresidente {
    const ruta = rutaConfigPresidente();
    mkdirSync(path.dirname(ruta), { recursive: true });
    const tmp = `${ruta}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
    renameSync(tmp, ruta);
    return cfg;
}

function contarEnColaChat(): number {
    const rutasChat = [
        path.join(raizProyecto(), "starseed_memory_root", "mando", "director", "chat.jsonl"),
        path.join(hogar(), ".starseed", "mando", "director-chat.jsonl"),
    ];
    let pendientesChat = 0;
    for (const ruta of rutasChat) {
        if (!existsSync(ruta)) continue;
        try {
            const lineas = readFileSync(ruta, "utf-8").split("\n").filter(Boolean).slice(-160);
            const ultimas = new Map<string, string>();
            for (const l of lineas) {
                try {
                    const obj = JSON.parse(l) as { tipo?: unknown; de_id?: unknown; canal?: unknown; estado?: unknown };
                    if (obj.tipo === "entrega" && typeof obj.de_id === "string" && typeof obj.canal === "string") {
                        ultimas.set(`${obj.de_id}|${obj.canal}`, String(obj.estado ?? ""));
                    }
                } catch {
                    continue;
                }
            }
            for (const est of ultimas.values()) {
                if (est === "pendiente") pendientesChat += 1;
            }
            break;
        } catch {
            continue;
        }
    }
    const carteroEstado = leerJsonSeguro<{ presidente?: { cola?: Record<string, unknown> } }>(
        path.join(raizProyecto(), "starseed_memory_root", "mando", "director", "cartero-estado.json"),
        {},
    );
    const colaPres = Object.keys(carteroEstado.presidente?.cola ?? {}).length;
    return Math.max(pendientesChat, colaPres);
}

export async function obtenerEstadoPresidenteServidor(
    registro?: FuenteRegistroHeadless,
    lineas = 40,
): Promise<EstadoPresidenteRespuesta> {
    const config = cargarConfigPresidenteServidor();
    const home = hogar();

    const limitesClaude = leerJsonSeguro<Record<string, unknown>>(
        path.join(home, ".starseed", "limites-claude.json"),
        {},
    );
    const semanalRaw = limitesClaude.semana_pct ?? limitesClaude.semanal_pct ?? limitesClaude.semana;
    const semanalNum = typeof semanalRaw === "number" ? semanalRaw : Number(semanalRaw);
    const claudeAgotado = Number.isFinite(semanalNum) && semanalNum >= 99;

    const gwState = leerJsonSeguro<{
        gateway_state?: string;
        updated_at?: string;
        platforms?: { telegram?: { state?: string } };
    }>(path.join(home, ".hermes", "gateway_state.json"), {});
    const hermesVivo = gwState.gateway_state === "running";

    const informePasarelas = leerJsonSeguro<{
        pasarelas?: Array<{
            clave?: string;
            modelo?: string;
            estado?: string;
            http?: number;
            segundos?: number;
            tiene_clave?: boolean;
        }>;
    }>(path.join(home, ".starseed", "pasarelas-informe.json"), {});

    const pasarelas: EstadoPasarelaGratis[] = (informePasarelas.pasarelas ?? []).map((p) => ({
        clave: p.clave ?? "desconocida",
        modelo: p.modelo ?? "auto",
        estado: p.estado ?? "desconocido",
        http: typeof p.http === "number" ? p.http : null,
        segundos: typeof p.segundos === "number" ? p.segundos : null,
        tieneClave: p.tiene_clave === true,
    }));
    const pasarelasVivas = pasarelas.filter((p) => p.estado === "escribe");

    const estadoAgyExiste = existsSync("/opt/homebrew/bin/agy") || existsSync("/usr/local/bin/agy") || existsSync(path.join(home, ".local", "bin", "agy"));
    const estadoCodexExiste = existsSync(path.join(home, ".local", "bin", "codex")) || existsSync("/opt/homebrew/bin/codex") || existsSync("/usr/local/bin/codex");

    const mapaProveedores: Record<string, EstadoProveedorPresidente> = {
        claude: {
            id: "claude",
            nombre: "Claude (Mac / Cowork)",
            activo: config.proveedores_activos.claude,
            disponible: config.proveedores_activos.claude && !claudeAgotado,
            estado: !config.proveedores_activos.claude ? "apagado" : claudeAgotado ? "agotado" : "listo",
            detalle: claudeAgotado
                ? `Límite semanal al ${semanalNum} %`
                : Number.isFinite(semanalNum)
                  ? `Semana al ${semanalNum} %`
                  : "Listo cuando tenga cupo",
        },
        hermes: {
            id: "hermes",
            nombre: "Hermes (Gateway + CLI)",
            activo: config.proveedores_activos.hermes,
            disponible: config.proveedores_activos.hermes,
            estado: !config.proveedores_activos.hermes ? "apagado" : hermesVivo ? "listo" : "pausado",
            detalle: hermesVivo ? "Gateway en línea y enrutado a modelo vivo" : "CLI directa disponible · gateway en espera",
        },
        agy: {
            id: "agy",
            nombre: "Antigravity (agy headless)",
            activo: config.proveedores_activos.agy,
            disponible: config.proveedores_activos.agy && estadoAgyExiste,
            estado: !config.proveedores_activos.agy ? "apagado" : estadoAgyExiste ? "listo" : "desconocido",
            detalle: estadoAgyExiste ? "Operable desde terminal sin abrir la app" : "Binario agy no detectado en PATH estándar",
        },
        chatgpt: {
            id: "chatgpt",
            nombre: "ChatGPT / Codex CLI",
            activo: config.proveedores_activos.chatgpt,
            disponible: config.proveedores_activos.chatgpt && estadoCodexExiste,
            estado: !config.proveedores_activos.chatgpt ? "apagado" : estadoCodexExiste ? "listo" : "desconocido",
            detalle: estadoCodexExiste ? "Codex headless disponible" : "CLI codex no detectada",
        },
    };

    const proveedores: EstadoProveedorPresidente[] = config.orden_proveedores.map(
        (id) =>
            mapaProveedores[id] ?? {
                id,
                nombre: id,
                activo: true,
                disponible: false,
                estado: "desconocido",
                detalle: "Sin diagnóstico",
            },
    );

    const dirMotor = leerJsonSeguro<{ motor?: string; sesion?: string; titulo?: string }>(
        path.join(home, ".starseed", "direccion-motor.json"),
        {},
    );
    const canalesDir = leerJsonSeguro<{
        principal?: { hermes_sesion?: string; telegram_bot?: string };
        general?: { hermes_sesion?: string; telegram_bot?: string };
        audiovisual?: { hermes_sesion?: string; telegram_bot?: string };
    }>(path.join(home, ".starseed", "canales-direccion.json"), {});
    const genesisChatsEst = leerJsonSeguro<{
        espejo?: { ultimo_envio?: number; subidos?: number };
    }>(path.join(home, ".starseed", "genesis-chats", "estado.json"), {});
    const chatsRegistro = leerJsonSeguro<{
        entornos?: { antigravity?: { id?: string | null }; hermes?: { id?: string | null } };
    }>(path.join(raizProyecto(), "starseed_memory_root", "mando", "chats.json"), {});
    const hermesSesionId =
        canalesDir.principal?.hermes_sesion || dirMotor.sesion || chatsRegistro.entornos?.hermes?.id || "";
    const hermesGeneralId = canalesDir.general?.hermes_sesion || "20260909_210504_867626";
    const hermesAudiovisualId = canalesDir.audiovisual?.hermes_sesion || "";
    const agyChatId = chatsRegistro.entornos?.antigravity?.id ?? null;
    const astrauraActivo =
        Boolean(genesisChatsEst.espejo?.subidos) || existsSync(path.join(home, ".starseed", "genesis-chats", "estado.json"));

    const canales: EstadoCanalUnificado[] = [
        {
            id: "metagenesis",
            nombre: "MetaGenesis (este panel)",
            sincronizado: true,
            estado: "activo",
            detalle: "3 canales especializados: Principal, General y Audiovisual/Diseño",
        },
        {
            id: "astraura",
            nombre: "Astraura › Chats › Genesis",
            sincronizado: config.sincronizar_canales.astraura,
            estado: config.sincronizar_canales.astraura ? "activo" : "pausado",
            detalle: astrauraActivo
                ? `Espejo bidireccional activo (${genesisChatsEst.espejo?.subidos ?? 0} registros · genesis, @starseed_puente_bot y @StarSeed_Design_bot)`
                : "Espejo bidireccional configurado (Principal, General y Audiovisual)",
        },
        {
            id: "telegram",
            nombre: `Dirección principal (${canalesDir.principal?.telegram_bot || "@starseed_neurocortex_bot"})`,
            sincronizado: config.sincronizar_canales.telegram,
            estado: config.sincronizar_canales.telegram ? "activo" : "pausado",
            detalle: "Telegram Maggacortex sincronizado bidireccionalmente sin duplicar eco",
        },
        {
            id: "telegram-general",
            nombre: `Dirección general (${canalesDir.general?.telegram_bot || "@starseed_puente_bot"})`,
            sincronizado: config.sincronizar_canales.telegram,
            estado:
                gwState.platforms?.telegram?.state === "connected"
                    ? "activo"
                    : config.sincronizar_canales.telegram
                      ? "revision"
                      : "pausado",
            detalle: `Enlace operativo del enjambre (Hermes ${hermesGeneralId})`,
        },
        {
            id: "telegram-audiovisual",
            nombre: `Audiovisual y diseño (${canalesDir.audiovisual?.telegram_bot || "@StarSeed_Design_bot"})`,
            sincronizado: Boolean(hermesAudiovisualId) && config.sincronizar_canales.telegram,
            estado: hermesAudiovisualId ? "activo" : "revision",
            detalle: hermesAudiovisualId
                ? `Síntesis, Stitch/DESIGN.md, vídeo y promoción/contactos ALC1113 (Hermes ${hermesAudiovisualId.slice(0, 12)}…)`
                : "Bot activo en A1; enlazando sesión dedicada de Hermes",
        },
        {
            id: "hermes",
            nombre: "Hermes",
            sincronizado: config.sincronizar_canales.hermes,
            estado: hermesVivo ? "activo" : "revision",
            detalle: [
                dirMotor.titulo ? `Principal: «${dirMotor.titulo}» (${hermesSesionId.slice(0, 14)}…)` : "Sesión principal",
                `General: ${hermesGeneralId}`,
                hermesAudiovisualId ? `Audiovisual: ${hermesAudiovisualId.slice(0, 12)}…` : "Audiovisual pendiente",
                hermesVivo ? "Gateway en vivo" : "CLI directa",
            ]
                .filter(Boolean)
                .join(" · "),
        },
        {
            id: "antigravity",
            nombre: "Antigravity (chat principal)",
            sincronizado: true,
            estado: "activo",
            detalle: agyChatId
                ? `Chat principal vinculado (${agyChatId.slice(0, 8)}…) y CLI headless`
                : "Vinculado al hilo unificado y CLI headless",
        },
        {
            id: "nube",
            nombre: "Contenedores nube / A1",
            sincronizado: config.sincronizar_canales.nube,
            estado: config.sincronizar_canales.nube ? "activo" : "pausado",
            detalle: "Accesible vía Túnel MetaGenesis y puerta A1",
        },
    ];

    let pruebasResumen: string | undefined;
    const estadoPruebas = leerJsonSeguro<{ publicado?: string; en_marcha?: string }>(
        path.join(home, ".starseed", "produccion", "director-pruebas-estado.json"),
        {},
    );
    if (estadoPruebas.publicado || estadoPruebas.en_marcha) {
        pruebasResumen = [
            estadoPruebas.publicado ? `Publicada: ${estadoPruebas.publicado}` : null,
            estadoPruebas.en_marcha ? `En curso: ${estadoPruebas.en_marcha}` : null,
        ]
            .filter(Boolean)
            .join(" · ");
    }

    return {
        generadoEn: new Date().toISOString(),
        config,
        proveedores,
        flotaGratis: {
            vivos: pasarelasVivas.length,
            total: pasarelas.length,
            pasarelas,
        },
        canales,
        enCola: contarEnColaChat(),
        ...(pruebasResumen ? { pruebasResumen } : {}),
        ...(registro ? { registro: { fuente: registro, lineas: leerRegistroHeadless(registro, lineas) } } : {}),
    };
}

export async function ejecutarAccionHeadlessPresidente(
    accion: AccionHeadlessPresidente,
    mensajePrueba?: string,
): Promise<{ ok: boolean; salida: string }> {
    const raiz = raizProyecto();
    const env = {
        ...process.env,
        PATH: `${path.join(hogar(), ".local", "bin")}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
    };

    const correr = async (args: string[], timeoutMs = 45_000) => {
        const { stdout, stderr } = await ejecutarArchivo("python3", args, {
            cwd: raiz,
            env,
            timeout: timeoutMs,
            maxBuffer: 2_000_000,
        });
        return sanearLineaRegistro((stdout || stderr || "OK").trim());
    };

    switch (accion) {
        case "enrutar-hermes":
            return { ok: true, salida: await correr([path.join(raiz, "scripts", "puente", "enrutar-hermes.py")]) };
        case "reintentar-cola": {
            const flag = path.join(hogar(), ".starseed", "mando", "reintentar-cola.flag");
            mkdirSync(path.dirname(flag), { recursive: true });
            writeFileSync(flag, `${new Date().toISOString()}\n`, "utf-8");
            try {
                await ejecutarArchivo("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 501}/com.starseed.cartero`], {
                    timeout: 8_000,
                });
            } catch {
                // La bandera ya quedó lista para la siguiente pasada del cartero.
            }
            return { ok: true, salida: "Reintento inmediato encolado para el Cartero director." };
        }
        case "buscar-capacidad":
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "buscar_capacidad.py"), "--aplicar"]),
            };
        case "comprobar-pasarelas":
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "pasarelas.py")]),
            };
        case "refrescar-acciones":
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "acciones-de-alex.py")]),
            };
        case "estado-pruebas":
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "director_pruebas.py"), "estado"]),
            };
        case "sincronizar-ides":
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "sincronizar-ides.py")]),
            };
        case "probar-presidente": {
            const texto = (mensajePrueba?.trim() || "Responde solo OK y confirma capacidad activa.").slice(0, 400);
            return {
                ok: true,
                salida: await correr([path.join(raiz, "scripts", "puente", "puente.py"), "presidente", texto], 90_000),
            };
        }
    }
}
