/**
 * Administrador de servidor de Astraura 1.58 (capa nube) — SOLO servidor.
 * ─────────────────────────────────────────────────────────────────────────────
 * Junta en un solo sitio lo que Alex necesita para usar esta Mac (y, más
 * adelante, Oracle u otro servidor) como servidor de la capa nube de Astraura
 * 1.58: que no se duerma sola durante horas o días («despierto», vía
 * `caffeinate` + launchd, sin tocar la pantalla), el estado del
 * backend/BitNet/túnel, los servicios `com.starseed.*` reiniciables desde
 * aquí y el registro de servidores (esta Mac + Oracle, pendiente).
 *
 * Tolerante de punta a punta: `estadoServidor()` JAMÁS lanza, cada sonda
 * tiene timeout corto y en Linux (sin `pmset`/`launchctl`) degrada a
 * `null`/«no disponible» en vez de romper el panel. NUNCA devuelve la URL
 * del túnel de Astraura, ni rutas absolutas del disco, ni nada de `.env` —
 * solo huellas sha256. La URL de un servidor del REGISTRO sí se enseña: es
 * la propia dirección que Alex dio, no un secreto.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { raizDelProyecto } from "@/lib/mando/raiz";
import { leerServicios } from "@/lib/mando/director-fuentes";
import { tunelPublicado } from "@/lib/astraura/destino-nube";
import {
    calcularAvisos,
    ETIQUETA_DESPIERTO,
    ETIQUETAS_REINICIABLES,
    NOMBRES_SERVICIOS,
    impideReposo,
    parsearAsserciones,
    parsearBateria,
    parsearPmsetG,
    plistDespierto,
    validarServidor,
    type AstrauraBitnetEstado,
    type AstrauraServidorEstado,
    type EnergiaServidor,
    type EnjambreEstado,
    type EntradaServidor,
    type EstadoServidorAstraura,
    type FondoEstado,
    type MaquinaEstado,
    type NubeServidorEstado,
    type ServicioMando,
    type ServidorRegistrado,
    type SondaServidor,
    type TipoServidor,
} from "@/lib/mando/servidor-astraura-tipos";

const execFileAsync = promisify(execFile);

/** 12 primeros hex de sha256(texto): nunca se devuelve el texto original. */
export function huellaCorta(texto: string): string {
    return createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

/** `execFile` tolerante: cadena vacía si el binario no existe o falla (Linux/CI). */
async function ejecutar(cmd: string, args: string[], timeout = 4000): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, { timeout });
        return stdout;
    } catch {
        return "";
    }
}

// ── Energía: caffeinate, pmset, aserciones ───────────────────────────────────

function rutaPlistDespierto(): string {
    return path.join(os.homedir(), "Library", "LaunchAgents", `${ETIQUETA_DESPIERTO}.plist`);
}

function rutaDespiertoJson(): string {
    return path.join(os.homedir(), ".starseed", "despierto.json");
}

async function leerDespiertoJson(): Promise<{ activo: boolean; desde: number | null }> {
    try {
        const contenido = await readFile(rutaDespiertoJson(), "utf-8");
        const d = JSON.parse(contenido) as Record<string, unknown>;
        return {
            activo: d.activo === true,
            desde: typeof d.desde === "number" && Number.isFinite(d.desde) ? d.desde : null,
        };
    } catch {
        return { activo: false, desde: null };
    }
}

async function guardarDespiertoJson(datos: { activo: boolean; desde: number | null }): Promise<void> {
    const carpeta = path.join(os.homedir(), ".starseed");
    await mkdir(carpeta, { recursive: true });
    const ruta = rutaDespiertoJson();
    const temporal = `${ruta}.tmp`;
    await writeFile(temporal, JSON.stringify(datos, null, 2) + "\n", "utf-8");
    await rename(temporal, ruta);
}

async function medirEnergia(): Promise<EnergiaServidor> {
    const [pmsetG, pmsetBatt, pmsetAssert, guardado, servicios] = await Promise.all([
        ejecutar("pmset", ["-g"]),
        ejecutar("pmset", ["-g", "batt"]),
        ejecutar("pmset", ["-g", "assertions"]),
        leerDespiertoJson(),
        leerServicios(),
    ]);

    const configuracion = parsearPmsetG(pmsetG);
    const bateria = parsearBateria(pmsetBatt);
    const asserciones = parsearAsserciones(pmsetAssert);
    // `pmset -g` ya anota quién impide el reposo en la línea `sleep (…)`;
    // las aserciones pueden nombrar a alguien más (o al mismo, deduplicado).
    const reposoImpedidoPor = Array.from(
        new Set([...configuracion.reposoImpedidoPor, ...impideReposo(asserciones)]),
    );

    const jobDespierto = servicios.find((s) => s.etiqueta === "despierto");

    return {
        despierto: Boolean(jobDespierto && jobDespierto.pid !== null),
        pidCaffeinate: jobDespierto?.pid ?? null,
        desde: guardado.desde,
        bateria,
        reposoSistemaMin: configuracion.reposoSistemaMin,
        reposoPantallaMin: configuracion.reposoPantallaMin,
        reposoDesactivado: configuracion.reposoDesactivado,
        reposoImpedidoPor,
    };
}

