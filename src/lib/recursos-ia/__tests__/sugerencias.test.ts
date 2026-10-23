/**
 * `topologiaSugerida`, `candidatos` y `sugerirPlan` con el inventario REAL de la cuenta
 * (2026-10-23): Mac de Alex (M1 · 8 GB · 9,2 GB libres), Oracle A1, móvil con WebGPU y una
 * neurona Linux con NVIDIA. Modelos propios de la prueba (no el catálogo real).
 */
import { describe, expect, it } from "vitest";
import { candidatos, sugerirPlan, topologiaSugerida } from "../sugerencias";
import type { Alcance, InventarioRecursos, MedioAlmacen, NeuronaRecursos, Procesador, RequisitosModelo, Via } from "../tipos";

/* ───────── equipos ───────── */

const MAC = "mac-alex";

function procesador(p: Partial<Procesador> & Pick<Procesador, "id" | "neuronaId" | "tipo" | "nombre">): Procesador {
    return { aceleradores: [], runtimes: [], via: "local", disponible: true, fuente: "detectado", ...p };
}

function almacen(a: Partial<MedioAlmacen> & Pick<MedioAlmacen, "id" | "tipo" | "etiqueta">): MedioAlmacen {
    return { via: "local", persistente: true, privado: true, disponible: true, fuente: "detectado", ...a };
}

function neuronaMac(extra: MedioAlmacen[] = [], via: Via = "local"): NeuronaRecursos {
    const base = { neuronaId: MAC, so: "macOS 26.3.1", arquitectura: "arm64" as const, nucleos: 8, ramGb: 8, memoriaUnificada: true, herramientas: ["swift-6.0.2"], via };
    return {
        id: MAC,
        nombre: "Mac de Alex",
        online: true,
        esEsta: via === "local",
        vias: [via],
        procesadores: [
            procesador({ ...base, id: `${MAC}:cpu`, tipo: "cpu", nombre: "Apple M1", aceleradores: ["neon"], runtimes: ["bitnet-cpp", "llama-cpp"] }),
            procesador({ ...base, id: `${MAC}:gpu`, tipo: "gpu", nombre: "Apple M1 GPU (8 núcleos)", aceleradores: ["metal", "metal4"], runtimes: ["llama-cpp", "mlx", "swift-metal"] }),
        ],
        almacenes: [
            almacen({ id: `${MAC}:interno`, tipo: "neurona-local", etiqueta: "Disco interno de la Mac", neuronaId: MAC, totalGb: 228, libreGb: 9.2, tipoDisco: "nvme", conexion: "interna", via }),
            almacen({ id: `navegador:${MAC}`, tipo: "navegador", etiqueta: "Navegador de la Mac", neuronaId: MAC, libreGb: 6, via, fuente: "estimado" }),
            ...extra,
        ],
    };
}

function ssdUsbC(neuronaId: string, via: Via): MedioAlmacen {
    return almacen({
        id: `${neuronaId}:ext:SSD`,
        tipo: "disco-externo",
        etiqueta: "SSD externo USB-C",
        neuronaId,
        totalGb: 500,
        libreGb: 480,
        lecturaMBs: 1050,
        tipoDisco: "ssd",
        conexion: "usb",
        via,
    });
}

function neuronaA1(via: Via = "red-starseed"): NeuronaRecursos {
    return {
        id: "a1",
        nombre: "Oracle A1",
        tipo: "servidor",
        online: true,
        esEsta: via === "local",
        vias: [via],
        procesadores: [
            procesador({ id: "a1:cpu", neuronaId: "a1", tipo: "cpu", nombre: "Ampere Altra (Oracle A1)", so: "Linux", arquitectura: "arm64", nucleos: 2, ramGb: 12, aceleradores: ["neon"], runtimes: ["bitnet-cpp", "llama-cpp", "ollama"], via }),
        ],
        almacenes: [almacen({ id: "a1:interno", tipo: "neurona-local", etiqueta: "Disco del A1", neuronaId: "a1", totalGb: 47, libreGb: 45, tipoDisco: "ssd", conexion: "interna", via })],
    };
}

