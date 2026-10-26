/**
 * `inventarioDesde` (PURO): la Mac M1 de Alex vista por su servidor local, con un SSD externo USB,
 * frente a la misma neurona vista solo desde el navegador; ids estables, deduplicado y avisos.
 */
import { describe, expect, it } from "vitest";

import type { Neuron } from "@/lib/neurons/neurons";
import {
    AVISO_DISCOS,
    AVISO_RAM_NAVEGADOR,
    almacenesDeCarpetas,
    almacenesDeMaquina,
    detectarInventario,
    inventarioDesde,
    lecturaEstimadaMBs,
    neuronaDesdeNavegador,
    neuronaDesdeRegistro,
    nombreGpuNavegador,
    recursosDeServidoresCerebro,
} from "../deteccion";
import { esDeteccionMaquina, type DeteccionMaquina } from "../deteccion-tipos";
import type { MedioAlmacen, NeuronaRecursos } from "../tipos";

const ID = "n-mac";

/** Lo que devuelve `/api/recursos-ia/detectar` en la Mac de Alex con un Samsung T7 enchufado. */
const MAC_ALEX: DeteccionMaquina = {
    t: "2026-10-23T10:00:00.000Z",
    host: "MacBook-Air-de-Alex",
    so: "macOS 26.3.1",
    arquitectura: "arm64",
    chip: "Apple M1",
    nucleos: 8,
    ramGb: 8,
    ramLibreGb: 0.98,
    gpus: [{ nombre: "Apple M1 · GPU de 8 núcleos", memoriaUnificada: true, api: ["metal4"] }],
    npu: { nombre: "Apple Neural Engine", tops: 11 },
    volumenes: [
        { montaje: "/", nombre: "Macintosh HD", totalGb: 228, libreGb: 9.2, externo: false, tipoDisco: "nvme", conexion: "interna", sistemaArchivos: "apfs" },
        { montaje: "/Volumes/SSD Externo", nombre: "SSD Externo", totalGb: 931.1, libreGb: 816.1, externo: true, tipoDisco: "ssd", conexion: "usb", sistemaArchivos: "exfat" },
    ],
    herramientas: ["apple-clang-16", "node-22", "python-3.14", "swift-6.0.2"],
    runtimes: ["bitnet-cpp", "ollama"],
    servidoresIA: [{ id: "bitnet", url: "http://127.0.0.1:8790", ok: true }],
    avisos: ["Sin Xcode: lo que se compila con Xcode (p. ej. TurboFieldfare) necesita instalarlo desde la App Store."],
    simdCpu: ["neon"],
};

/** La misma Mac vista solo por el navegador (Chrome en Vercel). */
const desdeNavegador = () =>
    neuronaDesdeNavegador({
        id: ID,
        nombre: "MacBook de Alex",
        caps: {
            platform: "macOS",
            browser: "Chrome 148",
            cores: 8,
            memoryGb: 8,
            webgpu: true,
            gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
            gpuVendor: "Google Inc. (Apple)",
            storageQuotaGb: 10,
            storageUsedGb: 1,
            ollama: true,
        },
    });

const ahora = new Date("2026-10-23T10:00:00Z");

