/**
 * Lo que devuelve `GET /api/recursos-ia/detectar` (la máquina por dentro). PURO: lo comparten
 * `deteccion-servidor.ts` (solo servidor) y `deteccion.ts` (navegador).
 */
export interface VolumenDetectado {
    montaje: string; // "/" , "/Volumes/SSD"
    nombre: string;
    totalGb: number;
    libreGb: number;
    externo: boolean;
    tipoDisco: "nvme" | "ssd" | "hdd" | "sd" | "red" | "desconocido";
    conexion: "interna" | "usb" | "thunderbolt" | "red" | "nube";
    sistemaArchivos?: string;
    soloLectura?: boolean;
}

export interface GpuDetectada {
    nombre: string;
    vramGb?: number;
    memoriaUnificada?: boolean;
    /** "metal4", "metal3", "cuda 12.4"… */
    api?: string[];
}

export interface DeteccionMaquina {
    t: string;
    host: string; // nombre corto, sin dominio
    so: string; // "macOS 26.3.1"
    arquitectura: "arm64" | "x86_64" | "otra";
    chip?: string; // "Apple M1"
    nucleos: number;
    ramGb: number;
    ramLibreGb?: number;
    gpus: GpuDetectada[];
    npu?: { nombre: string; tops?: number };
    volumenes: VolumenDetectado[];
    /** "swift-6.0.2", "xcode-26", "python-3.14", "node-22"… */
    herramientas: string[];
    /** Runtimes de IA instalados: "llama-cpp", "bitnet-cpp", "ollama", "mlx", "turbo-fieldfare"… */
    runtimes: string[];
    /** Servidores de IA que contestan en esta máquina (solo bucle local). */
    servidoresIA: { id: string; url: string; ok: boolean; modelos?: string[] }[];
    avisos: string[];
    /**
     * (opcional) Extensiones SIMD de la CPU MEDIDAS (cpuinfo/sysctl). Sin este dato,
     * `inventarioDesde` las deduce de la arquitectura y las marca como estimadas.
     */
    simdCpu?: Array<"neon" | "avx2" | "avx512">;
}

/**
 * ¿Parece una `DeteccionMaquina`? PURA. El navegador valida lo que devuelve la ruta antes de
 * usarlo: una versión vieja del servidor o un proxy que contesta otra cosa no debe colarse
 * como «detectado».
 */
export function esDeteccionMaquina(x: unknown): x is DeteccionMaquina {
    if (!x || typeof x !== "object") return false;
    const m = x as Partial<DeteccionMaquina>;
    return (
        typeof m.so === "string" &&
        typeof m.nucleos === "number" &&
        typeof m.ramGb === "number" &&
        Array.isArray(m.volumenes) &&
        Array.isArray(m.gpus) &&
        Array.isArray(m.herramientas) &&
        Array.isArray(m.runtimes) &&
        Array.isArray(m.servidoresIA) &&
        Array.isArray(m.avisos)
    );
}