function neuronaMovil(): NeuronaRecursos {
    return {
        id: "movil",
        nombre: "Móvil Android",
        online: true,
        esEsta: false,
        vias: ["malla-local"],
        procesadores: [
            procesador({ id: "movil:webgpu", neuronaId: "movil", tipo: "webgpu", nombre: "Chrome con WebGPU (Android)", so: "Android 15", arquitectura: "arm64", ramGb: 6, aceleradores: ["webgpu", "wasm-simd"], runtimes: ["webgpu-onnx", "needle-wasm"], via: "malla-local" }),
        ],
        almacenes: [almacen({ id: "navegador:movil", tipo: "navegador", etiqueta: "Navegador del móvil", neuronaId: "movil", libreGb: 4, via: "malla-local", fuente: "estimado" })],
    };
}

function neuronaNvidia(libreGb = 200, via: Via = "malla-local"): NeuronaRecursos {
    const base = { neuronaId: "nv", so: "Linux (Ubuntu 24.04)", arquitectura: "x86_64" as const, ramGb: 32, via };
    return {
        id: "nv",
        nombre: "Torre NVIDIA",
        online: true,
        esEsta: via === "local",
        vias: [via],
        procesadores: [
            procesador({ ...base, id: "nv:cpu", tipo: "cpu", nombre: "AMD Ryzen 7 5800X", nucleos: 16, aceleradores: ["avx2"], runtimes: ["llama-cpp", "bitnet-cpp", "ollama"] }),
            procesador({ ...base, id: "nv:gpu", tipo: "gpu", nombre: "NVIDIA GeForce RTX 3060", vramGb: 12, aceleradores: ["cuda", "vulkan"], runtimes: ["llama-cpp", "ollama", "onnx"] }),
        ],
        almacenes: [almacen({ id: "nv:interno", tipo: "neurona-local", etiqueta: "Disco de la torre", neuronaId: "nv", totalGb: 1000, libreGb, tipoDisco: "nvme", conexion: "interna", via })],
    };
}

const biblioteca = almacen({ id: "biblioteca", tipo: "biblioteca", etiqueta: "Biblioteca de la cuenta", libreGb: 50, via: "red-starseed", fuente: "declarado" });

function inventario(neuronas: NeuronaRecursos[], extra: Partial<InventarioRecursos> = {}): InventarioRecursos {
    const esta = neuronas.find((n) => n.esEsta) ?? neuronas[0];
    return {
        generado: "2026-10-23T12:00:00.000Z",
        estaNeuronaId: esta.id,
        neuronas,
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
        ...extra,
    };
}

const PRIVADO: Alcance = { tipo: "perfil", id: "alex", visibilidad: "privada" };
const PUBLICO: Alcance = { tipo: "perfil", id: "alex", visibilidad: "publica" };

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
    capacidades: ["texto", "decision"],
    bits: 1.58,
    runtime: "bitnet-cpp",
    parametrosB: 2.4,
    disco: { gb: 1.1, verificado: true },
    ramMinGb: 2,
});

const bonsai8b = modelo({
    id: "ternary-bonsai-8b",
    nombre: "Bonsai ternario 8B",
    capacidades: ["texto", "razon"],
    bits: 1.58,
    parametrosB: 8,
    disco: { gb: 2.19, verificado: true },
    ramMinGb: 6,
});

const ollama78 = modelo({
    id: "ollama-7-8b",
    nombre: "Ollama 7-8B",
    capacidades: ["texto", "razon"],
    runtime: "ollama",
    parametrosB: 8,
    disco: { gb: null, verificado: false },
    ramMinGb: 8,
});

const qwen4b = modelo({ id: "qwen3-4b-q4", nombre: "Qwen3 4B Q4", parametrosB: 4, disco: { gb: 2.5, verificado: true }, ramMinGb: 4 });