describe("inventarioDesde · Mac de Alex con servidor local y SSD externo USB", () => {
    const inv = inventarioDesde({ estaNeurona: desdeNavegador(), maquina: MAC_ALEX, ahora });
    const esta = inv.neuronas[0];

    it("la máquina manda en el hierro: CPU, GPU y NPU detectadas; WebGPU se queda", () => {
        expect(inv.estaNeuronaId).toBe(ID);
        expect(inv.generado).toBe("2026-10-23T10:00:00.000Z");
        expect(esta.procesadores.map((p) => p.id).sort()).toEqual([`${ID}:cpu`, `${ID}:gpu`, `${ID}:npu`, `${ID}:webgpu`]);
        const cpu = esta.procesadores.find((p) => p.id === `${ID}:cpu`)!;
        expect(cpu).toMatchObject({
            tipo: "cpu",
            nombre: "Apple M1 · CPU",
            so: "macOS 26.3.1",
            arquitectura: "arm64",
            nucleos: 8,
            ramGb: 8,
            ramLibreGb: 0.98,
            memoriaUnificada: true,
            aceleradores: ["neon"],
            via: "local",
            disponible: true,
            fuente: "detectado",
        });
        // Solo lo INSTALADO: lo instalable lo decide `verificar()` con su motivo («hay que instalar…»).
        expect(cpu.runtimes).toEqual(["bitnet-cpp", "ollama"]);
        expect(cpu.herramientas).toContain("swift-6.0.2");
        const gpu = esta.procesadores.find((p) => p.id === `${ID}:gpu`)!;
        expect(gpu).toMatchObject({ tipo: "gpu", memoriaUnificada: true, ramGb: 8, vramGb: 5.3, aceleradores: ["metal", "metal4"], fuente: "detectado" });
        // BitNet (kernels ternarios) es de CPU: no se promete en la GPU.
        expect(gpu.runtimes).toEqual(["ollama"]);
        // TurboFieldfare instalado se ofrece en la GPU como el runtime Swift+Metal del catálogo.
        const conTf = inventarioDesde({ estaNeurona: desdeNavegador(), maquina: { ...MAC_ALEX, runtimes: ["turbo-fieldfare"] }, ahora });
        expect(conTf.neuronas[0].procesadores.find((p) => p.id === `${ID}:gpu`)?.runtimes).toEqual(["turbo-fieldfare", "swift-metal"]);
        expect(conTf.neuronas[0].procesadores.find((p) => p.id === `${ID}:cpu`)?.runtimes).toEqual([]);
        expect(esta.procesadores.find((p) => p.id === `${ID}:npu`)).toMatchObject({ tipo: "npu", aceleradores: ["ane", "coreml"], nombre: "Apple Neural Engine · 11 TOPS" });
        expect(esta.procesadores.find((p) => p.id === `${ID}:webgpu`)).toMatchObject({ fuente: "estimado", runtimes: ["webgpu-onnx", "webllm"] });
    });

    it("un almacén interno y uno externo con su libre real, tipo, conexión y lectura estimada", () => {
        const interno = esta.almacenes.find((a) => a.id === `${ID}:interno`);
        expect(interno).toEqual({
            id: `${ID}:interno`,
            tipo: "neurona-local",
            etiqueta: "Disco interno (Macintosh HD)",
            neuronaId: ID,
            ruta: "/",
            totalGb: 228,
            libreGb: 9.2,
            lecturaMBs: 2500,
            tipoDisco: "nvme",
            conexion: "interna",
            via: "local",
            persistente: true,
            privado: true,
            disponible: true,
            fuente: "detectado",
        });
        const externo = esta.almacenes.find((a) => a.id === `${ID}:ext:SSD Externo`);
        expect(externo).toMatchObject({
            tipo: "disco-externo",
            etiqueta: "SSD Externo · SSD USB",
            neuronaId: ID,
            ruta: "/Volumes/SSD Externo",
            libreGb: 816.1,
            totalGb: 931.1,
            tipoDisco: "ssd",
            conexion: "usb",
            lecturaMBs: 900,
            via: "local",
            privado: true,
            disponible: true,
            fuente: "detectado",
        });
        expect(esta.almacenes.find((a) => a.id === `navegador:${ID}`)?.tipo).toBe("navegador");
    });

    it("avisos honestos: los de la máquina, y ninguno de «el navegador no ve los discos»", () => {
        expect(inv.avisos).toContain(MAC_ALEX.avisos[0]);
        expect(inv.avisos).not.toContain(AVISO_DISCOS);
        expect(inv.avisos).not.toContain(AVISO_RAM_NAVEGADOR);
    });
});

describe("inventarioDesde · sin servidor local", () => {
    it("todo estimado desde el navegador, y lo dice", () => {
        const inv = inventarioDesde({ estaNeurona: desdeNavegador(), ahora });
        const esta = inv.neuronas[0];
        expect(esta.procesadores.every((p) => p.fuente === "estimado")).toBe(true);
        expect(esta.procesadores.find((p) => p.tipo === "gpu")?.nombre).toBe("Apple M1");
        expect(esta.procesadores.find((p) => p.tipo === "cpu")?.runtimes).toEqual(["needle-wasm", "ollama"]);
        expect(esta.almacenes.map((a) => a.tipo)).toEqual(["navegador"]);
        expect(esta.almacenes[0]).toMatchObject({ fuente: "estimado", totalGb: 9.3, libreGb: 8.4 });
        expect(inv.avisos).toEqual(expect.arrayContaining([AVISO_DISCOS, AVISO_RAM_NAVEGADOR]));
    });
});

