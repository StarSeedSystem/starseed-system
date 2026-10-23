/**
 * Fixtures de las pruebas de la interfaz de «Recursos de IA»: la Mac de Alex (Apple M1, 8 GB,
 * macOS 26.3.1, 9,2 GB libres de 228, Swift 6.0.2 sin Xcode), un Oracle A1 (Linux arm64, 12 GB)
 * y un SSD externo USB de 500 GB; un plan con una sugerencia 1.58 óptima y TurboFieldfare
 * `no-cabe` con su arreglo, y una pregunta de tamaño. Más un almacén de estado en memoria que
 * sustituye a `asignaciones.ts` (lo escribe otro agente a la vez: aquí no dependemos de él).
 */
import { vi } from "vitest";

import type {
    Alcance,
    Asignacion,
    ConfigTopologia,
    ElementoRef,
    EstadoRecursosIa,
    InventarioRecursos,
    MedioAlmacen,
    PlanRecursos,
    RequisitosModelo,
    TipoElemento,
} from "@/lib/recursos-ia/tipos";

export const SSD: MedioAlmacen = {
    id: "mac:ext:ssd",
    tipo: "disco-externo",
    etiqueta: "SSD externo",
    neuronaId: "mac",
    ruta: "/Volumes/SSD",
    totalGb: 500,
    libreGb: 480,
    lecturaMBs: 900,
    tipoDisco: "ssd",
    conexion: "usb",
    via: "local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

export const DISCO_MAC: MedioAlmacen = {
    id: "mac:interno",
    tipo: "neurona-local",
    etiqueta: "Macintosh HD",
    neuronaId: "mac",
    ruta: "/",
    totalGb: 228,
    libreGb: 9.2,
    tipoDisco: "ssd",
    conexion: "interna",
    via: "local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

export const INV: InventarioRecursos = {
    generado: "2026-10-23T10:00:00.000Z",
    estaNeuronaId: "mac",
    neuronas: [
        {
            id: "mac",
            nombre: "Mac de Alex",
            tipo: "portátil",
            online: true,
            esEsta: true,
            vias: ["local"],
            procesadores: [
                {
                    id: "mac:cpu",
                    neuronaId: "mac",
                    tipo: "cpu",
                    nombre: "Apple M1",
                    so: "macOS 26.3.1",
                    arquitectura: "arm64",
                    nucleos: 8,
                    ramGb: 8,
                    ramLibreGb: 1.1,
                    memoriaUnificada: true,
                    aceleradores: ["metal", "neon", "ane"],
                    runtimes: ["llama-cpp", "bitnet-cpp"],
                    herramientas: ["swift-6.0.2"],
                    via: "local",
                    disponible: true,
                    fuente: "detectado",
                },
            ],
            almacenes: [DISCO_MAC, SSD],
        },
        {
            id: "a1",
            nombre: "Oracle A1",
            tipo: "servidor",
            online: true,
            esEsta: false,
            vias: ["red-starseed", "internet"],
            procesadores: [
                {
                    id: "a1:cpu",
                    neuronaId: "a1",
                    tipo: "cpu",
                    nombre: "Ampere A1",
                    so: "Linux",
                    arquitectura: "arm64",
                    nucleos: 2,
                    ramGb: 12,
                    aceleradores: ["neon"],
                    runtimes: ["llama-cpp"],
                    via: "red-starseed",
                    disponible: true,
                    fuente: "detectado",
                },
            ],
            almacenes: [
                {
                    id: "a1:interno",
                    tipo: "neurona-local",
                    etiqueta: "Disco del A1",
                    neuronaId: "a1",
                    totalGb: 100,
                    libreGb: 60,
                    via: "red-starseed",
                    persistente: true,
                    privado: true,
                    disponible: true,
                    fuente: "estimado",
                },
            ],
        },
    ],
    almacenesSueltos: [
        { id: "biblioteca", tipo: "biblioteca", etiqueta: "Biblioteca", via: "internet", persistente: true, privado: true, disponible: true, fuente: "estimado" },
    ],
    procesadoresSueltos: [],
    avisos: ["Swift 6.0.2 sin Xcode: para compilar TurboFieldfare hace falta Swift 6.2"],
};

export const BITNET: RequisitosModelo = {
    id: "bitnet-b158-2b",
    nombre: "BitNet b1.58 2B",
    familia: "BitNet",
    capacidades: ["texto", "razon"],
    bits: 1.58,
    formato: "gguf",
    runtime: "bitnet-cpp",
    parametrosB: 2.4,
    disco: { gb: 1.2, verificado: true },
    ramMinGb: 1.5,
    almacenamiento: { modo: "mmap", soloLocal: true },
    medios: ["nativo", "servidor"],
    licencia: "MIT",
    upstream: "https://github.com/microsoft/BitNet",
    estado: "recomendado",
    origen: "capas",
};

export const TURBO: RequisitosModelo = {
    id: "turbo-fieldfare-gemma4-26b",
    nombre: "TurboFieldfare · Gemma 4 26B-A4B",
    familia: "Gemma 4",
    capacidades: ["texto", "razon"],
    bits: 4,
    formato: "mlx",
    runtime: "swift-metal",
    parametrosB: 26,
    activosB: 4,
    disco: { gb: 14.3, verificado: false, descargaGb: 15 },
    ramMinGb: 8,
    so: ["macOS>=26"],
    arquitecturas: ["arm64"],
    aceleradoresRequeridos: ["metal4"],
    herramientasRequeridas: ["swift-6.2"],
    almacenamiento: { modo: "streaming-ssd", lecturaMinMBs: 1500, soloLocal: true },
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8080/v1" },
    medios: ["nativo"],
    licencia: "Apache-2.0",
    upstream: "https://github.com/drumih/turbo-fieldfare",
    tokSRef: [{ equipo: "M2 Air 8 GB", tokS: 5.1 }],
    estado: "experimental",
    origen: "propio",
};

export const KOKORO: RequisitosModelo = {
    id: "kokoro-82m",
    nombre: "Kokoro 82M",
    familia: "Kokoro",
    capacidades: ["voz-tts"],
    bits: 8,
    formato: "onnx",
    runtime: "webgpu-onnx",
    parametrosB: 0.082,
    disco: { gb: null, verificado: false },
    ramMinGb: 0.5,
    almacenamiento: { modo: "carga-completa", soloLocal: false },
    medios: ["web", "pwa", "nativo"],
    licencia: "Apache-2.0",
    upstream: "https://huggingface.co/hexgrad/Kokoro-82M",
    estado: "recomendado",
    origen: "catalogo-local",
};

export const CATALOGO: RequisitosModelo[] = [BITNET, TURBO, KOKORO];

export const ARREGLO_TURBO = "Conecta el SSD externo por USB-C y elígelo como almacén";

export function sugerida(alcance: Alcance): ConfigTopologia {
    return { topologia: "servidor-propio", servidorNeuronaId: "a1", vias: ["local", "malla-local", "red-starseed"], alcance };
}

export function plan(topologia: ConfigTopologia): PlanRecursos {
    const mac = INV.neuronas[0];
    return {
        topologia,
        resumen: "Texto y razón con BitNet 1.58 en tu Mac; la voz espera a que confirmes su tamaño.",
        sugerencias: [
            {
                capacidad: "texto",
                modelo: BITNET,
                procesador: mac.procesadores[0],
                almacen: DISCO_MAC,
                via: "local",
                compat: { nivel: "optimo", puntuacion: 92, motivos: [], tokSEstimado: 18 },
                porQue: ["1.58-bit: lo más eficiente que corre en local", "Cabe con holgura en el disco interno"],
                alternativas: [
                    {
                        modeloId: TURBO.id,
                        procesadorId: "mac:cpu",
                        almacenId: "mac:interno",
                        via: "local",
                        compat: {
                            nivel: "no-cabe",
                            puntuacion: 8,
                            motivos: [{ clave: "disco", texto: "Necesita 14,3 GB y quedan 9,2 GB en Macintosh HD", bloquea: true, arreglo: ARREGLO_TURBO }],
                        },
                    },
                ],
            },
        ],
        sinOpcion: [{ capacidad: "video", motivo: "Ningún modelo de vídeo cabe en 8 GB de RAM." }],
        preguntas: [
            { id: "q-tam-kokoro", texto: "¿Cuánto ocupa Kokoro 82M en disco? No lo vamos a suponer.", tipo: "tamano-modelo", modeloId: KOKORO.id },
            {
                id: "q-descarga-bitnet",
                texto: "¿Descargo BitNet b1.58 2B (1,2 GB) en «Macintosh HD»?",
                tipo: "confirmar-descarga",
                modeloId: BITNET.id,
                opciones: [
                    { valor: "si", texto: "Sí, descárgalo" },
                    { valor: "no", texto: "Ahora no" },
                ],
            },
        ],
    };
}

/* ── Estado en memoria en lugar de `asignaciones.ts` ───────────────────────── */

const vacio = (): EstadoRecursosIa => ({ v: 1, asignaciones: {}, topologias: {}, tamanosConfirmados: {}, almacenesDeclarados: [] });
let estado: EstadoRecursosIa = vacio();
const claveElemento = (t: TipoElemento, id: string) => `${t}:${id}`;
const claveAlcance = (a: Alcance) => `${a.tipo}:${a.id}`;

export function resolverPorDefecto(e: EstadoRecursosIa, el: ElementoRef, _padres: ElementoRef[] = []): { almacenEn: string; procesaEn?: string; heredadaDe?: string } {
    const a = e.asignaciones[claveElemento(el.tipo, el.id)];
    return a ? { almacenEn: a.almacenEn, procesaEn: a.procesaEn } : { almacenEn: "auto" };
}

export const asignacionesFalsas = {
    estadoVacio: vacio,
    claveElemento,
    claveAlcance,
    leerEstado: () => estado,
    guardarEstado: (e: EstadoRecursosIa) => {
        estado = e;
    },
    asignar: vi.fn((e: EstadoRecursosIa, a: Asignacion) => ({ ...e, asignaciones: { ...e.asignaciones, [claveElemento(a.elemento.tipo, a.elemento.id)]: a } })),
    quitarAsignacion: vi.fn((e: EstadoRecursosIa, t: TipoElemento, id: string) => {
        const asignaciones = { ...e.asignaciones };
        delete asignaciones[claveElemento(t, id)];
        return { ...e, asignaciones };
    }),
    resolverAsignacion: vi.fn(resolverPorDefecto),
    fijarTopologia: vi.fn((e: EstadoRecursosIa, c: ConfigTopologia) => ({ ...e, topologias: { ...e.topologias, [claveAlcance(c.alcance)]: c } })),
    confirmarTamano: vi.fn((e: EstadoRecursosIa, id: string, gb: number) => ({ ...e, tamanosConfirmados: { ...e.tamanosConfirmados, [id]: gb } })),
    declararAlmacen: vi.fn((e: EstadoRecursosIa, m: MedioAlmacen) => ({ ...e, almacenesDeclarados: [...e.almacenesDeclarados.filter((x) => x.id !== m.id), m] })),
};

export function reiniciarEstado(e: EstadoRecursosIa = vacio()): void {
    estado = e;
}