/** Instala/quita el launchd `com.starseed.despierto`. Nunca lanza: siempre devuelve una frase. */
async function activarDespierto(activar: boolean): Promise<string> {
    const plist = rutaPlistDespierto();
    if (activar) {
        try {
            await mkdir(path.dirname(plist), { recursive: true });
            await writeFile(plist, plistDespierto(), "utf8");
            try {
                await execFileAsync("launchctl", ["load", "-w", plist], { timeout: 5000 });
            } catch {
                // launchctl falla si ya estaba cargado: el plist ya existe, da igual.
            }
            await guardarDespiertoJson({ activo: true, desde: Date.now() });
            return "Esta Mac se mantiene despierta como servidor: la pantalla puede apagarse, la sesión sigue en marcha.";
        } catch (e) {
            return `No se pudo activar «mantener despierta»: ${e instanceof Error ? e.message : "error desconocido"}.`;
        }
    }

    try {
        await execFileAsync("launchctl", ["unload", "-w", plist], { timeout: 5000 });
    } catch {
        // No estaba cargado: se ignora.
    }
    try {
        await execFileAsync("rm", ["-f", plist], { timeout: 5000 });
    } catch {
        // Sin plist: ya estaba desactivado.
    }
    await guardarDespiertoJson({ activo: false, desde: null });
    return "Esta Mac ya puede dormirse sola otra vez.";
}

// ── Astraura 1.58 · capa nube ────────────────────────────────────────────────

function baseBackendAstraura(): string {
    const env = String(process.env.ASTRAURA_158_URL ?? "").trim().replace(/\/+$/, "");
    return env || "http://127.0.0.1:8000";
}

function puertoLlama(): number {
    return Number(process.env.ASTRAURA_BITNET_PORT) || 8790;
}

interface RespuestaJson {
    ok: boolean;
    ms: number;
    datos: unknown;
}

/** GET tolerante con timeout duro: nunca lanza. */
async function pedirJson(url: string, timeoutMs = 3000): Promise<RespuestaJson> {
    const inicio = Date.now();
    try {
        const resp = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        const ms = Date.now() - inicio;
        if (!resp.ok) return { ok: false, ms, datos: null };
        const datos = await resp.json().catch(() => null);
        return { ok: true, ms, datos };
    } catch {
        return { ok: false, ms: Date.now() - inicio, datos: null };
    }
}

