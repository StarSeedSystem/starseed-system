/**
 * Inventario de recursos de IA visto desde esta neurona (navegador · 2026-10-23).
 * SOP `architecture/recursos-ia-neurona.md` §1 y §4.
 *
 * - `inventarioDesde` es PURO: une las fuentes (esta neurona, la máquina por dentro si hay servidor
 *   local, las otras neuronas de la cuenta, Biblioteca, carpetas, servidores de cerebros y lo
 *   declarado a mano) con ids estables y avisos honestos.
 * - `detectarEstaNeurona` / `detectarInventario` leen el entorno. Los módulos con efectos
 *   (neuronas, Supabase, malla, carpetas) se cargan con `import()` DENTRO de las funciones: así
 *   este archivo es barato de importar y las pruebas de `inventarioDesde` no arrastran Supabase.
 * - NADA de `node:*`: lo importa el navegador (solo `import type` de módulos de servidor).
 */
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import type { Neuron, NeuronCapabilities } from "@/lib/neurons/neurons";
import type { CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import { esDeteccionMaquina, type DeteccionMaquina, type GpuDetectada, type VolumenDetectado } from "./deteccion-tipos";
import type { Acelerador, InventarioRecursos, MedioAlmacen, NeuronaRecursos, Procesador, TipoDisco, Via } from "./tipos";

/**
 * Lo que mide la app nativa con el comando `recursos_ia_detectar`: volúmenes reales (también
 * externos) y NPU por el nombre del chip. La web no puede ver nada de esto.
 */
export interface DeteccionNativa {
    so?: string;
    arquitectura?: "arm64" | "x86_64" | "otra";
    chip?: string;
    nucleos?: number;
    ramGb?: number;
    npu?: { nombre: string; tops?: number };
    volumenes?: VolumenDetectado[];
    avisos?: string[];
}

export interface FuentesInventario {
    estaNeurona: NeuronaRecursos;
    /** Otras neuronas de la cuenta (de `neuron_devices` / malla), ya convertidas. */
    otrasNeuronas?: NeuronaRecursos[];
    /** La máquina por dentro, si esta neurona tiene servidor local (`/api/recursos-ia/detectar`). */
    maquina?: DeteccionMaquina | null;
    /** Biblioteca, carpetas de cerebros, servidores de almacenamiento, nube. */
    almacenesCuenta?: MedioAlmacen[];
    /** Servidores propios/comunales con cómputo (de `brain_servers`, ofertas). */
    servidores?: Procesador[];
    /** Declarados a mano por la persona. */
    declarados?: MedioAlmacen[];
    ahora?: Date;
}

export const AVISO_DISCOS =
    "El navegador no ve los discos: abre StarSeed en esta neurona con su servidor local o la app nativa para detectarlos.";
export const AVISO_RAM_NAVEGADOR =
    "La RAM de esta neurona la estima el navegador y topa en 8 GB: con su servidor local se mide la real.";

/* ───────────────────────────── Ayudantes PUROS ───────────────────────────── */

const GIB = 1024 ** 3;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Une listas por `id`: la posterior manda (así lo medido pisa a lo estimado con el mismo id). */
function unirPorId<T extends { id: string }>(...listas: T[][]): T[] {
    const m = new Map<string, T>();
    for (const l of listas) for (const x of l) if (x && typeof x.id === "string" && x.id) m.set(x.id, x);
    return [...m.values()];
}

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/**
 * Lectura secuencial estimada (MB/s) por tipo de disco y conexión: NVMe interno ~2500, SSD por
 * USB ~900 (USB 3.2 Gen 2), Thunderbolt ~2500, disco duro ~120, SD ~80, red ~100 (gigabit).
 * `undefined` si no se puede estimar con honradez. PURA.
 */
export function lecturaEstimadaMBs(tipoDisco?: TipoDisco, conexion?: MedioAlmacen["conexion"]): number | undefined {
    if (conexion === "nube") return undefined;
    if (conexion === "red" || tipoDisco === "red") return 100;
    if (tipoDisco === "sd") return 80;
    if (tipoDisco === "hdd") return 120;
    if (conexion === "thunderbolt") return 2500;
    if (conexion === "usb") return tipoDisco === "ssd" || tipoDisco === "nvme" ? 900 : undefined;
    if (conexion === "interna") return tipoDisco === "nvme" ? 2500 : tipoDisco === "ssd" ? 500 : undefined;
    return undefined;
}

const TEXTO_DISCO: Record<TipoDisco, string> = {
    nvme: "NVMe",
    ssd: "SSD",
    hdd: "disco duro",
    sd: "tarjeta SD",
    red: "en red",
    desconocido: "disco",
};
const TEXTO_CONEXION: Record<NonNullable<MedioAlmacen["conexion"]>, string> = {
    interna: "interno",
    usb: "USB",
    thunderbolt: "Thunderbolt",
    red: "red",
    nube: "nube",
};

/** Runtimes que solo corren en la GPU (Metal) y los que solo usan CPU (kernels ternarios de BitNet). */
const RUNTIMES_SOLO_GPU = new Set(["mlx", "turbo-fieldfare", "swift-metal"]);
const RUNTIMES_SOLO_CPU = new Set(["bitnet-cpp"]);

const esAppleSilicon = (m: DeteccionMaquina) => /^Apple M\d/i.test(m.chip ?? "") || m.gpus.some((g) => g.memoriaUnificada && /^Apple/i.test(g.nombre));

/** API de una GPU detectada → aceleradores del contrato. PURA. */
export function aceleradoresDeGpu(g: GpuDetectada): Acelerador[] {
    const api = (g.api ?? []).map((a) => a.toLowerCase());
    const out: Acelerador[] = [];
    if (api.some((a) => a.startsWith("metal"))) out.push("metal");
    if (api.some((a) => /^metal(4|[5-9])/.test(a))) out.push("metal4");
    if (api.some((a) => a.startsWith("cuda"))) out.push("cuda");
    if (api.some((a) => a.startsWith("rocm"))) out.push("rocm");
    if (api.some((a) => a.startsWith("vulkan"))) out.push("vulkan");
    return out;
}

/**
 * Procesadores PRECISOS de esta neurona a partir de la máquina detectada. Los `runtimes` son solo
 * los INSTALADOS (medidos): si se añadieran los instalables, `verificar()` daría por listo un motor
 * que hay que instalar; lo instalable lo decide la compatibilidad (`runtimePosible`) y lo dice con
 * su motivo. Cada runtime va al procesador donde corre (BitNet en CPU, MLX/Metal en GPU). PURA.
 */
export function procesadoresDeMaquina(neuronaId: string, m: DeteccionMaquina): Procesador[] {
    const apple = esAppleSilicon(m);
    const instalados = m.runtimes;
    const simd: Acelerador[] = m.simdCpu?.length
        ? [...m.simdCpu]
        : m.arquitectura === "arm64"
          ? ["neon"]
          : m.arquitectura === "x86_64"
            ? ["avx2"] // estimado por arquitectura: casi toda CPU x86_64 desde 2013
            : [];
    const herramientas = m.herramientas.length ? [...m.herramientas] : undefined;
    const base = { neuronaId, so: m.so, arquitectura: m.arquitectura, via: "local" as Via, disponible: true, fuente: "detectado" as const };
    const out: Procesador[] = [
        {
            ...base,
            id: `${neuronaId}:cpu`,
            tipo: "cpu",
            nombre: m.chip ? `${m.chip} · CPU` : "CPU",
            nucleos: m.nucleos,
            ramGb: m.ramGb,
            ...(m.ramLibreGb !== undefined ? { ramLibreGb: m.ramLibreGb } : {}),
            ...(apple ? { memoriaUnificada: true } : {}),
            aceleradores: simd,
            runtimes: unicos(instalados.filter((r) => !RUNTIMES_SOLO_GPU.has(r))),
            ...(herramientas ? { herramientas } : {}),
        },
    ];
    m.gpus.forEach((g, i) => {
        const acel = aceleradoresDeGpu(g);
        const unificada = g.memoriaUnificada === true;
        out.push({
            ...base,
            id: i === 0 ? `${neuronaId}:gpu` : `${neuronaId}:gpu${i + 1}`,
            tipo: "gpu",
            nombre: g.nombre,
            ...(unificada
                ? {
                      memoriaUnificada: true,
                      ramGb: m.ramGb,
                      ...(m.ramLibreGb !== undefined ? { ramLibreGb: m.ramLibreGb } : {}),
                      // Metal deja a la GPU ~2/3 de la memoria unificada (recommendedMaxWorkingSetSize).
                      vramGb: r1((m.ramGb * 2) / 3),
                  }
                : g.vramGb !== undefined
                  ? { vramGb: g.vramGb, memoriaUnificada: false }
                  : {}),
            aceleradores: acel,
            // TurboFieldfare instalado corre con el runtime Swift+Metal del catálogo («swift-metal»).
            runtimes: unicos(
                instalados
                    .filter((r) => !RUNTIMES_SOLO_CPU.has(r) && (acel.length > 0 || !RUNTIMES_SOLO_GPU.has(r)))
                    .flatMap((r) => (r === "turbo-fieldfare" && acel.includes("metal") ? [r, "swift-metal"] : [r])),
            ),
            ...(herramientas ? { herramientas } : {}),
        });
    });
    if (m.npu) {
        out.push({
            ...base,
            id: `${neuronaId}:npu`,
            tipo: "npu",
            nombre: m.npu.tops ? `${m.npu.nombre} · ${m.npu.tops} TOPS` : m.npu.nombre,
            ...(apple ? { memoriaUnificada: true, ramGb: m.ramGb } : {}),
            aceleradores: apple ? ["ane", "coreml"] : [],
            runtimes: apple ? ["coreml"] : [],
        });
    }
    return out;
}

/** Ids de almacén por volumen: `<n>:interno` (el del sistema), `<n>:int:<nombre>`, `<n>:ext:<nombre>`. */
function idVolumen(neuronaId: string, v: VolumenDetectado, usados: Set<string>): string {
    let id = v.montaje === "/" && !v.externo ? `${neuronaId}:interno` : `${neuronaId}:${v.externo || v.conexion === "red" ? "ext" : "int"}:${v.nombre}`;
    // Dos discos con el mismo nombre («Sin título»): el montaje los distingue.
    if (usados.has(id)) id = `${id}@${v.montaje}`;
    usados.add(id);
    return id;
}

/** Almacenes de esta neurona a partir de los volúmenes detectados (interno y cada externo). PURA. */
export function almacenesDeMaquina(neuronaId: string, m: Pick<DeteccionMaquina, "volumenes">): MedioAlmacen[] {
    const usados = new Set<string>();
    return m.volumenes.map((v): MedioAlmacen => {
        const red = v.conexion === "red" || v.tipoDisco === "red";
        const interno = v.montaje === "/" && !v.externo;
        const lectura = lecturaEstimadaMBs(v.tipoDisco, v.conexion);
        return {
            id: idVolumen(neuronaId, v, usados),
            tipo: red ? "servidor-externo" : v.externo ? "disco-externo" : "neurona-local",
            etiqueta: interno
                ? `Disco interno (${v.nombre})`
                : `${v.nombre} · ${TEXTO_DISCO[v.tipoDisco]} ${TEXTO_CONEXION[v.conexion]}${v.soloLectura ? " (solo lectura)" : ""}`,
            neuronaId,
            ruta: v.montaje,
            totalGb: v.totalGb,
            libreGb: v.libreGb,
            ...(lectura !== undefined ? { lecturaMBs: lectura } : {}),
            tipoDisco: v.tipoDisco,
            conexion: v.conexion,
            via: "local",
            persistente: true,
            privado: true,
            // Un volumen de solo lectura sirve modelos que ya están, pero no recibe descargas.
            disponible: v.soloLectura !== true,
            fuente: "detectado",
        };
    });
}

const TIPOS_DISCO = new Set(["nvme", "ssd", "hdd", "sd", "red", "desconocido"]);
const CONEXIONES = new Set(["interna", "usb", "thunderbolt", "red", "nube"]);

/** Valida un volumen que llega de la app nativa (no se cuela una forma vieja o rota). PURA. */
export function esVolumenNativo(x: unknown): x is VolumenDetectado {
    if (!x || typeof x !== "object") return false;
    const v = x as Partial<VolumenDetectado>;
    return (
        typeof v.montaje === "string" &&
        v.montaje.length > 0 &&
        typeof v.nombre === "string" &&
        typeof v.totalGb === "number" &&
        Number.isFinite(v.totalGb) &&
        typeof v.libreGb === "number" &&
        Number.isFinite(v.libreGb) &&
        typeof v.externo === "boolean" &&
        typeof v.tipoDisco === "string" &&
        TIPOS_DISCO.has(v.tipoDisco) &&
        typeof v.conexion === "string" &&
        CONEXIONES.has(v.conexion)
    );
}

/**
 * Volúmenes y NPU medidos por la app nativa sobre esta neurona. Lo nativo gana en su terreno
 * (discos internos/externos y NPU) y NO borra lo que el navegador sí sabe (WebGPU, cuota OPFS,
 * carpetas vinculadas). El contrato marca lo medido como `fuente: "detectado"`. PURA.
 */
export function aplicarDeteccionNativa(neurona: NeuronaRecursos, nativa: DeteccionNativa | null | undefined): NeuronaRecursos {
    if (!nativa) return neurona;
    let out = neurona;
    const volumenes = (Array.isArray(nativa.volumenes) ? nativa.volumenes : []).filter(esVolumenNativo);
    if (volumenes.length) {
        out = {
            ...out,
            almacenes: unirPorId(out.almacenes, almacenesDeMaquina(out.id, { volumenes })),
        };
    }
    const npu = nativa.npu;
    if (npu && typeof npu.nombre === "string" && npu.nombre.trim()) {
        const maquina: DeteccionMaquina = {
            t: "",
            host: "",
            so: nativa.so ?? "",
            arquitectura: nativa.arquitectura ?? "otra",
            ...(nativa.chip ? { chip: nativa.chip } : {}),
            nucleos: nativa.nucleos ?? 0,
            ramGb: nativa.ramGb ?? 0,
            gpus: [],
            npu: { nombre: npu.nombre, ...(typeof npu.tops === "number" ? { tops: npu.tops } : {}) },
            volumenes: [],
            herramientas: [],
            runtimes: [],
            servidoresIA: [],
            avisos: [],
        };
        const procesador = procesadoresDeMaquina(out.id, maquina).find((p) => p.tipo === "npu");
        if (procesador) {
            out = {
                ...out,
                procesadores: unirPorId(out.procesadores.filter((p) => p.tipo !== "npu"), [procesador]),
            };
        }
    }
    return out;
}

/**
 * Superpone lo nativo a la máquina que midió el servidor local (si existe): los volúmenes y la
 * NPU de la app ganan, y se conservan GPU, runtimes y herramientas ya detectados. PURA.
 */
export function maquinaDesdeNativa(nativa: DeteccionNativa, base: DeteccionMaquina): DeteccionMaquina {
    const volumenes = (Array.isArray(nativa.volumenes) ? nativa.volumenes : []).filter(esVolumenNativo);
    const npu =
        nativa.npu && typeof nativa.npu.nombre === "string" && nativa.npu.nombre.trim()
            ? { nombre: nativa.npu.nombre, ...(typeof nativa.npu.tops === "number" ? { tops: nativa.npu.tops } : {}) }
            : base.npu;
    return {
        ...base,
        ...(nativa.chip ? { chip: nativa.chip } : {}),
        ...(npu ? { npu } : {}),
        ...(volumenes.length ? { volumenes } : {}),
        avisos: unicos([...base.avisos, ...(nativa.avisos ?? [])]),
    };
}

/** «ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)» → «Apple M1». PURA. */
export function nombreGpuNavegador(renderer: string): string {
    const angle = /^ANGLE \(([^,]*),\s*([^,]*)/.exec(renderer);
    const n = (angle ? angle[2] : renderer)
        .replace(/^ANGLE \w+ Renderer:\s*/i, "")
        .replace(/\(0x[0-9a-f]+\)/gi, "")
        .replace(/Direct3D\S*.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    return (n || renderer).slice(0, 90);
}

/** Runtimes con servidor que la neurona publicó en sus capacidades (Ollama, LM Studio, BitNet de Astraura). */
function runtimesDeCapacidades(caps: NeuronCapabilities): string[] {
    return [
        ...(caps.ollama ? ["ollama"] : []),
        ...(caps.lmstudio ? ["lmstudio"] : []),
        ...(caps.astraura158?.online && caps.astraura158.bitnet ? ["bitnet-cpp"] : []),
    ];
}

/** Lo que ya trae el propio navegador: Needle en WASM siempre; la IA integrada de Chrome si existe. */
const runtimesDelNavegador = (caps: NeuronCapabilities): string[] => ["needle-wasm", ...(caps.chromeAi ? ["chrome-ai"] : [])];

/** Procesadores y navegador ESTIMADOS a partir de las capacidades que da el navegador. */
function recursosDeCapacidades(
    id: string,
    caps: NeuronCapabilities,
    perfil: PerfilMedio | null | undefined,
    contexto: { via: Via; disponibleCpu: boolean; disponibleAlmacen: boolean; prestable?: boolean },
): { procesadores: Procesador[]; almacenes: MedioAlmacen[] } {
    const base = { neuronaId: id, so: caps.platform || undefined, via: contexto.via, fuente: "estimado" as const };
    const arq = perfil?.base.arq;
    const procesadores: Procesador[] = [
        {
            ...base,
            id: `${id}:cpu`,
            tipo: "cpu",
            nombre: "CPU (estimada por el navegador)",
            ...(arq === "arm64" || arq === "x86_64" ? { arquitectura: arq } : {}),
            ...((caps.cores ?? perfil?.base.nucleos) ? { nucleos: caps.cores ?? perfil?.base.nucleos } : {}),
            // `deviceMemory` topa en 8: es un mínimo, no la RAM real.
            ...((caps.memoryGb ?? perfil?.base.ramGb) ? { ramGb: (caps.memoryGb ?? perfil?.base.ramGb) as number } : {}),
            aceleradores: perfil?.wasm.simd ? ["wasm-simd"] : [],
            runtimes: unicos([...runtimesDelNavegador(caps), ...runtimesDeCapacidades(caps)]),
            disponible: contexto.disponibleCpu,
            ...(contexto.prestable !== undefined ? { prestable: contexto.prestable } : {}),
        },
    ];
    if (caps.gpuRenderer) {
        const nombre = nombreGpuNavegador(caps.gpuRenderer);
        const apple = /apple/i.test(`${caps.gpuVendor ?? ""} ${nombre}`);
        const nvidia = /nvidia/i.test(`${caps.gpuVendor ?? ""} ${nombre}`);
        procesadores.push({
            ...base,
            id: `${id}:gpu`,
            tipo: "gpu",
            nombre,
            ...(apple ? { memoriaUnificada: true } : {}),
            aceleradores: apple ? ["metal"] : nvidia ? ["cuda"] : [],
            runtimes: unicos(runtimesDeCapacidades(caps).filter((r) => !RUNTIMES_SOLO_CPU.has(r))),
            disponible: contexto.disponibleCpu,
            ...(contexto.prestable !== undefined ? { prestable: contexto.prestable } : {}),
        });
    }
    if (caps.webgpu || perfil?.webgpu.disponible) {
        procesadores.push({
            ...base,
            id: `${id}:webgpu`,
            tipo: "webgpu",
            nombre: "WebGPU del navegador",
            aceleradores: ["webgpu"],
            // WebLLM y ONNX Runtime Web van con el OS: con WebGPU ya están.
            runtimes: ["webgpu-onnx", "webllm"],
            disponible: contexto.disponibleCpu,
            ...(contexto.prestable !== undefined ? { prestable: contexto.prestable } : {}),
        });
    }
    // Cuota del navegador: la del perfil (MiB) o la publicada (GB decimales del registro).
    const cuotaGb =
        perfil?.almacenamiento.cuotaMb != null
            ? r1(perfil.almacenamiento.cuotaMb / 1024)
            : typeof caps.storageQuotaGb === "number"
              ? r1((caps.storageQuotaGb * 1e9) / GIB)
              : undefined;
    const libreGb =
        perfil?.almacenamiento.libreMb != null
            ? r1(perfil.almacenamiento.libreMb / 1024)
            : cuotaGb !== undefined
              ? r1(Math.max(0, cuotaGb - ((caps.storageUsedGb ?? 0) * 1e9) / GIB))
              : undefined;
    const almacenes: MedioAlmacen[] = [
        {
            id: `navegador:${id}`,
            tipo: "navegador",
            etiqueta: "Navegador (OPFS/IndexedDB)",
            neuronaId: id,
            ...(cuotaGb !== undefined ? { totalGb: cuotaGb } : {}),
            ...(libreGb !== undefined ? { libreGb } : {}),
            via: contexto.via,
            persistente: perfil?.almacenamiento.persistente === true,
            privado: true,
            disponible: contexto.disponibleAlmacen && cuotaGb !== undefined,
            fuente: "estimado",
        },
    ];
    return { procesadores, almacenes };
}

/** Esta neurona vista solo desde el navegador (todo `estimado`). PURA. */
export function neuronaDesdeNavegador(e: {
    id: string;
    nombre: string;
    caps: NeuronCapabilities;
    perfil?: PerfilMedio | null;
}): NeuronaRecursos {
    const { procesadores, almacenes } = recursosDeCapacidades(e.id, e.caps, e.perfil, {
        via: "local",
        disponibleCpu: true,
        disponibleAlmacen: true,
    });
    return {
        id: e.id,
        nombre: e.nombre,
        ...(e.caps.platform ? { tipo: e.caps.platform } : {}),
        online: true,
        esEsta: true,
        procesadores,
        almacenes,
        vias: ["local"],
    };
}

/**
 * Otra neurona de la cuenta a partir de su ficha en `neuron_devices`. Por la malla P2P cuando su
 * enlace WebRTC está abierto; si no, por la red de StarSeed (la vía real posible es la malla en
 * cuanto las dos estén en la misma red). Respeta sus permisos de cómputo y almacenamiento. PURA.
 */
export function neuronaDesdeRegistro(n: Neuron, opts: { conectadaPorMalla?: boolean } = {}): NeuronaRecursos {
    const via: Via = opts.conectadaPorMalla ? "malla-local" : "red-starseed";
    const online = n.online === true;
    const { procesadores, almacenes } = recursosDeCapacidades(n.id, n.capabilities ?? { platform: "" }, null, {
        via,
        disponibleCpu: online && n.permissions?.compute !== false,
        disponibleAlmacen: online && n.permissions?.storage !== false,
        prestable: n.permissions?.compute !== false,
    });
    return {
        id: n.id,
        nombre: n.name || "Neurona",
        ...(n.kind ? { tipo: n.kind } : {}),
        online,
        esEsta: false,
        procesadores,
        almacenes,
        vias: opts.conectadaPorMalla ? ["malla-local", "red-starseed"] : ["red-starseed"],
    };
}

const NOMBRE_SERVICIO: Record<string, string> = {
    "google-drive": "Google Drive",
    dropbox: "Dropbox",
    onedrive: "OneDrive",
    nextcloud: "Nextcloud/WebDAV",
    s3: "S3",
    otro: "Almacenamiento externo",
};

/**
 * Carpetas vinculadas → almacenes. Las del dispositivo son de ESTA neurona (`neurona-local`; solo
 * disponibles con el acceso concedido en esta sesión: el navegador no guarda el permiso); las de
 * servicios (Drive, Dropbox, Nextcloud…) son carpetas de cerebro (`carpeta-cerebro`). PURA.
 */
export function almacenesDeCarpetas(lista: CarpetaVinculada[], neuronaId: string): { deEstaNeurona: MedioAlmacen[]; deLaCuenta: MedioAlmacen[] } {
    const deEstaNeurona: MedioAlmacen[] = [];
    const deLaCuenta: MedioAlmacen[] = [];
    for (const c of lista) {
        if (!c || typeof c.id !== "string") continue;
        if (c.tipo === "dispositivo") {
            deEstaNeurona.push({
                id: `carpeta:${c.id}`,
                tipo: "neurona-local",
                etiqueta: `Carpeta «${c.nombre}»${c.vivo ? "" : " (vuelve a conceder el acceso)"}`,
                neuronaId,
                via: "local",
                persistente: true,
                privado: true,
                disponible: c.vivo === true,
                fuente: "declarado",
            });
        } else {
            const nube = c.servicio === "google-drive" || c.servicio === "dropbox" || c.servicio === "onedrive";
            deLaCuenta.push({
                id: `carpeta:${c.id}`,
                tipo: "carpeta-cerebro",
                etiqueta: `${NOMBRE_SERVICIO[c.servicio ?? "otro"] ?? "Almacenamiento externo"} · ${c.nombre}`,
                conexion: nube ? "nube" : "red",
                tipoDisco: "red",
                via: "internet",
                persistente: true,
                privado: true,
                disponible: true,
                fuente: "declarado",
            });
        }
    }
    return { deEstaNeurona, deLaCuenta };
}

/** Fila mínima de `brain_servers` (sin `config` ni claves: solo el conector). */
export interface FilaServidorCerebro {
    id: string;
    name?: string | null;
    kind?: string | null;
    endpoint?: string | null;
    status?: string | null;
    shared?: boolean | null;
    conector?: string | null;
}

/** Fila mínima de `brain_server_links`. */
export interface FilaEnlaceCerebro {
    brain_id: string;
    server_id: string;
    role?: string | null;
}

const RUNTIME_DE_CONECTOR: Record<string, string> = {
    ollama: "ollama",
    llamacpp: "llama-cpp",
    vllm: "vllm",
    comfyui: "comfyui",
    sd_webui: "sd-webui",
    starseed_brain: "starseed-brain",
};

/** Solo el origen (protocolo, host y puerto): ni usuario:clave, ni ruta, ni consulta (pueden llevar tokens). */
function origenSeguro(endpoint?: string | null): string | undefined {
    if (!endpoint) return undefined;
    try {
        const u = new URL(endpoint);
        return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
    } catch {
        return undefined;
    }
}

/**
 * Servidores de cerebros → almacenes (rol primario/réplica/almacenamiento/sincronización) y
 * procesadores (rol de cómputo o conector de IA). Privados salvo que el servidor esté compartido. PURA.
 */
export function recursosDeServidoresCerebro(
    servidores: FilaServidorCerebro[],
    enlaces: FilaEnlaceCerebro[] = [],
): { almacenes: MedioAlmacen[]; procesadores: Procesador[] } {
    const almacenes: MedioAlmacen[] = [];
    const procesadores: Procesador[] = [];
    for (const s of servidores) {
        if (!s || typeof s.id !== "string" || !s.id) continue;
        const propios = enlaces.filter((l) => l.server_id === s.id);
        const roles = new Set(propios.map((l) => String(l.role ?? "primary")));
        const kind = String(s.kind ?? "online");
        const runtime = RUNTIME_DE_CONECTOR[String(s.conector ?? "")];
        const computo = roles.has("compute") || (!!runtime && runtime !== "starseed-brain");
        const guarda = ["primary", "replica", "storage", "sync"].some((r) => roles.has(r)) || (roles.size === 0 && !computo);
        // «local» = cerebro en un equipo propio; «starseed» = servidor de la red; el resto, por internet.
        const via: Via = kind === "local" ? "local" : kind === "starseed" ? "red-starseed" : "internet";
        const disponible = !["error", "pausado"].includes(String(s.status ?? ""));
        const nombre = (s.name || "Servidor de cerebro").slice(0, 80);
        const ruta = origenSeguro(s.endpoint);
        if (guarda) {
            almacenes.push({
                id: `servidor:${s.id}`,
                tipo: kind === "service" ? "nube" : "servidor-externo",
                etiqueta: nombre,
                ...(propios[0] ? { cerebroId: propios[0].brain_id } : {}),
                ...(ruta ? { ruta } : {}),
                conexion: kind === "local" ? "interna" : kind === "service" ? "nube" : "red",
                tipoDisco: kind === "local" ? "desconocido" : "red",
                via,
                persistente: true,
                privado: s.shared !== true,
                disponible,
                fuente: "declarado",
            });
        }
        if (computo) {
            procesadores.push({
                id: `servidor:${s.id}`,
                neuronaId: `servidor:${s.id}`,
                tipo: "servidor",
                nombre,
                aceleradores: [],
                runtimes: runtime ? [runtime] : [],
                via,
                disponible,
                prestable: s.shared === true,
                // Servidor enlazado a un cerebro de la cuenta: es propio (lo privado puede procesarse aquí).
                propio: true,
                fuente: "declarado",
            });
        }
    }
    return { almacenes, procesadores };
}

/** Almacén de la Biblioteca de la cuenta (servidor de StarSeed, privado). */
export function almacenBiblioteca(disponible = true): MedioAlmacen {
    return {
        id: "biblioteca",
        tipo: "biblioteca",
        etiqueta: "Biblioteca de la cuenta",
        via: "red-starseed",
        conexion: "red",
        tipoDisco: "red",
        persistente: true,
        privado: true,
        disponible,
        fuente: "estimado",
    };
}

/* ───────────────────────────── Unión (PURA) ───────────────────────────── */

/**
 * (integración) Modelos que ya viven en esta neurona, para que el plan no pida descargarlos otra
 * vez: BitNet b1.58-2B-4T lo trae el backend de Astraura 1.58 (runtime `bitnet-cpp`, aunque su
 * servidor esté dormido mientras el enjambre escribe) y TurboFieldfare cuenta solo si su servidor
 * contesta (tener el repo clonado no es tener el modelo preparado). PURA.
 */
export function modelosInstaladosDe(neuronaId: string, m: DeteccionMaquina): NonNullable<InventarioRecursos["modelosInstalados"]> {
    const vivo = (id: string) => m.servidoresIA.some((s) => s.id === id && s.ok);
    const fuera: NonNullable<InventarioRecursos["modelosInstalados"]> = [];
    const interno = `${neuronaId}:interno`;
    if (m.runtimes.includes("bitnet-cpp") || vivo("bitnet")) {
        fuera.push({ modeloId: "bitnet-b1.58-2b-4t", procesadorId: `${neuronaId}:cpu`, almacenId: interno });
    }
    if (vivo("turbo-fieldfare")) {
        fuera.push({ modeloId: "turbo-fieldfare-gemma4-26b-a4b", procesadorId: `${neuronaId}:gpu` });
    }
    return fuera;
}

export function inventarioDesde(f: FuentesInventario): InventarioRecursos {
    const avisos: string[] = [];
    const base = f.estaNeurona;
    let esta: NeuronaRecursos = { ...base, esEsta: true, procesadores: [...base.procesadores], almacenes: [...base.almacenes] };

    if (f.maquina) {
        const m = f.maquina;
        const procs = procesadoresDeMaquina(esta.id, m);
        const alms = almacenesDeMaquina(esta.id, m);
        const idsAlm = new Set(alms.map((a) => a.id));
        esta = {
            ...esta,
            // La máquina manda en el hierro: fuera la CPU/GPU/NPU estimadas por el navegador.
            // Se quedan WebGPU, el navegador, las carpetas y lo que no sea hierro.
            procesadores: unirPorId(
                esta.procesadores.filter((p) => p.tipo !== "cpu" && p.tipo !== "gpu" && p.tipo !== "npu"),
                procs,
            ),
            almacenes: unirPorId(esta.almacenes.filter((a) => !idsAlm.has(a.id)), alms),
        };
        avisos.push(...m.avisos);
        if (!m.volumenes.length) avisos.push("El servidor local de esta neurona no pudo leer sus discos.");
    } else {
        const discoMedido = esta.almacenes.some(
            (a) => (a.tipo === "neurona-local" || a.tipo === "disco-externo") && a.fuente === "detectado",
        );
        if (!discoMedido) avisos.push(AVISO_DISCOS);
        const cpu = esta.procesadores.find((p) => p.tipo === "cpu");
        if (cpu && cpu.fuente === "estimado" && (cpu.ramGb ?? 0) >= 8) avisos.push(AVISO_RAM_NAVEGADOR);
    }
    if (!esta.procesadores.length) avisos.push("No se detectó ningún procesador en esta neurona.");

    const otras = unirPorId((f.otrasNeuronas ?? []).filter((n) => n && n.id && n.id !== esta.id)).map((n) => ({ ...n, esEsta: false }));
    const sinDiscos = otras.filter((n) => !n.almacenes.some((a) => a.tipo === "neurona-local" || a.tipo === "disco-externo")).length;
    if (sinDiscos > 0) {
        avisos.push(
            sinDiscos === 1
                ? "Una neurona de la cuenta solo publica la cuota de su navegador: ábrela con su servidor local para ver sus discos."
                : `${sinDiscos} neuronas de la cuenta solo publican la cuota de su navegador: ábrelas con su servidor local para ver sus discos.`,
        );
    }
    const neuronas = [esta, ...otras];

    // Sueltos: Biblioteca, carpetas de cerebros, servidores y lo declarado (lo declarado manda sobre
    // lo de la cuenta con el mismo id, pero no sobre un almacén medido de una neurona).
    const idsDeNeuronas = new Set(neuronas.flatMap((n) => n.almacenes.map((a) => a.id)));
    const almacenesSueltos = unirPorId(f.almacenesCuenta ?? [], f.declarados ?? []).filter((a) => !idsDeNeuronas.has(a.id));
    const idsProc = new Set(neuronas.flatMap((n) => n.procesadores.map((p) => p.id)));
    const procesadoresSueltos = unirPorId(f.servidores ?? []).filter((p) => !idsProc.has(p.id));

    return {
        generado: (f.ahora ?? new Date()).toISOString(),
        estaNeuronaId: esta.id,
        neuronas,
        almacenesSueltos,
        procesadoresSueltos,
        ...(f.maquina ? { modelosInstalados: modelosInstaladosDe(esta.id, f.maquina) } : {}),
        avisos: unicos(avisos),
    };
}

/* ───────────────────────────── Detección (lee el entorno) ───────────────────────────── */

const ESQUELETO = (): NeuronaRecursos => ({
    id: "esta",
    nombre: "Esta neurona",
    online: true,
    esEsta: true,
    procesadores: [],
    almacenes: [],
    vias: ["local"],
});

/** Espera una promesa como mucho `ms`; si no llega, `porDefecto`. Nunca lanza. */
async function conTope<T>(p: Promise<T>, ms: number, porDefecto: T): Promise<T> {
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([p.catch(() => porDefecto), new Promise<T>((res) => (t = setTimeout(() => res(porDefecto), ms)))]);
    } finally {
        if (t) clearTimeout(t);
    }
}

function nombreGuardado(clave: string, id: string): string | null {
    try {
        const p = JSON.parse(window.localStorage.getItem(clave) ?? "null") as { names?: Record<string, unknown> } | null;
        const n = p?.names?.[id];
        return typeof n === "string" && n.trim() ? n.trim() : null;
    } catch {
        return null;
    }
}

/** Esta neurona desde el navegador: id vigente, capacidades y perfil del medio. Nunca lanza. */
export async function detectarEstaNeurona(): Promise<NeuronaRecursos> {
    if (typeof window === "undefined") return ESQUELETO();
    try {
        const neuronas = await import("@/lib/neurons/neurons");
        const id = neuronas.resolverAliasEsteMedio() || neuronas.thisDeviceId() || "esta";
        const perfilP = import("@/lib/astraura/capas/perfil-medio")
            .then(async (pm) => pm.perfilDelMedio(await pm.entornoDelNavegador()))
            .catch(() => null);
        const [caps, perfil] = await Promise.all([
            neuronas.detectCapabilities().catch((): NeuronCapabilities => ({ platform: "desconocido" })),
            perfilP,
        ]);
        const nombre = nombreGuardado(neuronas.NEURON_PREFS_KEY, id) || `${caps.platform}${caps.browser ? ` · ${caps.browser}` : ""}`;
        return neuronaDesdeNavegador({ id, nombre, caps, perfil });
    } catch {
        return ESQUELETO();
    }
}

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** La máquina por dentro desde la ruta local. Nunca lanza; lo que falla va a `avisos`. */
async function pedirMaquina(avisos: string[]): Promise<DeteccionMaquina | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
        const r = await fetch("/api/recursos-ia/detectar", { signal: ctrl.signal, cache: "no-store" });
        if (!r.ok) {
            avisos.push(
                r.status === 404
                    ? "Esta neurona no tiene activo su servidor local: los discos y el chip no se pueden medir desde aquí."
                    : `El servidor local no dio la máquina (HTTP ${r.status}).`,
            );
            return null;
        }
        const j = (await r.json().catch(() => null)) as { maquina?: unknown } | null;
        if (esDeteccionMaquina(j?.maquina)) return j.maquina;
        avisos.push("El servidor local respondió algo que no es la detección de la máquina.");
        return null;
    } catch {
        avisos.push("El servidor local no contestó en 8 s: se usan los datos del navegador.");
        return null;
    } finally {
        clearTimeout(t);
    }
}

