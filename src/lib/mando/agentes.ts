/**
 * Lector de agentes y sesiones del Centro de Mando (Ola 238 · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Junta en una sola vista quién está trabajando en la neurona:
 *  1. Sesiones de Hermes (SQLite `~/.hermes/state.db`, en SOLO LECTURA).
 *  2. Sesiones de Claude registradas a mano
 *     (`starseed_memory_root/relevo/sesiones-claude.json`).
 *  3. Cada orquestador vivo del enjambre como una sesión más.
 *  4. Procesos vivos (`ps`): orquestadores, agentes `opencode run` y servidor.
 *
 * Cada bloque va envuelto en try/catch: un fallo en Hermes jamás deja al Mando
 * sin las demás fuentes. Nunca se devuelven claves ni rutas absolutas del
 * usuario: solo enlaces locales (127.0.0.1) y textos recortados.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { raizDelProyecto } from "@/lib/mando/raiz";

const ejecutar = promisify(execFile);

/** Raíz del repositorio (en Next.js `process.cwd()` apunta al proyecto). */
const RAIZ = raizDelProyecto();

/** Sesión normalizada de un agente del Mando. */
export interface SesionAgente {
    id: string;
    medio: "hermes" | "claude" | "enjambre";
    titulo: string;
    modelo?: string;
    enlace?: string;
    activa: boolean;
    inicio?: string;
    ultimaActividad?: string;
    ultimaAccion?: string;
    mensajes?: number;
    herramientas?: number;
    tokensEntrada?: number;
    tokensSalida?: number;
    costeUsd?: number;
    rama?: string;
    carpeta?: string;
}

/** Un proceso vivo relevante para la orquestación. */
export interface ProcesoVivo {
    pid: number;
    tipo: "orquestador" | "agente" | "servidor";
    detalle: string;
    desde?: string;
}

/** Resultado completo del lector. */
export interface LecturaAgentes {
    sesiones: SesionAgente[];
    procesos: ProcesoVivo[];
    generadoEn: string;
}

/** Valor numérico seguro: `undefined` si no es finito. */
function numero(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Texto seguro (nunca `any`). */
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Objeto plano tolerante. */
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
}

/** Epoch en segundos (guardado como texto) → ISO, o `undefined`. */
function isoDeEpoch(v: unknown): string | undefined {
    const t = texto(v).trim();
    if (!t) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return new Date(n * 1000).toISOString();
}

/** Recorta texto a un máximo sin romperlo a mitad de palabra si se puede. */
function recortar(s: string, maximo: number): string {
    if (s.length <= maximo) return s;
    return `${s.slice(0, maximo)}…`;
}

/**
 * Sesiones de Hermes desde `~/.hermes/state.db`. Usa `node:sqlite` (Node 22+);
 * si el runtime no lo tiene, devuelve lista vacía (nunca lanza).
 */
async function sesionesHermes(esStarseed: (s: string) => boolean): Promise<SesionAgente[]> {
    try {
        const sqlite = (await import("node:sqlite")) as typeof import("node:sqlite");
        const ruta = path.join(homedir(), ".hermes", "state.db");
        const db = new sqlite.DatabaseSync(`file:${ruta}?mode=ro`, { readOnly: true });
        try {
            const filas = db
                .prepare(
                    `SELECT id, model, title, display_name, cwd, git_branch,
                            started_at, ended_at, last_activity_at,
                            last_activity_description, message_count, tool_call_count,
                            input_tokens, output_tokens, estimated_cost_usd, archived, hidden,
                            git_repo_root
                     FROM sessions
                     ORDER BY CAST(last_activity_at AS REAL) DESC
                     LIMIT 40`,
                )
                .all() as Array<Record<string, unknown>>;

            const todas = filas.map((f) => {
                const carpeta = texto(f.cwd) || texto(f.git_repo_root);
                const terminada = texto(f.ended_at).trim().length > 0;
                return {
                    id: texto(f.id),
                    medio: "hermes" as const,
                    titulo:
                        texto(f.display_name) ||
                        texto(f.title) ||
                        texto(f.id).slice(0, 8) ||
                        "sesión hermes",
                    modelo: texto(f.model) || undefined,
                    enlace: `http://127.0.0.1:4444/#/sessions/${texto(f.id)}`,
                    activa: !terminada,
                    inicio: isoDeEpoch(f.started_at),
                    ultimaActividad: isoDeEpoch(f.last_activity_at),
                    ultimaAccion: texto(f.last_activity_description) || undefined,
                    mensajes: numero(f.message_count),
                    herramientas: numero(f.tool_call_count),
                    tokensEntrada: numero(f.input_tokens),
                    tokensSalida: numero(f.output_tokens),
                    costeUsd: numero(f.estimated_cost_usd),
                    rama: texto(f.git_branch) || undefined,
                    carpeta: carpeta || undefined,
                    _oculta: Boolean(f.archived) || Boolean(f.hidden),
                    _starseed: esStarseed(carpeta),
                };
            });

            let visibles = todas.filter((s) => !s._oculta);
            const propias = visibles.filter((s) => s._starseed);
            visibles = propias.length > 0 ? propias : visibles.slice(0, 15);

            return visibles.map(({ _oculta, _starseed, ...sesion }) => {
                void _oculta;
                void _starseed;
                return sesion;
            });
        } finally {
            try {
                db.close();
            } catch {
                // Cierre no crítico.
            }
        }
    } catch {
        // Runtime sin node:sqlite o base de datos ausente: lista vacía.
        return [];
    }
}