const turbo = modelo({
    id: "turbo-fieldfare",
    nombre: "TurboFieldfare",
    capacidades: ["texto", "razon"],
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
    tokSRef: [{ equipo: "MacBook Air M2 · 8 GB", tokS: 5.1 }],
    estado: "experimental",
});

const CATALOGO = [turbo, ollama78, bonsai8b, bitnet];

/* ───────── topología ───────── */

describe("topologiaSugerida", () => {
    it("una sola neurona → cada neurona con lo suyo, sin antena ni internet", () => {
        const t = topologiaSugerida(inventario([neuronaMac()]), PRIVADO);
        expect(t.topologia).toBe("cada-neurona");
        expect(t.vias).toEqual(["local", "malla-local", "red-starseed"]);
    });

    it("el A1 (12 GB) es mucho más capaz que la Mac (8 GB) → servidor propio en el A1", () => {
        const t = topologiaSugerida(inventario([neuronaMac(), neuronaA1()]), PRIVADO);
        expect(t.topologia).toBe("servidor-propio");
        expect(t.servidorNeuronaId).toBe("a1");
        expect(t.vias).toContain("red-starseed");
        expect(t.vias).not.toContain("antena");
    });

    it("la neurona NVIDIA → servidor propio en ella", () => {
        const t = topologiaSugerida(inventario([neuronaMac(), neuronaMovil(), neuronaNvidia()]), PRIVADO);
        expect(t.topologia).toBe("servidor-propio");
        expect(t.servidorNeuronaId).toBe("nv");
    });

    it("disco interno casi lleno y un SSD externo grande y rápido → almacén externo", () => {
        const t = topologiaSugerida(inventario([neuronaMac([ssdUsbC(MAC, "local")])]), PRIVADO);
        expect(t.topologia).toBe("almacen-externo");
        expect(t.almacenExternoId).toBe(`${MAC}:ext:SSD`);
    });

    it("un externo lento (disco duro) no se sugiere", () => {
        const hdd = { ...ssdUsbC(MAC, "local"), tipoDisco: "hdd" as const, lecturaMBs: 120 };
        expect(topologiaSugerida(inventario([neuronaMac([hdd])]), PRIVADO).topologia).toBe("cada-neurona");
    });

    it("la que mejor calcula anda corta de disco y otra lo tiene → fragmentada", () => {
        const t = topologiaSugerida(inventario([neuronaMac(), neuronaA1(), neuronaNvidia(15)]), PRIVADO);
        expect(t.topologia).toBe("fragmentada");
    });

    it("grupo con servidores comunales → comunal (con internet si solo se llega así)", () => {
        const comunal = procesador({ id: "servidor:sangha", neuronaId: "servidor:sangha", tipo: "servidor", nombre: "Servidor de la Sangha", ramGb: 64, via: "internet" });
        const inv = inventario([neuronaMac()], { procesadoresSueltos: [comunal] });
        const t = topologiaSugerida(inv, { tipo: "grupo", id: "sangha", visibilidad: "publica" });
        expect(t.topologia).toBe("comunal");
        expect(t.vias).toContain("internet");
        expect(topologiaSugerida(inv, PRIVADO).topologia).toBe("cada-neurona");
    });

    it("una neurona apagada no cuenta", () => {
        const a1 = { ...neuronaA1(), online: false };
        expect(topologiaSugerida(inventario([neuronaMac(), a1]), PRIVADO).topologia).toBe("cada-neurona");
    });
});

/* ───────── candidatos ───────── */