function objeto(v: unknown): Record<string, unknown> | null {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function numeroONulo(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function boolONulo(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}

async function medirAstraura(): Promise<AstrauraServidorEstado> {
    const base = baseBackendAstraura();
    const [ping, bitnet, procesos, llama] = await Promise.all([
        pedirJson(`${base}/api/ping`, 3000),
        pedirJson(`${base}/api/bitnet/estado`, 3000),
        pedirJson(`${base}/api/starseed/processes`, 3000),
        pedirJson(`http://127.0.0.1:${puertoLlama()}/health`, 3000),
    ]);

    const bDatos = objeto(bitnet.datos);
    const bitnetEstado: AstrauraBitnetEstado | null =
        bitnet.ok && bDatos
            ? {
                  dormido: boolONulo(bDatos.dormido),
                  ultimoUsoInteractivoHaceS: numeroONulo(bDatos.ultimo_uso_interactivo_hace_s),
                  vivo: boolONulo(bDatos.vivo),
              }
            : null;

    const pDatos = objeto(procesos.datos);
    const cognicion = pDatos ? objeto(pDatos.cognition) : null;
    const fondoDatos = cognicion ? objeto(cognicion.fondo) : null;
    const fondo: FondoEstado | null = cognicion
        ? {
              ciclo: numeroONulo(fondoDatos?.ciclo),
              enCurso: boolONulo(fondoDatos?.en_curso),
              descansaS: numeroONulo(fondoDatos?.descansa_s),
              aplazadasPresupuesto: numeroONulo(cognicion.aplazadas_presupuesto),
              cedidasAlChat: numeroONulo(cognicion.cedidas_al_chat),
          }
        : null;

    return {
        backend: { ok: ping.ok, ms: ping.ok ? ping.ms : null },
        bitnet: bitnetEstado,
        llama: { ok: llama.ok },
        fondo,
    };
}

function repoAstraura(): string {
    const env = String(process.env.ASTRAURA_REPO ?? "").trim();
    return env.length > 0 ? env : path.join(os.homedir(), "Documents", "IA 1.58 bit");
}

interface TunelActivoJson {
    active?: boolean;
    url?: string;
    provider?: string;
    updated_at?: string | number;
    iso_time?: string;
}

/** Lee `<repo>/backend/data/active_tunnel.json`. Nunca lanza. */
async function leerTunelActivo(): Promise<TunelActivoJson | null> {
    try {
        const contenido = await readFile(path.join(repoAstraura(), "backend", "data", "active_tunnel.json"), "utf-8");
        return JSON.parse(contenido) as TunelActivoJson;
    } catch {
        return null;
    }
}

async function medirNube(): Promise<NubeServidorEstado> {
    const [activo, publicado] = await Promise.all([leerTunelActivo(), tunelPublicado().catch(() => null)]);
    const url = typeof activo?.url === "string" && activo.url.trim() ? activo.url.trim() : null;
    const tunelActivo = Boolean(activo?.active) && url !== null;
    const huella = url ? huellaCorta(url) : null;
    const huellaPublicado = publicado ? huellaCorta(publicado) : null;
    const propia = String(process.env.ASTRAURA_CLOUD_URL ?? "").trim();

    return {
        tunelActivo,
        proveedor: typeof activo?.provider === "string" ? activo.provider : null,
        actualizado:
            typeof activo?.iso_time === "string"
                ? activo.iso_time
                : typeof activo?.updated_at === "string"
                  ? activo.updated_at
                  : null,
        huella,
        publicado: { huella: huellaPublicado },
        coincide: huella && huellaPublicado ? huella === huellaPublicado : null,
        destino: propia ? "despliegue-propio" : "esta-mac-tunel",
    };
}

// ── Servicios `com.starseed.*` ────────────────────────────────────────────────

async function medirServicios(): Promise<ServicioMando[]> {
    const servicios = await leerServicios();
    return servicios.map((s) => ({
        etiqueta: s.etiqueta,
        pid: s.pid,
        ultimaSalida: s.ultimaSalida,
        reiniciable: ETIQUETAS_REINICIABLES.includes(s.etiqueta),
    }));
}

// ── Enjambre: orquestador vivo + tope del gobernador ─────────────────────────

/**
 * ¿Hay un `starseed-enjambre` en marcha? Con `ps -axo args=`, NUNCA
 * `pgrep -l/-fl` ni `ps -E`: esos imprimen el entorno de cada proceso (con
 * secretos) además de la línea de comando.
 */
async function orquestadorVivo(): Promise<boolean> {
    const salida = await ejecutar("ps", ["-axo", "args="]);
    return salida.split("\n").some((l) => l.includes("starseed-enjambre"));
}

async function topeGobernador(): Promise<number | null> {
    try {
        const contenido = await readFile(path.join(os.homedir(), ".starseed", "gobernador.json"), "utf-8");
        const d = JSON.parse(contenido) as Record<string, unknown>;
        return numeroONulo(d.trabajadores);
    } catch {
        return null;
    }
}

async function medirEnjambre(): Promise<EnjambreEstado> {
    const [vivo, tope] = await Promise.all([orquestadorVivo(), topeGobernador()]);
    return { orquestadorVivo: vivo, topeGobernador: tope };
}

// ── Máquina ───────────────────────────────────────────────────────────────────

function medirMaquina(): MaquinaEstado {
    const carga = os.loadavg();
    return {
        hostname: os.hostname(),
        uptimeS: Math.round(os.uptime()),
        loadavg: [carga[0] ?? 0, carga[1] ?? 0, carga[2] ?? 0],
        memLibreMb: Math.round(os.freemem() / (1024 * 1024)),
        memTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
        plataforma: process.platform,
    };
}

// ── Registro de servidores (JSON en starseed_memory_root/mando/, no versionado) ──

function rutaRegistroServidores(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "servidores-astraura.json");
}

function tipoValido(v: unknown): v is TipoServidor {
    return v === "oracle" || v === "vps" || v === "otro";
}

async function leerRegistroServidores(): Promise<ServidorRegistrado[]> {
    try {
        const contenido = await readFile(rutaRegistroServidores(), "utf-8");
        const datos = JSON.parse(contenido) as unknown;
        if (!Array.isArray(datos)) return [];
        const lista: ServidorRegistrado[] = [];
        for (const bruto of datos) {
            const d = objeto(bruto);
            if (!d) continue;
            const id = typeof d.id === "string" ? d.id : "";
            const url = typeof d.url === "string" ? d.url : "";
            if (!id || !url) continue;
            const sondaBruta = objeto(d.ultimaSonda);
            const ultimaSonda: SondaServidor | undefined = sondaBruta
                ? {
                      ok: sondaBruta.ok === true,
                      ms: numeroONulo(sondaBruta.ms),
                      t: typeof sondaBruta.t === "string" ? sondaBruta.t : "",
                      detalle: typeof sondaBruta.detalle === "string" ? sondaBruta.detalle : "",
                  }
                : undefined;
            lista.push({
                id,
                nombre: typeof d.nombre === "string" ? d.nombre : id,
                tipo: tipoValido(d.tipo) ? d.tipo : "otro",
                url,
                creado: typeof d.creado === "string" ? d.creado : "",
                ultimaSonda,
            });
        }
        return lista;
    } catch {
        return [];
    }
}

/** Escritura atómica (`.tmp` + rename): esta carpeta no está versionada, se crea perezosamente. */
async function guardarRegistroServidores(lista: ServidorRegistrado[]): Promise<void> {
    const ruta = rutaRegistroServidores();
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    await writeFile(temporal, JSON.stringify(lista, null, 2) + "\n", "utf-8");
    await rename(temporal, ruta);
}

async function listaServidores(): Promise<EntradaServidor[]> {
    const guardados = await leerRegistroServidores();
    const hayOracle = guardados.some((s) => s.tipo === "oracle");
    const lista: EntradaServidor[] = [{ id: "esta-mac", nombre: "Esta Mac", tipo: "esta-mac", activo: true }, ...guardados];
    if (!hayOracle) lista.push({ id: "oracle-pendiente", tipo: "oracle", pendiente: true });
    return lista;
}

async function sondearUrl(url: string): Promise<SondaServidor> {
    const inicio = Date.now();
    try {
        const resp = await fetch(`${url}/api/ping`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        return {
            ok: resp.ok,
            ms: Date.now() - inicio,
            t: new Date().toISOString(),
            detalle: resp.ok ? "Responde." : `HTTP ${resp.status}.`,
        };
    } catch (e) {
        return {
            ok: false,
            ms: null,
            t: new Date().toISOString(),
            detalle: e instanceof Error ? e.message : "No responde.",
        };
    }
}

// ── Estado completo ───────────────────────────────────────────────────────────

function energiaVacia(): EnergiaServidor {
    return {
        despierto: false,
        pidCaffeinate: null,
        desde: null,
        bateria: { alimentacion: "desconocida", porcentaje: null, cargando: false, restante: null },
        reposoSistemaMin: null,
        reposoPantallaMin: null,
        reposoDesactivado: false,
        reposoImpedidoPor: [],
    };
}
function astrauraVacia(): AstrauraServidorEstado {
    return { backend: { ok: false, ms: null }, bitnet: null, llama: { ok: false }, fondo: null };
}
function nubeVacia(): NubeServidorEstado {
    return {
        tunelActivo: false,
        proveedor: null,
        actualizado: null,
        huella: null,
        publicado: { huella: null },
        coincide: null,
        destino: String(process.env.ASTRAURA_CLOUD_URL ?? "").trim() ? "despliegue-propio" : "esta-mac-tunel",
    };
}

/**
 * Estado completo del panel «Servidor 1.58». JAMÁS lanza: cada pieza tiene su
 * propio timeout y, si falla igualmente, degrada a un valor vacío en vez de
 * tumbar todo el `GET`.
 */
export async function estadoServidor(): Promise<EstadoServidorAstraura> {
    const [energia, astraura, nube, servicios, enjambre, servidores] = await Promise.all([
        medirEnergia().catch(() => energiaVacia()),
        medirAstraura().catch(() => astrauraVacia()),
        medirNube().catch(() => nubeVacia()),
        medirServicios().catch(() => [] as ServicioMando[]),
        medirEnjambre().catch(() => ({ orquestadorVivo: false, topeGobernador: null }) as EnjambreEstado),
        listaServidores().catch(
            () => [{ id: "esta-mac", nombre: "Esta Mac", tipo: "esta-mac", activo: true }] as EntradaServidor[],
        ),
    ]);
    let maquina: MaquinaEstado;
    try {
        maquina = medirMaquina();
    } catch {
        maquina = { hostname: "", uptimeS: 0, loadavg: [0, 0, 0], memLibreMb: 0, memTotalMb: 0, plataforma: process.platform };
    }

    const sinAvisos: EstadoServidorAstraura = {
        t: new Date().toISOString(),
        energia,
        astraura,
        nube,
        servicios,
        enjambre,
        maquina,
        servidores,
        avisos: [],
    };
    return { ...sinAvisos, avisos: calcularAvisos(sinAvisos) };
}

// ── Acciones (POST) ───────────────────────────────────────────────────────────

export interface ResultadoAccionServidor {
    ok: boolean;
    error?: string;
    detalle?: string;
    energia?: EnergiaServidor;
    servidores?: EntradaServidor[];
    servidor?: ServidorRegistrado;
}

/**
 * Dispatcher único de `POST /api/mando/servidor`. Acepta el cuerpo JSON en
 * bruto (`unknown`) y valida él mismo la forma — así puede llamarse también
 * directamente desde una prueba sin pasar por la ruta HTTP. Nunca lanza.
 */
export async function accionServidor(entrada: unknown): Promise<ResultadoAccionServidor> {
    const cuerpo = objeto(entrada) ?? {};
    const accion = cuerpo.accion;

    try {
        switch (accion) {
            case "despierto": {
                const activar = cuerpo.activar === true;
                const detalle = await activarDespierto(activar);
                return { ok: true, detalle, energia: await medirEnergia() };
            }

            case "apagar_pantalla": {
                try {
                    await execFileAsync("pmset", ["displaysleepnow"], { timeout: 4000 });
                    return { ok: true, detalle: "Pantalla apagada: la sesión y los procesos siguen activos." };
                } catch (e) {
                    return { ok: false, error: e instanceof Error ? e.message : "No se pudo apagar la pantalla." };
                }
            }

            case "reiniciar": {
                const servicio = typeof cuerpo.servicio === "string" ? cuerpo.servicio : "";
                if (!ETIQUETAS_REINICIABLES.includes(servicio)) {
                    return { ok: false, error: `«${servicio || "?"}» no se puede reiniciar desde aquí.` };
                }
                const uid = typeof process.getuid === "function" ? process.getuid() : null;
                if (uid === null || uid === undefined) {
                    return { ok: false, error: "No se pudo determinar el usuario para reiniciar el servicio." };
                }
                try {
                    await execFileAsync("launchctl", ["kickstart", "-k", `gui/${uid}/com.starseed.${servicio}`], {
                        timeout: 8000,
                    });
                    return { ok: true, detalle: `«${NOMBRES_SERVICIOS[servicio] ?? servicio}» reiniciado.` };
                } catch (e) {
                    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reiniciar el servicio." };
                }
            }

            case "servidor_agregar": {
                const validado = validarServidor(cuerpo);
                if (!validado.ok) return { ok: false, error: validado.error };
                const lista = await leerRegistroServidores();
                const nuevo: ServidorRegistrado = {
                    id: `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    nombre: validado.servidor.nombre,
                    tipo: validado.servidor.tipo,
                    url: validado.servidor.url,
                    creado: new Date().toISOString(),
                };
                await guardarRegistroServidores([...lista, nuevo]);
                return { ok: true, servidores: await listaServidores() };
            }

            case "servidor_quitar": {
                const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
                if (id === "esta-mac") return { ok: false, error: "«Esta Mac» no se puede quitar." };
                const lista = await leerRegistroServidores();
                const filtrada = lista.filter((s) => s.id !== id);
                if (filtrada.length === lista.length) {
                    return { ok: false, error: "Ese servidor ya no está en el registro." };
                }
                await guardarRegistroServidores(filtrada);
                return { ok: true, servidores: await listaServidores() };
            }

            case "servidor_sondear": {
                const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
                const lista = await leerRegistroServidores();
                const idx = lista.findIndex((s) => s.id === id);
                if (idx === -1) return { ok: false, error: "Ese servidor ya no está en el registro." };
                const sonda = await sondearUrl(lista[idx].url);
                lista[idx] = { ...lista[idx], ultimaSonda: sonda };
                await guardarRegistroServidores(lista);
                return { ok: true, servidor: lista[idx] };
            }

            default:
                return { ok: false, error: "Acción no reconocida." };
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Fallo inesperado." };
    }
}
