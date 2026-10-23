/**
 * `verificar` y `estimarTokS` con equipos REALES de la cuenta (2026-10-23): la Mac de Alex, el
 * Oracle A1, un móvil con WebGPU y una neurona Linux con NVIDIA. Los modelos son propios de la
 * prueba (no el catálogo real, que lo escribe otro agente y puede cambiar).
 */
import { describe, expect, it } from "vitest";
import { cabeEn, chipDeTexto, estimarTokS, familiaSo, verificar } from "../compatibilidad";
import type { MedioAlmacen, Procesador, RequisitosModelo, Via } from "../tipos";

/* ───────── equipos ───────── */

const MAC = "mac-alex";

// Mac de Alex hoy: Apple M1, 8 GB unificados, macOS 26.3.1, Swift 6.0.2 sin Xcode, BitNet en :8790.
const macCpu: Procesador = {
    id: `${MAC}:cpu`,
    neuronaId: MAC,
    tipo: "cpu",
    nombre: "Apple M1",
    so: "macOS 26.3.1",
    arquitectura: "arm64",
    nucleos: 8,
    ramGb: 8,
    memoriaUnificada: true,
    aceleradores: ["neon"],
    runtimes: ["bitnet-cpp", "llama-cpp"],
    herramientas: ["swift-6.0.2"],
    via: "local",
    disponible: true,
    fuente: "detectado",
};

const macGpu: Procesador = {
    ...macCpu,
    id: `${MAC}:gpu`,
    tipo: "gpu",
    nombre: "Apple M1 GPU (8 núcleos)",
    aceleradores: ["metal", "metal4"],
    runtimes: ["llama-cpp", "mlx", "swift-metal"],
};