describe("candidatos", () => {
    const inv = inventario([neuronaMac([ssdUsbC(MAC, "local")]), neuronaA1(), neuronaNvidia()], { almacenesSueltos: [biblioteca] });

    it("cada-neurona: lo de esta neurona y los almacenes de la cuenta", () => {
        const c = candidatos(inv, { topologia: "cada-neurona", vias: ["local", "malla-local", "red-starseed"], alcance: PRIVADO });
        expect(c.procesadores.map((p) => p.id)).toEqual([`${MAC}:cpu`, `${MAC}:gpu`]);
        expect(c.almacenes.map((a) => a.id)).toContain("biblioteca");
        expect(c.almacenes.map((a) => a.id)).not.toContain("a1:interno");
    });

    it("servidor-propio: los procesadores del servidor y su disco", () => {
        const c = candidatos(inv, { topologia: "servidor-propio", servidorNeuronaId: "a1", vias: ["local", "malla-local", "red-starseed"], alcance: PRIVADO });
        expect(c.procesadores.map((p) => p.id)).toEqual(["a1:cpu"]);
        expect(c.almacenes.map((a) => a.id)).toEqual(["a1:interno", "biblioteca"]);
    });

    it("servidor-propio respeta las vías: sin red de StarSeed no se llega al A1", () => {
        const c = candidatos(inv, { topologia: "servidor-propio", servidorNeuronaId: "a1", vias: ["local", "malla-local"], alcance: PRIVADO });
        expect(c.procesadores).toEqual([]);
    });

    it("almacen-externo: ese almacén y los procesadores de la neurona donde está conectado", () => {
        const c = candidatos(inv, { topologia: "almacen-externo", almacenExternoId: `${MAC}:ext:SSD`, vias: ["local"], alcance: PRIVADO });
        expect(c.almacenes.map((a) => a.id)).toEqual([`${MAC}:ext:SSD`]);
        expect(c.procesadores.every((p) => p.neuronaId === MAC)).toBe(true);
    });

    it("fragmentada: todo lo de la cuenta por las vías permitidas", () => {
        const c = candidatos(inv, { topologia: "fragmentada", vias: ["local", "malla-local", "red-starseed"], alcance: PRIVADO });
        expect(c.procesadores.map((p) => p.neuronaId)).toEqual(expect.arrayContaining([MAC, "a1", "nv"]));
    });

    it("un almacén por antena solo entra si está junto a un procesador", () => {
        const lora: NeuronaRecursos = { ...neuronaA1("antena"), id: "lora", procesadores: [], almacenes: [almacen({ id: "lora:disco", tipo: "neurona-local", etiqueta: "Disco LoRa", neuronaId: "lora", libreGb: 100, via: "antena" })] };
        const c = candidatos(inventario([neuronaMac(), lora]), { topologia: "fragmentada", vias: ["local", "antena"], alcance: PRIVADO });
        expect(c.almacenes.map((a) => a.id)).not.toContain("lora:disco");
    });

    it("lo de una neurona apagada se marca no disponible", () => {
        const apagada = inventario([neuronaMac(), { ...neuronaA1(), online: false }]);
        const c = candidatos(apagada, { topologia: "servidor-propio", servidorNeuronaId: "a1", vias: ["local", "red-starseed"], alcance: PRIVADO });
        expect(c.procesadores[0].disponible).toBe(false);
    });
});

/* ───────── plan ───────── */