describe("inventarioDesde · unión de fuentes", () => {
    const declaradoDuplicado: MedioAlmacen = {
        id: `${ID}:ext:SSD Externo`,
        tipo: "disco-externo",
        etiqueta: "lo que dije a mano antes de detectarlo",
        via: "local",
        persistente: true,
        privado: true,
        disponible: true,
        fuente: "declarado",
    };
    const nas: MedioAlmacen = { id: "nas", tipo: "servidor-externo", etiqueta: "NAS (cuenta)", via: "malla-local", persistente: true, privado: true, disponible: true, fuente: "estimado" };
    const nasDeclarado: MedioAlmacen = { ...nas, etiqueta: "NAS de casa", fuente: "declarado" };

    it("lo medido gana a lo declarado con el mismo id; lo declarado gana a lo de la cuenta; sin duplicados", () => {
        const otra = neuronaDesdeRegistro({ id: "n-movil", name: "Móvil", kind: "mobile", capabilities: { platform: "Android" }, permissions: {} as Neuron["permissions"], online: true } as Neuron);
        const inv = inventarioDesde({
            estaNeurona: desdeNavegador(),
            maquina: MAC_ALEX,
            otrasNeuronas: [otra, otra, { ...desdeNavegador(), esEsta: true }],
            almacenesCuenta: [nas],
            declarados: [declaradoDuplicado, nasDeclarado],
            servidores: [
                { id: "servidor:a", neuronaId: "servidor:a", tipo: "servidor", nombre: "A", aceleradores: [], runtimes: [], via: "internet", disponible: true, fuente: "declarado" },
                { id: "servidor:a", neuronaId: "servidor:a", tipo: "servidor", nombre: "A bis", aceleradores: [], runtimes: [], via: "internet", disponible: true, fuente: "declarado" },
            ],
            ahora,
        });
        expect(inv.neuronas.map((n) => n.id)).toEqual([ID, "n-movil"]);
        expect(inv.neuronas[1].esEsta).toBe(false);
        expect(inv.almacenesSueltos).toEqual([nasDeclarado]);
        expect(inv.neuronas[0].almacenes.find((a) => a.id === declaradoDuplicado.id)?.fuente).toBe("detectado");
        expect(inv.procesadoresSueltos.map((p) => p.nombre)).toEqual(["A bis"]);
        expect(inv.avisos.some((a) => a.includes("solo publica la cuota de su navegador"))).toBe(true);
    });

    it("dos discos con el mismo nombre no comparten id; un disco en red es un servidor externo", () => {
        const m: DeteccionMaquina = {
            ...MAC_ALEX,
            volumenes: [
                ...MAC_ALEX.volumenes,
                { montaje: "/Volumes/Sin título", nombre: "Sin título", totalGb: 59, libreGb: 50, externo: true, tipoDisco: "sd", conexion: "interna" },
                { montaje: "/Volumes/Sin título 1", nombre: "Sin título", totalGb: 1863, libreGb: 900, externo: true, tipoDisco: "nvme", conexion: "thunderbolt" },
                { montaje: "/Volumes/Modelos", nombre: "Modelos", totalGb: 3725, libreGb: 2000, externo: true, tipoDisco: "red", conexion: "red" },
            ],
        };
        const a = almacenesDeMaquina(ID, m);
        const ids = a.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(a.find((x) => x.ruta === "/Volumes/Sin título 1")).toMatchObject({ tipo: "disco-externo", lecturaMBs: 2500 });
        expect(a.find((x) => x.ruta === "/Volumes/Sin título")).toMatchObject({ tipoDisco: "sd", lecturaMBs: 80 });
        expect(a.find((x) => x.ruta === "/Volumes/Modelos")).toMatchObject({ tipo: "servidor-externo", lecturaMBs: 100 });
        const soloLectura = almacenesDeMaquina(ID, { ...MAC_ALEX, volumenes: [{ ...MAC_ALEX.volumenes[1], soloLectura: true }] });
        expect(soloLectura[0]).toMatchObject({ disponible: false, etiqueta: "SSD Externo · SSD USB (solo lectura)" });
    });
});