/** Lo mínimo de `window.__TAURI__` que usa esta detección. */
interface TauriRecursosIa {
    core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

/**
 * Discos y NPU desde la app nativa (`recursos_ia_detectar`). Solo si existe `window.__TAURI__`;
 * nunca lanza: si la app no contesta, deja un aviso y se sigue con lo que ve el navegador.
 */
async function pedirNativa(avisos: string[]): Promise<DeteccionNativa | null> {
    if (typeof window === "undefined") return null;
    const tauri = (window as unknown as { __TAURI__?: TauriRecursosIa }).__TAURI__;
    const invoke = tauri?.core?.invoke;
    if (typeof invoke !== "function") return null;
    try {
        const r = await conTope(Promise.resolve().then(() => invoke("recursos_ia_detectar")), 10_000, null);
        if (!r || typeof r !== "object") {
            avisos.push("La app nativa no devolvió la detección de discos.");
            return null;
        }
        return r as DeteccionNativa;
    } catch {
        avisos.push("La app nativa no pudo medir los discos ni la NPU; se usa lo que ve el navegador.");
        return null;
    }
}

/** Servidores de cerebros de la cuenta, compartidos 5 min (cada lectura cuesta dos consultas). */
let cacheServidores: { uid: string; en: number; valor: { almacenes: MedioAlmacen[]; procesadores: Procesador[] } } | null = null;
const CACHE_SERVIDORES_MS = 5 * 60_000;

async function servidoresDeCerebros(uid: string): Promise<{ almacenes: MedioAlmacen[]; procesadores: Procesador[] }> {
    const vacio = { almacenes: [] as MedioAlmacen[], procesadores: [] as Procesador[] };
    if (cacheServidores && cacheServidores.uid === uid && Date.now() - cacheServidores.en < CACHE_SERVIDORES_MS) return cacheServidores.valor;
    try {
        const { frenoActivo } = await import("@/lib/consumo/freno");
        if (frenoActivo()) return cacheServidores?.uid === uid ? cacheServidores.valor : vacio;
    } catch {
        /* sin freno legible: se sigue */
    }
    // Consulta directa con el id de la sesión local (`uidActual`, sin red) en vez de `listServers()` /
    // `listLinks()` de `brains/servers.ts`, que piden `auth.getUser()` (red) en cada llamada. Sin
    // `config` (texto libre: podría llevar algo sensible): solo el conector.
    const { createClient } = await import("@/utils/supabase/client");
    const sb = createClient();
    const [srv, lnk] = await Promise.all([
        sb.from("brain_servers").select("id,name,kind,endpoint,status,shared,conector:config->>connector").eq("owner", uid),
        sb.from("brain_server_links").select("brain_id,server_id,role").eq("owner", uid),
    ]);
    if (srv.error || !Array.isArray(srv.data)) return vacio;
    const valor = recursosDeServidoresCerebro(
        srv.data as unknown as FilaServidorCerebro[],
        Array.isArray(lnk.data) ? (lnk.data as unknown as FilaEnlaceCerebro[]) : [],
    );
    cacheServidores = { uid, en: Date.now(), valor };
    return valor;
}

/**
 * Inventario completo visto desde esta neurona. `conServidor` (por defecto: solo en localhost)
 * pide la máquina por dentro a `/api/recursos-ia/detectar` con tope de 8 s. Tolerante: sin sesión
 * o sin red devuelve lo que pudo, con avisos.
 */
export async function detectarInventario(opts: { conServidor?: boolean; declarados?: MedioAlmacen[] } = {}): Promise<InventarioRecursos> {
    const avisos: string[] = [];
    const enNavegador = typeof window !== "undefined";
    const conServidor = opts.conServidor ?? (enNavegador && typeof location !== "undefined" && HOSTS_LOCALES.has(location.hostname));
    const [estaBase, maquinaServidor, nativa] = await Promise.all([
        detectarEstaNeurona(),
        conServidor ? pedirMaquina(avisos) : Promise.resolve(null),
        pedirNativa(avisos),
    ]);
    // La app nativa mide lo que el navegador no ve (discos y NPU). Si además hay servidor local,
    // lo nativo se superpone a su máquina; si no, se aplica directamente a esta neurona.
    if (nativa?.avisos?.length) avisos.push(...nativa.avisos);
    const esta = nativa ? aplicarDeteccionNativa(estaBase, nativa) : estaBase;
    const maquina = nativa && maquinaServidor ? maquinaDesdeNativa(nativa, maquinaServidor) : maquinaServidor;

    // Carpetas vinculadas (metadatos en el navegador, sin red).
    const almacenesCuenta: MedioAlmacen[] = [];
    if (enNavegador) {
        try {
            const { listarCarpetas } = await import("@/lib/storage/carpetas-vinculadas");
            const { deEstaNeurona, deLaCuenta } = almacenesDeCarpetas(listarCarpetas(), esta.id);
            esta.almacenes.push(...deEstaNeurona);
            almacenesCuenta.push(...deLaCuenta);
            const sinAcceso = deEstaNeurona.filter((a) => !a.disponible).length;
            if (sinAcceso) avisos.push(`${sinAcceso === 1 ? "Una carpeta vinculada necesita" : `${sinAcceso} carpetas vinculadas necesitan`} volver a conceder el acceso (un clic en Permisos).`);
        } catch {
            /* sin carpetas */
        }
    }

    // Lo de la cuenta (otras neuronas, Biblioteca, servidores de cerebros) solo con sesión.
    let uid: string | null = null;
    if (enNavegador) {
        try {
            const { uidActual } = await import("@/lib/consumo/usuario");
            uid = await conTope(uidActual(), 3_000, null);
        } catch {
            uid = null;
        }
    }
    let otrasNeuronas: NeuronaRecursos[] = [];
    let servidores: Procesador[] = [];
    if (uid) {
        almacenesCuenta.push(almacenBiblioteca(true));
        const otrasP = (async () => {
            const { listNeurons } = await import("@/lib/neurons/neurons");
            const lista = await listNeurons();
            let conectadas = new Set<string>();
            try {
                const { snapshotMallaNeuronas } = await import("@/lib/network/malla-neuronas");
                conectadas = new Set(
                    snapshotMallaNeuronas()
                        .misDispositivos.filter((d) => d.enlace.estado === "conectado")
                        .map((d) => d.neuronId),
                );
            } catch {
                /* sin malla montada: por la red de StarSeed */
            }
            return lista
                .filter((n) => n.id !== esta.id && !n.isThisDevice)
                .map((n) => neuronaDesdeRegistro(n, { conectadaPorMalla: conectadas.has(n.id) }));
        })();
        const [otras, cerebros] = await Promise.all([
            conTope(otrasP, 6_000, null as NeuronaRecursos[] | null),
            conTope(servidoresDeCerebros(uid), 6_000, null as { almacenes: MedioAlmacen[]; procesadores: Procesador[] } | null),
        ]);
        if (otras) otrasNeuronas = otras;
        else avisos.push("No se pudieron leer las otras neuronas de la cuenta (sin red o tardó más de 6 s).");
        if (cerebros) {
            almacenesCuenta.push(...cerebros.almacenes);
            servidores = cerebros.procesadores;
        } else {
            avisos.push("No se pudieron leer los servidores de los cerebros (sin red o tardó más de 6 s).");
        }
    } else if (enNavegador) {
        avisos.push("Sin sesión: solo se ve esta neurona (ni la Biblioteca, ni las otras neuronas, ni los servidores de los cerebros).");
    }

    const inv = inventarioDesde({
        estaNeurona: esta,
        otrasNeuronas,
        maquina,
        almacenesCuenta,
        servidores,
        declarados: opts.declarados,
    });
    // Si se pidió la máquina y no llegó, el aviso del servidor explica el porqué mejor que el genérico.
    return { ...inv, avisos: unicos([...avisos, ...inv.avisos]) };
}