describe("sugerirPlan", () => {
    it("la Mac de hoy: 1.58-bit para todo, TurboFieldfare no se sugiere (no cabe)", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), CATALOGO, { capacidades: ["texto", "razon", "decision"], alcance: PRIVADO });
        expect(plan.topologia.topologia).toBe("cada-neurona");
        expect(plan.sinOpcion).toEqual([]);
        expect(plan.sugerencias.map((s) => s.modelo.bits)).toEqual([1.58, 1.58, 1.58]);
        expect(plan.sugerencias.find((s) => s.capacidad === "decision")?.modelo.id).toBe("bitnet-b158-2b");
        for (const s of plan.sugerencias) {
            expect(s.modelo.id).not.toBe("turbo-fieldfare");
            expect(s.alternativas.map((a) => a.modeloId)).not.toContain("turbo-fieldfare");
            expect(s.porQue).toContain("1.58-bit: el doble de rápido y la mitad de memoria");
            expect(s.almacen.privado).toBe(true);
        }
        expect(plan.resumen).toMatch(/^Cada neurona con lo suyo: 3 de 3 capacidades con modelo \(3 en 1\.58-bit\)/);
    });

    it("solo TurboFieldfare en la Mac de hoy → sin opción, con el arreglo del disco", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), [turbo], { capacidades: ["razon"], alcance: PRIVADO });
        expect(plan.sugerencias).toEqual([]);
        expect(plan.sinOpcion[0].capacidad).toBe("razon");
        expect(plan.sinOpcion[0].motivo).toContain("disco externo");
        expect(plan.sinOpcion[0].motivo).toContain("9,2 GB libres");
        expect(plan.resumen).toContain("1 sin opción");
    });

    it("con el SSD USB-C en la Mac, TurboFieldfare se sugiere en su GPU y en ese disco", () => {
        const inv = inventario([neuronaMac([ssdUsbC(MAC, "local")])]);
        const plan = sugerirPlan(inv, [turbo], { capacidades: ["razon"], alcance: PRIVADO });
        expect(plan.topologia.topologia).toBe("almacen-externo");
        const s = plan.sugerencias[0];
        expect(s.procesador.id).toBe(`${MAC}:gpu`);
        expect(s.almacen.id).toBe(`${MAC}:ext:SSD`);
        expect(s.compat.motivos.some((m) => m.clave === "herramientas")).toBe(true);
        expect(plan.preguntas.map((q) => q.tipo)).toEqual(["confirmar-descarga"]);
        expect(plan.preguntas[0].texto).toContain("15 GB");
        expect(plan.preguntas[0].texto).toContain("SSD externo USB-C");
    });

    it("tamaño desconocido → «preguntar» y UNA pregunta aunque sirva para dos capacidades", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), [ollama78], { capacidades: ["texto", "razon"], alcance: PRIVADO });
        expect(plan.sugerencias.map((s) => s.compat.nivel)).toEqual(["preguntar", "preguntar"]);
        const tamano = plan.preguntas.filter((q) => q.tipo === "tamano-modelo");
        expect(tamano).toHaveLength(1);
        expect(tamano[0].modeloId).toBe("ollama-7-8b");
        expect(tamano[0].opciones?.length).toBe(2);
        expect(plan.preguntas.some((q) => q.tipo === "confirmar-descarga")).toBe(false); // sin tamaño no se ofrece descargar
    });

    it("con el tamaño confirmado deja de preguntarlo y pide confirmar la descarga", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), [ollama78], {
            capacidades: ["texto"],
            alcance: PRIVADO,
            tamanosConfirmados: { "ollama-7-8b": 4.7 },
        });
        expect(plan.sugerencias[0].compat.nivel).not.toBe("preguntar");
        expect(plan.preguntas.map((q) => q.tipo)).toEqual(["confirmar-descarga"]);
        expect(plan.preguntas[0].texto).toContain("4,7 GB");
    });

    it("a igual nivel gana el 1.58-bit; sin preferirlo, el más fuerte", () => {
        const inv = inventario([neuronaNvidia(200, "local")]);
        const con = sugerirPlan(inv, [qwen4b, bitnet], { capacidades: ["texto"], alcance: PRIVADO });
        const s = con.sugerencias[0];
        expect(s.modelo.id).toBe("bitnet-b158-2b");
        const rival = s.alternativas.find((a) => a.modeloId === "qwen3-4b-q4")!;
        expect(rival.compat.nivel).toBe(s.compat.nivel);
        expect(s.porQue.join(" · ")).toContain("gana por ser 1.58-bit");
        const sin = sugerirPlan(inv, [qwen4b, bitnet], { capacidades: ["texto"], alcance: PRIVADO, preferir158: false });
        expect(sin.sugerencias[0].modelo.id).toBe("qwen3-4b-q4");
    });

    it("antena nunca lleva pesos: si el único disco está por antena, no hay opción", () => {
        const sinDisco = { ...neuronaMac(), almacenes: [] };
        const lora: NeuronaRecursos = { id: "lora", nombre: "Nodo LoRa", online: true, esEsta: false, vias: ["antena"], procesadores: [], almacenes: [almacen({ id: "lora:disco", tipo: "neurona-local", etiqueta: "Disco LoRa", neuronaId: "lora", libreGb: 100, via: "antena" })] };
        const plan = sugerirPlan(inventario([sinDisco, lora]), [bitnet], {
            capacidades: ["texto"],
            alcance: PRIVADO,
            topologia: { topologia: "fragmentada", vias: ["local", "antena"], alcance: PRIVADO },
        });
        expect(plan.sugerencias).toEqual([]);
        expect(plan.sinOpcion).toHaveLength(1);
    });

    it("lo privado no usa un almacén público aunque sea el único con sitio", () => {
        const llena = neuronaMac();
        llena.almacenes = llena.almacenes.map((a) => (a.tipo === "neurona-local" ? { ...a, libreGb: 0.5 } : a));
        const publica = almacen({ id: "biblioteca-publica", tipo: "biblioteca", etiqueta: "Biblioteca pública", libreGb: 100, via: "red-starseed", privado: false });
        const inv = inventario([llena], { almacenesSueltos: [publica] });
        const privado = sugerirPlan(inv, [bitnet], { capacidades: ["texto"], alcance: PRIVADO });
        expect(privado.sugerencias).toEqual([]);
        expect(privado.sinOpcion).toHaveLength(1);
        const publico = sugerirPlan(inv, [bitnet], { capacidades: ["texto"], alcance: PUBLICO });
        expect(publico.sugerencias[0].almacen.id).toBe("biblioteca-publica");
    });

    it("cada-neurona no carga un modelo pesado desde la Biblioteca", () => {
        const llena = neuronaMac();
        llena.almacenes = llena.almacenes.map((a) => (a.tipo === "neurona-local" ? { ...a, libreGb: 0.5 } : a));
        const pesado = modelo({ id: "pesado", nombre: "Pesado", disco: { gb: 6, verificado: true }, ramMinGb: 4 });
        const plan = sugerirPlan(inventario([llena], { almacenesSueltos: [biblioteca] }), [pesado], { capacidades: ["texto"], alcance: PRIVADO });
        expect(plan.sugerencias).toEqual([]);
    });

    it("lo que ya está instalado (BitNet en :8790) no pide descarga", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), [bitnet], {
            capacidades: ["decision"],
            alcance: PRIVADO,
            instalados: [{ modeloId: "bitnet-b158-2b" }],
        });
        expect(plan.preguntas).toEqual([]);
        expect(plan.sugerencias[0].porQue).toContain("ya está instalado: no hay que descargar nada");
        expect(plan.resumen).toBe("Cada neurona con lo suyo: 1 de 1 capacidad con modelo (1 en 1.58-bit).");
    });

    it("para razonar, a igual nivel y bits, gana el más potente que cabe (aunque el pequeño ya esté)", () => {
        const bonsai17 = modelo({ ...bonsai8b, id: "ternary-bonsai-1.7b", nombre: "Bonsai ternario 1.7B", parametrosB: 1.7, disco: { gb: 0.47, verificado: true }, ramMinGb: 2 });
        const bitnetRazon = modelo({ ...bitnet, capacidades: ["texto", "razon"] });
        const plan = sugerirPlan(inventario([neuronaMac()]), [bonsai17, bitnetRazon, bonsai8b], {
            capacidades: ["razon", "texto"],
            alcance: PRIVADO,
            instalados: [{ modeloId: "bitnet-b158-2b" }],
        });
        const [razon, texto] = plan.sugerencias;
        expect(razon.modelo.id).toBe("ternary-bonsai-8b");
        expect(razon.alternativas[0].compat.nivel).toBe(razon.compat.nivel);
        expect(razon.porQue.join(" · ")).toContain("para razonar, el más potente que cabe con holgura");
        // Para conversar manda la puntuación (velocidad, holgura y lo ya instalado), no el tamaño.
        expect(texto.modelo.id).toBe("bitnet-b158-2b");
    });

    it("a igual nivel, lo que ya está instalado gana (no hay que esperar descargas)", () => {
        const gemelo = modelo({ ...bitnet, id: "bitnet-gemelo", nombre: "BitNet gemelo" });
        const inv = inventario([neuronaMac()]);
        const sin = sugerirPlan(inv, [gemelo, bitnet], { capacidades: ["decision"], alcance: PRIVADO });
        expect(sin.sugerencias[0].modelo.id).toBe("bitnet-b158-2b"); // empate: decide el id
        const con = sugerirPlan(inv, [gemelo, bitnet], { capacidades: ["decision"], alcance: PRIVADO, instalados: [{ modeloId: "bitnet-gemelo" }] });
        expect(con.sugerencias[0].modelo.id).toBe("bitnet-gemelo");
    });

    it("servidor propio en el A1: procesa allí, por la red de StarSeed, y lo dice", () => {
        const plan = sugerirPlan(inventario([neuronaMac(), neuronaA1()]), [bonsai8b, bitnet], { capacidades: ["razon"], alcance: PRIVADO });
        expect(plan.topologia.servidorNeuronaId).toBe("a1");
        const s = plan.sugerencias[0];
        expect(s.procesador.id).toBe("a1:cpu");
        expect(s.almacen.id).toBe("a1:interno");
        expect(s.via).toBe("red-starseed");
        expect(s.porQue.some((f) => f.includes("Oracle A1") && f.includes("red de starseed"))).toBe(true);
    });

    it("el ajuste fino por capacidad manda (procesaEn)", () => {
        const inv = inventario([neuronaMac(), neuronaA1(), neuronaNvidia()]);
        const plan = sugerirPlan(inv, [bitnet], {
            capacidades: ["texto"],
            alcance: PRIVADO,
            topologia: { topologia: "fragmentada", vias: ["local", "malla-local", "red-starseed"], alcance: PRIVADO, porCapacidad: { texto: { procesaEn: "a1:cpu" } } },
        });
        expect(plan.sugerencias[0].procesador.id).toBe("a1:cpu");
    });

    it("sin modelos de una capacidad lo dice", () => {
        const plan = sugerirPlan(inventario([neuronaMac()]), [bitnet], { capacidades: ["video"], alcance: PRIVADO });
        expect(plan.sinOpcion[0].motivo).toContain("Vídeo");
    });

    it("hasta 3 alternativas, sin repetir la elegida", () => {
        const plan = sugerirPlan(inventario([neuronaNvidia(200, "local")]), [bitnet, qwen4b, bonsai8b, modelo({ id: "otro", nombre: "Otro" }), modelo({ id: "otro2", nombre: "Otro 2" })], { capacidades: ["texto"], alcance: PRIVADO });
        const s = plan.sugerencias[0];
        expect(s.alternativas.length).toBe(3);
        expect(s.alternativas.some((a) => a.modeloId === s.modelo.id && a.procesadorId === s.procesador.id && a.almacenId === s.almacen.id)).toBe(false);
    });

    it("determinista: el mismo inventario en otro orden da el mismo plan", () => {
        const neuronas = [neuronaMac([ssdUsbC(MAC, "local")]), neuronaA1(), neuronaMovil(), neuronaNvidia(15)];
        const opciones = { capacidades: ["texto", "razon", "decision"] as const, alcance: PRIVADO };
        const a = sugerirPlan(inventario(neuronas, { estaNeuronaId: MAC, almacenesSueltos: [biblioteca] }), CATALOGO, { ...opciones, capacidades: [...opciones.capacidades] });
        const alReves = neuronas.map((n) => ({ ...n, procesadores: [...n.procesadores].reverse(), almacenes: [...n.almacenes].reverse() })).reverse();
        const b = sugerirPlan(inventario(alReves, { estaNeuronaId: MAC, almacenesSueltos: [biblioteca] }), [...CATALOGO].reverse(), { ...opciones, capacidades: [...opciones.capacidades] });
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(a.topologia.topologia).toBe("fragmentada");
    });
});