describe("Rescate de rama de la nube · contratos de borde", () => {
    it("la forma rota no se cuela: lo que el servidor local contesta se valida antes de usarlo", () => {
        expect(esDeteccionMaquina(MAC_ALEX)).toBe(true);
        expect(esDeteccionMaquina(null)).toBe(false);
        expect(esDeteccionMaquina("macOS")).toBe(false);
        // Un campo atómico con otro tipo (un totalGb «228» suelto, listas que no son listas) no pasa.
        expect(esDeteccionMaquina({ ...MAC_ALEX, nucleos: "8" })).toBe(false);
        expect(esDeteccionMaquina({ ...MAC_ALEX, volumenes: "228" })).toBe(false);
        expect(esDeteccionMaquina({ so: "macOS 26.3.1", nucleos: 8, ramGb: 8 })).toBe(false);
    });

    it("la máquina manda en el hierro sin borrar las carpetas ni el navegador; sin discos, aviso propio y no el del navegador", () => {
        const conCarpeta: NeuronaRecursos = {
            ...desdeNavegador(),
            almacenes: [
                ...desdeNavegador().almacenes,
                {
                    id: "carpeta:c1",
                    tipo: "neurona-local",
                    etiqueta: "Carpeta «Modelos»",
                    neuronaId: ID,
                    via: "local",
                    persistente: true,
                    privado: true,
                    disponible: true,
                    fuente: "declarado",
                },
            ],
        };
        const out = inventarioDesde({ estaNeurona: conCarpeta, maquina: MAC_ALEX, ahora });
        const esta = out.neuronas[0];
        // Con la detección nativa: lo medido gana y lo declarado a mano no se borra.
        expect(esta.almacenes.find((a) => a.id === "carpeta:c1")).toMatchObject({ tipo: "neurona-local", fuente: "declarado" });
        expect(esta.almacenes.find((a) => a.id === `${ID}:interno`)).toMatchObject({ fuente: "detectado", totalGb: 228 });
        expect(esta.almacenes.find((a) => a.id === `navegador:${ID}`)?.tipo).toBe("navegador");
        // El servidor contestó pero no pudo leer los discos: su aviso lo dice, no el genérico del navegador.
        const sinDiscos = inventarioDesde({ estaNeurona: conCarpeta, maquina: { ...MAC_ALEX, npu: undefined, volumenes: [] }, ahora });
        expect(sinDiscos.avisos).toContain("El servidor local de esta neurona no pudo leer sus discos.");
        expect(sinDiscos.avisos).not.toContain(AVISO_DISCOS);
    });
});