/** Sesiones de Claude registradas a mano en el relevo. */
async function sesionesClaude(): Promise<SesionAgente[]> {
    try {
        const bruto = await readFile(
            path.join(RAIZ, "starseed_memory_root/relevo/sesiones-claude.json"),
            "utf-8",
        );
        const datos = JSON.parse(bruto) as unknown;
        const lista = Array.isArray(datos) ? datos : [];
        return lista.map((item) => {
            const s = objeto(item);
            return {
                id: texto(s.id),
                medio: "claude" as const,
                titulo: texto(s.titulo) || texto(s.id) || "sesión claude",
                enlace: texto(s.enlace) || undefined,
                activa: texto(s.estado) === "activa",
                inicio: texto(s.inicio) || undefined,
                ultimaActividad: texto(s.ultimaActividad) || undefined,
                carpeta: texto(s.proyecto) || undefined,
            };
        });
    } catch {
        return [];
    }
}

/** Ejecuta `ps` y devuelve líneas crudas (vacío si falla). */
async function listarProcesos(): Promise<ProcesoVivo[]> {
    try {
        const { stdout } = await ejecutar("ps", ["ax", "-o", "pid=,etime=,command="], {
            maxBuffer: 1024 * 1024,
        });
        return clasificarProcesos(stdout);
    } catch {
        return [];
    }
}

/** Clasifica las líneas de `ps` en los tipos que interesan al Mando. */
function clasificarProcesos(salida: string): ProcesoVivo[] {
    const vivos: ProcesoVivo[] = [];
    for (const linea of salida.split("\n")) {
        const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(linea);
        if (!m) continue;
        const pid = Number(m[1]);
        const desde = m[2];
        const comando = m[3] ?? "";

        let tipo: ProcesoVivo["tipo"] | null = null;
        if (/starseed-enjambre\.py/.test(comando)) tipo = "orquestador";
        else if (/opencode\s+run/.test(comando)) tipo = "agente";
        else if (/next-server|next dev/.test(comando)) tipo = "servidor";
        if (!tipo) continue;

        vivos.push({ pid, tipo, detalle: recortar(comando, 120), desde });
    }
    return vivos;
}

/** Nombre de la cola a partir del comando del orquestador (para el título). */
function colaDe(comando: string): string {
    const m = /cola-[^\s"']+\.json/.exec(comando);
    return m ? m[0].replace(/\.json$/, "") : "cola";
}

/**
 * Lee el estado completo de agentes y procesos de la neurona. Cada bloque es
 * independiente: el fallo de uno no afecta a los demás.
 */
export async function leerAgentes(): Promise<LecturaAgentes> {
    const esStarseed = (s: string) => s.toLowerCase().includes("starseed");

    const [hermes, claude, procesos] = await Promise.all([
        sesionesHermes(esStarseed),
        sesionesClaude(),
        listarProcesos(),
    ]);

    const enjambre: SesionAgente[] = procesos
        .filter((p) => p.tipo === "orquestador")
        .map((p) => ({
            id: `proc-${p.pid}`,
            medio: "enjambre" as const,
            titulo: `Enjambre · ${colaDe(p.detalle)}`,
            activa: true,
            ultimaAccion: p.detalle,
        }));

    return {
        sesiones: [...hermes, ...claude, ...enjambre],
        procesos,
        generadoEn: new Date().toISOString(),
    };
}