const macInterno: MedioAlmacen = {
    id: `${MAC}:interno`,
    tipo: "neurona-local",
    etiqueta: "Disco interno de la Mac",
    neuronaId: MAC,
    ruta: "~",
    totalGb: 228,
    libreGb: 9.2,
    tipoDisco: "nvme",
    conexion: "interna",
    via: "local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

const macNavegador: MedioAlmacen = {
    id: `navegador:${MAC}`,
    tipo: "navegador",
    etiqueta: "Navegador de la Mac",
    neuronaId: MAC,
    libreGb: 6,
    via: "local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "estimado",
};

/** SSD externo USB-C de 500 GB (USB 3.2 Gen 2, ~1 GB/s). */
function ssdUsbC(neuronaId: string, via: Via): MedioAlmacen {
    return {
        id: `${neuronaId}:ext:SSD`,
        tipo: "disco-externo",
        etiqueta: "SSD externo USB-C",
        neuronaId,
        ruta: "/Volumes/SSD",
        totalGb: 500,
        libreGb: 480,
        lecturaMBs: 1050,
        tipoDisco: "ssd",
        conexion: "usb",
        via,
        persistente: true,
        privado: true,
        disponible: true,
        fuente: "detectado",
    };
}

// Oracle A1: Linux arm64, 2 OCPU / 12 GB, sin GPU, 45 GB libres, por la red de StarSeed.
const a1Cpu: Procesador = {
    id: "a1:cpu",
    neuronaId: "a1",
    tipo: "cpu",
    nombre: "Ampere Altra (Oracle A1)",
    so: "Linux",
    arquitectura: "arm64",
    nucleos: 2,
    ramGb: 12,
    aceleradores: ["neon"],
    runtimes: ["bitnet-cpp", "llama-cpp", "ollama"],
    via: "red-starseed",
    disponible: true,
    fuente: "detectado",
};

const a1Disco: MedioAlmacen = {
    id: "a1:interno",
    tipo: "neurona-local",
    etiqueta: "Disco del A1",
    neuronaId: "a1",
    totalGb: 47,
    libreGb: 45,
    tipoDisco: "ssd",
    conexion: "interna",
    via: "red-starseed",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

// Móvil Android con navegador WebGPU de 6 GB.
const movilWebgpu: Procesador = {
    id: "movil:webgpu",
    neuronaId: "movil",
    tipo: "webgpu",
    nombre: "Chrome con WebGPU (Android)",
    so: "Android 15",
    arquitectura: "arm64",
    ramGb: 6,
    aceleradores: ["webgpu", "wasm-simd"],
    runtimes: ["webgpu-onnx", "needle-wasm"],
    via: "malla-local",
    disponible: true,
    fuente: "detectado",
};

const movilNavegador: MedioAlmacen = {
    id: "navegador:movil",
    tipo: "navegador",
    etiqueta: "Navegador del móvil",
    neuronaId: "movil",
    libreGb: 4,
    via: "malla-local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "estimado",
};

// Neurona Linux x86_64 con NVIDIA de 12 GB.
const nvGpu: Procesador = {
    id: "nv:gpu",
    neuronaId: "nv",
    tipo: "gpu",
    nombre: "NVIDIA GeForce RTX 3060",
    so: "Linux (Ubuntu 24.04)",
    arquitectura: "x86_64",
    ramGb: 32,
    vramGb: 12,
    aceleradores: ["cuda", "vulkan"],
    runtimes: ["llama-cpp", "ollama", "onnx"],
    via: "malla-local",
    disponible: true,
    fuente: "detectado",
};

const nvDisco: MedioAlmacen = {
    id: "nv:interno",
    tipo: "neurona-local",
    etiqueta: "Disco de la neurona NVIDIA",
    neuronaId: "nv",
    totalGb: 1000,
    libreGb: 200,
    tipoDisco: "nvme",
    conexion: "interna",
    via: "malla-local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

const biblioteca: MedioAlmacen = {
    id: "biblioteca",
    tipo: "biblioteca",
    etiqueta: "Biblioteca de la cuenta",
    libreGb: 50,
    via: "red-starseed",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "declarado",
};

/* ───────── modelos de prueba ───────── */

function modelo(m: Partial<RequisitosModelo> & Pick<RequisitosModelo, "id" | "nombre">): RequisitosModelo {
    return {
        familia: "prueba",
        capacidades: ["texto"],
        bits: 4,
        formato: "gguf",
        runtime: "llama-cpp",
        parametrosB: 1,
        disco: { gb: 1, verificado: true },
        ramMinGb: 2,
        almacenamiento: { modo: "mmap", soloLocal: false },
        medios: ["nativo", "servidor"],
        licencia: "MIT",
        upstream: "prueba",
        estado: "recomendado",
        origen: "propio",
        ...m,
    };
}

const bitnet = modelo({
    id: "bitnet-b158-2b",
    nombre: "BitNet b1.58 2B",
    familia: "microsoft/bitnet",
    capacidades: ["texto", "decision"],
    bits: 1.58,
    runtime: "bitnet-cpp",
    parametrosB: 2.4,
    disco: { gb: 1.1, verificado: true },
    ramMinGb: 2,
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8790/v1" },
});

const bitnet4 = modelo({ ...bitnet, id: "gemelo-4bit", nombre: "Gemelo 4-bit", bits: 4 });

const ollama78 = modelo({
    id: "ollama-7-8b",
    nombre: "Ollama 7-8B",
    capacidades: ["texto", "razon"],
    runtime: "ollama",
    parametrosB: 8,
    disco: { gb: null, verificado: false },
    ramMinGb: 8,
});

const turbo = modelo({
    id: "turbo-fieldfare",
    nombre: "TurboFieldfare",
    familia: "google/gemma-4",
    capacidades: ["texto", "razon"],
    bits: 4,
    formato: "gturbo",
    runtime: "swift-metal",
    parametrosB: 26,
    activosB: 4,
    disco: { gb: 14.3, verificado: false, descargaGb: 15 },
    ramMinGb: 8,
    so: ["macOS>=26"],
    arquitecturas: ["arm64"],
    aceleradoresRequeridos: ["metal4"],
    herramientasRequeridas: ["swift-6.2"],
    almacenamiento: { modo: "streaming-ssd", lecturaMinMBs: 800, soloLocal: true },
    servidor: { protocolo: "openai", url: "http://127.0.0.1:8080/v1" },
    licencia: "Apache-2.0",
    upstream: "https://github.com/drumih/turbo-fieldfare",
    tokSRef: [
        { equipo: "MacBook Air M2 · 8 GB", tokS: 5.1 },
        { equipo: "MacBook Pro M5 Pro · 24 GB", tokS: 31 },
    ],
    estado: "experimental",
});

const modeloWeb = modelo({
    id: "needle-web",
    nombre: "Needle en el navegador",
    capacidades: ["decision"],
    runtime: "webgpu-onnx",
    disco: { gb: 0.12, verificado: true },
    ramMinGb: 1,
    medios: ["web", "pwa"],
});

const claves = (c: ReturnType<typeof verificar>) => c.motivos.map((x) => x.clave);
const bloqueos = (c: ReturnType<typeof verificar>) => c.motivos.filter((x) => x.bloquea).map((x) => x.clave);

/* ───────── TurboFieldfare (SOP §5) ───────── */

describe("TurboFieldfare en la Mac de Alex", () => {
    it("hoy no cabe: 9,2 GB libres para 14,3 GB instalados (15 de descarga) y faltan herramientas", () => {
        const c = verificar(turbo, macGpu, macInterno);
        expect(c.nivel).toBe("no-cabe");
        expect(bloqueos(c)).toEqual(["disco"]);
        const disco = c.motivos.find((x) => x.clave === "disco")!;
        expect(disco.texto).toContain("9,2 GB libres");
        expect(disco.arreglo).toMatch(/Libera \d/);
        expect(disco.arreglo).toContain("disco externo");
        expect(disco.arreglo).toContain("800 MB/s");
        const herr = c.motivos.find((x) => x.clave === "herramientas")!;
        expect(herr.bloquea).toBe(false);
        expect(herr.texto).toContain("Swift 6.2");
        expect(herr.texto).toContain("Swift 6.0.2");
        expect(herr.arreglo).toContain("Xcode 26");
        expect(herr.arreglo).toContain("Command Line Tools con Swift 6.2");
        // El disco interno NVMe se supone rápido, pero se dice que no está medido.
        expect(c.motivos.find((x) => x.clave === "lectura")?.texto).toContain("no está medido");
    });

    it("con un SSD USB-C de 500 GB conectado A LA MAC ya cabe; solo quedan las herramientas", () => {
        const c = verificar(turbo, macGpu, ssdUsbC(MAC, "local"));
        expect(bloqueos(c)).toEqual([]);
        expect(c.nivel).toBe("justo"); // 8 GB de 8 pedidos, ~3,5 tok/s y herramientas pendientes
        expect(claves(c)).toContain("herramientas");
        expect(c.tokSEstimado).toBeCloseTo(3.5, 1);
        expect(c.cargaSegundos).toBeUndefined(); // no se carga entero: se lee en cada token
    });

    it("el mismo SSD conectado a OTRA neurona es incompatible (los pesos no viajan por red)", () => {
        const c = verificar(turbo, macGpu, ssdUsbC("a1", "red-starseed"));
        expect(c.nivel).toBe("incompatible");
        expect(bloqueos(c)).toContain("pesos-locales");
        expect(c.puntuacion).toBe(0);
    });

    it("en la nube, la Biblioteca o un servidor externo tampoco", () => {
        expect(bloqueos(verificar(turbo, macGpu, biblioteca))).toContain("pesos-locales");
    });

    it("en Linux x86_64 con NVIDIA es incompatible por sistema, arquitectura, Metal 4 y motor", () => {
        const c = verificar(turbo, nvGpu, nvDisco);
        expect(c.nivel).toBe("incompatible");
        expect(bloqueos(c)).toEqual(expect.arrayContaining(["so", "arquitectura", "acelerador", "runtime"]));
    });

    it("en la CPU de la Mac no hay Metal 4 (lo da la GPU)", () => {
        const c = verificar(turbo, macCpu, macInterno);
        expect(bloqueos(c)).toContain("acelerador");
    });

    it("con macOS 15 pide actualizar el sistema; Metal sin Metal 4 dice cómo conseguirlo", () => {
        const viejo = { ...macGpu, so: "macOS 15.6", aceleradores: ["metal" as const] };
        const c = verificar(turbo, viejo, ssdUsbC(MAC, "local"));
        expect(c.nivel).toBe("incompatible");
        const so = c.motivos.find((x) => x.clave === "so")!;
        expect(so.texto).toContain("macOS 26 o superior");
        expect(so.arreglo).toContain("Actualiza macOS");
        expect(c.motivos.find((x) => x.clave === "acelerador")?.arreglo).toContain("macOS 26");
    });

    it("con Xcode 26 instalado no pide Swift 6.2", () => {
        const conXcode = { ...macGpu, herramientas: ["swift-6.0.2", "xcode-26"] };
        expect(claves(verificar(turbo, conXcode, ssdUsbC(MAC, "local")))).not.toContain("herramientas");
    });

    it("un SSD que lee menos de lo pedido no vale; uno sin medir se avisa", () => {
        const lento = { ...ssdUsbC(MAC, "local"), lecturaMBs: 400 };
        expect(bloqueos(verificar(turbo, macGpu, lento))).toContain("lectura");
        const sinMedir = { ...ssdUsbC(MAC, "local"), lecturaMBs: undefined };
        const c = verificar(turbo, macGpu, sinMedir);
        expect(bloqueos(c)).toEqual([]);
        expect(c.motivos.find((x) => x.clave === "lectura")?.bloquea).toBe(false);
        const hdd = { ...ssdUsbC(MAC, "local"), lecturaMBs: undefined, tipoDisco: "hdd" as const };
        expect(bloqueos(verificar(turbo, macGpu, hdd))).toContain("lectura");
    });
});

/* ───────── tamaños: preguntar antes de asumir ───────── */

describe("tamaño desconocido", () => {
    it("un modelo sin tamaño queda en «preguntar» y no se asume nada", () => {
        const c = verificar(ollama78, macGpu, macInterno);
        expect(c.nivel).toBe("preguntar");
        expect(claves(c)).toContain("disco-desconocido");
        expect(c.cargaSegundos).toBeUndefined();
    });

    it("con el tamaño confirmado deja de preguntar y comprueba el disco de verdad", () => {
        const c = verificar(ollama78, macGpu, macInterno, { tamanoConfirmadoGb: 4.7 });
        expect(c.nivel).not.toBe("preguntar");
        expect(claves(c)).not.toContain("disco-desconocido");
        const grande = verificar(ollama78, macGpu, macInterno, { tamanoConfirmadoGb: 8 });
        expect(grande.nivel).toBe("no-cabe");
    });

    it("si no se sabe cuánto queda libre, avisa sin bloquear", () => {
        const c = verificar(bitnet, macCpu, { ...macInterno, libreGb: undefined });
        expect(bloqueos(c)).toEqual([]);
        expect(c.motivos.find((x) => x.clave === "disco-libre")?.bloquea).toBe(false);
    });

    it("cabeEn deja margen", () => {
        expect(cabeEn(macInterno, 7)).toBe(true);
        expect(cabeEn(macInterno, 7.5)).toBe(false);
        expect(cabeEn({ ...macInterno, libreGb: undefined }, 1)).toBe(false);
    });
});

/* ───────── vías, privacidad y disponibilidad ───────── */

describe("vías", () => {
    const discoPorAntena: MedioAlmacen = {
        ...a1Disco,
        id: "lora:disco",
        neuronaId: "nodo-lora",
        etiqueta: "Disco del nodo LoRa",
        via: "antena",
    };

    it("por antena nunca viajan pesos", () => {
        const c = verificar(bitnet, macCpu, discoPorAntena);
        expect(c.nivel).toBe("incompatible");
        expect(bloqueos(c)).toContain("antena");
        expect(c.motivos.find((x) => x.clave === "antena")?.texto).toContain("días");
    });

    it("un procesador al que se llega por antena usa SU disco: no bloquea, pero avisa", () => {
        const loraCpu: Procesador = { ...a1Cpu, id: "lora:cpu", neuronaId: "nodo-lora", via: "antena" };
        const c = verificar(bitnet, loraCpu, discoPorAntena);
        expect(bloqueos(c)).toEqual([]);
        expect(claves(c)).toContain("via");
    });

    it("cargar desde la Biblioteca por la red de StarSeed tarda lo que da la vía", () => {
        const c = verificar(bitnet, macCpu, biblioteca);
        expect(c.cargaSegundos).toBe(Math.round((1.1 * 1024) / 8));
        expect(verificar(bitnet, macCpu, macInterno).cargaSegundos).toBeLessThan(2);
        // La vía que dice el contexto manda.
        expect(verificar(bitnet, macCpu, biblioteca, { viaAlmacen: "malla-local" }).cargaSegundos).toBe(Math.round((1.1 * 1024) / 40));
    });

    it("el A1 lee su propio disco en local aunque desde aquí se llegue por la red", () => {
        const c = verificar(bitnet, a1Cpu, a1Disco);
        expect(c.cargaSegundos).toBeLessThan(5);
        expect(bloqueos(c)).toEqual([]);
    });
});

describe("privacidad", () => {
    const publica: MedioAlmacen = { ...biblioteca, id: "biblioteca-publica", etiqueta: "Biblioteca pública", privado: false };
    const servidorPublico: Procesador = { ...a1Cpu, id: "servidor:publico", neuronaId: "servidor:publico", tipo: "servidor", nombre: "Servidor público", via: "internet" };

    it("lo privado no va a un almacén público", () => {
        expect(bloqueos(verificar(bitnet, macCpu, publica, { privado: true }))).toContain("privacidad");
        expect(bloqueos(verificar(bitnet, macCpu, publica))).toEqual([]);
    });

    it("lo privado no se procesa en un servidor ajeno; en uno propio sí", () => {
        const almacenServidor: MedioAlmacen = { ...a1Disco, id: "servidor:disco", neuronaId: "servidor:publico" };
        expect(verificar(bitnet, servidorPublico, almacenServidor, { privado: true }).nivel).toBe("incompatible");
        expect(bloqueos(verificar(bitnet, servidorPublico, almacenServidor, { privado: true, propio: true }))).not.toContain("privacidad");
    });
});

describe("disponibilidad", () => {
    it("un procesador apagado no bloquea, pero baja el nivel y lo dice", () => {
        const encendido = verificar(bitnet, a1Cpu, a1Disco);
        const apagado = verificar(bitnet, { ...a1Cpu, disponible: false }, a1Disco);
        expect(bloqueos(apagado)).toEqual([]);
        expect(claves(apagado)).toContain("procesador-no-disponible");
        expect(apagado.puntuacion).toBeLessThan(encendido.puntuacion);
        const almacenFuera = verificar(bitnet, a1Cpu, { ...a1Disco, disponible: false });
        expect(claves(almacenFuera)).toContain("almacen-no-disponible");
    });
});

/* ───────── memoria, medio y motor ───────── */

describe("memoria", () => {
    it("RAM total por debajo del mínimo → no cabe, con arreglo", () => {
        const grande = modelo({ id: "grande", nombre: "Grande", ramMinGb: 16, disco: { gb: 4, verificado: true } });
        const c = verificar(grande, macGpu, macInterno);
        expect(c.nivel).toBe("no-cabe");
        expect(c.motivos.find((x) => x.clave === "ram")?.arreglo).toBeTruthy();
    });

    it("7,8 GB detectados valen para un mínimo de 8", () => {
        expect(bloqueos(verificar(ollama78, { ...macGpu, ramGb: 7.8 }, macInterno, { tamanoConfirmadoGb: 4.7 }))).toEqual([]);
    });

    it("RAM libre escasa avisa sin bloquear", () => {
        const c = verificar(bitnet, { ...macCpu, ramLibreGb: 0.4 }, macInterno);
        expect(bloqueos(c)).toEqual([]);
        expect(claves(c)).toContain("ram-libre");
    });

    it("VRAM: cuenta en una GPU dedicada, no en memoria unificada; una CPU sin GPU no cabe", () => {
        const imagen = modelo({ id: "flux", nombre: "FLUX", capacidades: ["imagen"], ramMinGb: 8, vramMinGb: 10, disco: { gb: 12, verificado: true } });
        expect(bloqueos(verificar(imagen, nvGpu, nvDisco))).toEqual([]);
        expect(bloqueos(verificar(imagen, { ...nvGpu, vramGb: 8 }, nvDisco))).toContain("vram");
        expect(bloqueos(verificar(imagen, a1Cpu, a1Disco))).toContain("vram");
        expect(claves(verificar(imagen, macGpu, ssdUsbC(MAC, "local")))).not.toContain("vram");
    });
});

describe("medio y motor", () => {
    it("un WebGPU de navegador solo corre modelos web/pwa", () => {
        expect(bloqueos(verificar(modeloWeb, movilWebgpu, movilNavegador))).toEqual([]);
        expect(bloqueos(verificar(bitnet, movilWebgpu, movilNavegador))).toEqual(expect.arrayContaining(["medio", "runtime"]));
        expect(bloqueos(verificar(modeloWeb, macCpu, macInterno))).toContain("medio");
    });

    it("lo guardado en el navegador no lo lee un motor nativo", () => {
        expect(bloqueos(verificar(bitnet, macCpu, macNavegador))).toContain("almacen-navegador");
    });

    it("un motor que no está pero se puede instalar no bloquea", () => {
        const c = verificar(ollama78, macCpu, macInterno, { tamanoConfirmadoGb: 4.7 });
        expect(c.motivos.find((x) => x.clave === "runtime")?.bloquea).toBe(false);
    });
});

/* ───────── puntuación y velocidad ───────── */

describe("puntuación", () => {
    it("a igual hardware, el 1.58-bit puntúa claramente más que su gemelo de 4 bits", () => {
        const a = verificar(bitnet, a1Cpu, a1Disco);
        const b = verificar(bitnet4, a1Cpu, a1Disco);
        expect(a.nivel).toBe(b.nivel);
        expect(a.puntuacion - b.puntuacion).toBeGreaterThanOrEqual(10);
    });

    it("local puntúa más que por malla y por red", () => {
        const local = verificar(bitnet, { ...nvGpu, via: "local" }, nvDisco).puntuacion;
        const malla = verificar(bitnet, nvGpu, nvDisco).puntuacion;
        const red = verificar(bitnet, { ...nvGpu, via: "red-starseed" }, nvDisco).puntuacion;
        expect(local).toBeGreaterThan(malla);
        expect(malla).toBeGreaterThan(red);
    });

    it("la puntuación va de 0 a 100", () => {
        for (const c of [verificar(bitnet, nvGpu, nvDisco), verificar(turbo, nvGpu, nvDisco), verificar(turbo, macGpu, macInterno)]) {
            expect(c.puntuacion).toBeGreaterThanOrEqual(0);
            expect(c.puntuacion).toBeLessThanOrEqual(100);
        }
    });
});

describe("estimarTokS", () => {
    it("escala la medida del autor (M2 Air 8 GB) al M1 por ancho de banda de memoria", () => {
        expect(estimarTokS(turbo, macGpu)).toBeCloseTo((5.1 * 68) / 100, 1);
        const m2: Procesador = { ...macGpu, nombre: "Apple M2 GPU" };
        expect(estimarTokS(turbo, m2)).toBe(5.1);
    });

    it("sin referencia parecida estima por ancho de banda y bytes activos", () => {
        const t = estimarTokS(bitnet, macCpu)!;
        expect(t).toBeGreaterThan(10);
        expect(t).toBeLessThan(40);
        expect(estimarTokS(bitnet, a1Cpu)!).toBeLessThan(t); // 2 OCPU leen menos que el M1
    });

    it("no aplica a modelos que no son de texto", () => {
        const imagen = modelo({ id: "img", nombre: "Imagen", capacidades: ["imagen"] });
        expect(estimarTokS(imagen, nvGpu)).toBeUndefined();
    });
});

describe("lectura de nombres", () => {
    it("chips y sistemas", () => {
        expect(chipDeTexto("MacBook Air M2 · 8 GB")?.chip).toBe("Apple M2");
        expect(chipDeTexto("Apple M1 GPU (8 núcleos)")?.gbps).toBe(68);
        expect(chipDeTexto("NVIDIA GeForce RTX 3060 Ti")?.chip).toBe("RTX 3060 Ti");
        expect(familiaSo("macOS 26.3.1")).toBe("macos");
        expect(familiaSo("Linux (Ubuntu 24.04)")).toBe("linux");
        expect(familiaSo("Android 15")).toBe("android");
    });
});