describe("otras fuentes", () => {
    it("otra neurona: por la malla si su enlace está abierto; sin permiso de cómputo no se ofrece", () => {
        const base = {
            id: "n-pc",
            name: "PC del taller",
            kind: "desktop",
            capabilities: { platform: "Linux", cores: 16, memoryGb: 8, webgpu: true, gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)" },
            permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
            online: true,
        } as Neuron;
        const porMalla = neuronaDesdeRegistro(base, { conectadaPorMalla: true });
        expect(porMalla.vias).toEqual(["malla-local", "red-starseed"]);
        expect(porMalla.procesadores.every((p) => p.via === "malla-local" && p.disponible && p.prestable)).toBe(true);
        expect(porMalla.procesadores.find((p) => p.tipo === "gpu")).toMatchObject({ nombre: "NVIDIA GeForce RTX 3060", aceleradores: ["cuda"] });
        const sinComputo = neuronaDesdeRegistro({ ...base, permissions: { ...base.permissions, compute: false } });
        expect(sinComputo.vias).toEqual(["red-starseed"]);
        expect(sinComputo.procesadores.every((p) => !p.disponible)).toBe(true);
        expect(sinComputo.almacenes[0].disponible).toBe(false); // sin cuota publicada
        const apagada = neuronaDesdeRegistro({ ...base, online: false });
        expect(apagada.online).toBe(false);
        expect(apagada.procesadores.every((p) => !p.disponible)).toBe(true);
    });

    it("carpetas vinculadas: las del dispositivo son de esta neurona; las de servicios, de cerebro", () => {
        const { deEstaNeurona, deLaCuenta } = almacenesDeCarpetas(
            [
                { id: "c1", nombre: "Modelos", tipo: "dispositivo", vivo: true, agregadaEn: 1 },
                { id: "c2", nombre: "Viejos", tipo: "dispositivo", agregadaEn: 2 },
                { id: "c3", nombre: "StarSeed_Memory_Root", tipo: "servicio", servicio: "google-drive", folderId: "abc", agregadaEn: 3 },
                { id: "c4", nombre: "nube.casa", tipo: "servicio", servicio: "nextcloud", agregadaEn: 4 },
            ],
            ID,
        );
        expect(deEstaNeurona.map((a) => [a.id, a.tipo, a.disponible])).toEqual([
            ["carpeta:c1", "neurona-local", true],
            ["carpeta:c2", "neurona-local", false],
        ]);
        expect(deLaCuenta.map((a) => [a.id, a.tipo, a.conexion, a.etiqueta])).toEqual([
            ["carpeta:c3", "carpeta-cerebro", "nube", "Google Drive · StarSeed_Memory_Root"],
            ["carpeta:c4", "carpeta-cerebro", "red", "Nextcloud/WebDAV · nube.casa"],
        ]);
    });

    it("servidores de cerebros: almacenes y cómputo, sin credenciales ni rutas del endpoint", () => {
        const { almacenes, procesadores } = recursosDeServidoresCerebro(
            [
                { id: "s1", name: "NAS propio", kind: "own", endpoint: "https://alex:secreto@nas.example.com:8443/api?token=abc", status: "conectado", shared: false },
                { id: "s2", name: "Ollama del taller", kind: "local", endpoint: "http://localhost:11434", conector: "ollama", status: "conectado", shared: true },
                { id: "s3", name: "Pausado", kind: "starseed", status: "pausado" },
            ],
            [
                { brain_id: "b1", server_id: "s1", role: "storage" },
                { brain_id: "b1", server_id: "s2", role: "compute" },
            ],
        );
        expect(almacenes.map((a) => a.id)).toEqual(["servidor:s1", "servidor:s3"]);
        expect(almacenes[0]).toMatchObject({ tipo: "servidor-externo", cerebroId: "b1", ruta: "https://nas.example.com:8443", via: "internet", privado: true });
        expect(JSON.stringify(almacenes)).not.toMatch(/secreto|token|alex@/);
        expect(almacenes[1]).toMatchObject({ via: "red-starseed", disponible: false });
        expect(procesadores).toEqual([
            { id: "servidor:s2", neuronaId: "servidor:s2", tipo: "servidor", nombre: "Ollama del taller", aceleradores: [], runtimes: ["ollama"], via: "local", disponible: true, prestable: true, propio: true, fuente: "declarado" },
        ]);
    });

    it("lectura estimada por tipo y conexión; nombre de la GPU del navegador", () => {
        expect(lecturaEstimadaMBs("nvme", "interna")).toBe(2500);
        expect(lecturaEstimadaMBs("ssd", "usb")).toBe(900);
        expect(lecturaEstimadaMBs("nvme", "thunderbolt")).toBe(2500);
        expect(lecturaEstimadaMBs("hdd", "usb")).toBe(120);
        expect(lecturaEstimadaMBs("sd", "interna")).toBe(80);
        expect(lecturaEstimadaMBs("desconocido", "usb")).toBeUndefined();
        expect(lecturaEstimadaMBs(undefined, "nube")).toBeUndefined();
        expect(nombreGpuNavegador("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)")).toBe("Apple M1");
        expect(nombreGpuNavegador("Mali-G78")).toBe("Mali-G78");
    });
});

describe("detectarInventario fuera del navegador", () => {
    it("no lanza ni toca la red: devuelve esta neurona y el aviso de los discos", async () => {
        const inv = await detectarInventario({ declarados: [] });
        expect(inv.neuronas).toHaveLength(1);
        expect(inv.neuronas[0].esEsta).toBe(true);
        expect(inv.avisos).toContain(AVISO_DISCOS);
    });
});

describe("modelos ya instalados (integración)", () => {
    it("BitNet viene con el backend de Astraura; TurboFieldfare solo si su servidor contesta", async () => {
        const { modelosInstaladosDe } = await import("../deteccion");
        const base = { t: "", host: "mac", so: "macOS 26.3.1", arquitectura: "arm64" as const, nucleos: 8, ramGb: 8, gpus: [], volumenes: [], herramientas: [], avisos: [] };
        const conBitnet = modelosInstaladosDe("n1", { ...base, runtimes: ["bitnet-cpp"], servidoresIA: [{ id: "turbo-fieldfare", url: "", ok: false }] });
        expect(conBitnet).toEqual([{ modeloId: "bitnet-b1.58-2b-4t", procesadorId: "n1:cpu", almacenId: "n1:interno" }]);
        const conTurbo = modelosInstaladosDe("n1", { ...base, runtimes: [], servidoresIA: [{ id: "turbo-fieldfare", url: "", ok: true }] });
        expect(conTurbo.map((x) => x.modeloId)).toEqual(["turbo-fieldfare-gemma4-26b-a4b"]);
    });
});
