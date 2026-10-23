/**
 * Tests de mover-servidor.ts con carpetas temporales.
 * Cubre: copia correcta, SHA que no cuadra (no deja el destino), sin espacio.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    sha256DeArchivo,
    sha256DeArchivoStream,
    rutaEnVolumenes,
    calcularTamano,
    espacioDeMontaje,
    cabeConMargen,
    normalizarRuta,
    construirRutaDestino,
    copiarArchivoConSha,
    copiarCarpetaConSha,
    moverPesos,
    crearArchivoTemporal,
    crearCarpetaTemporal,
    GIB,
    type VolumenDetectado,
    type MoverEntrada,
} from "../mover-servidor";

/* ───────────────────────────── Helpers ───────────────────────────── */

let tempRoot: string;
// Volúmenes de prueba SIN "/" para que no coincida todo
const vols: VolumenDetectado[] = [
    { montaje: "/Users/alex", nombre: "Sistema", totalGb: 500, libreGb: 100, externo: false, tipoDisco: "nvme", conexion: "interna" },
    { montaje: "/Volumes/Externo", nombre: "Externo", totalGb: 1000, libreGb: 800, externo: true, tipoDisco: "ssd", conexion: "usb" },
];

async function crearTemp(): Promise<string> {
    return mkdtemp(join(tmpdir(), "mover-test-"));
}

function volConMontaje(montaje: string, libreGb: number): VolumenDetectado {
    return { montaje, nombre: "Test", totalGb: 500, libreGb, externo: false, tipoDisco: "nvme", conexion: "interna" };
}

/* ───────────────────────────── Tests ───────────────────────────── */

describe("funciones puras", () => {
    it("sha256DeArchivo y sha256DeArchivoStream dan el mismo resultado", async () => {
        const dir = await crearTemp();
        const archivo = join(dir, "test.bin");
        await writeFile(archivo, Buffer.from("contenido de prueba para sha256"));
        const [s1, s2] = await Promise.all([sha256DeArchivo(archivo), sha256DeArchivoStream(archivo)]);
        expect(s1).toBe(s2);
        expect(s1).toHaveLength(64);
        await rm(dir, { recursive: true, force: true });
    });

    it("rutaEnVolumenes: true si la ruta está dentro de un volumen", () => {
        expect(rutaEnVolumenes("/Users/alex/modelos/bitnet", vols)).toBe(true);
        expect(rutaEnVolumenes("/Volumes/Externo/modelos", vols)).toBe(true);
        expect(rutaEnVolumenes("/Users/alex", vols)).toBe(true);
        expect(rutaEnVolumenes("/Volumes/Externo", vols)).toBe(true);
    });

    it("rutaEnVolumenes: false si la ruta está fuera de todos los volúmenes", () => {
        expect(rutaEnVolumenes("/mnt/otro/modelos", vols)).toBe(false);
        expect(rutaEnVolumenes("/home/otro", vols)).toBe(false);
        expect(rutaEnVolumenes("/Volumes/NoExiste/algo", vols)).toBe(false);
        expect(rutaEnVolumenes("/", vols)).toBe(false); // "/" no está en los volúmenes
    });

    it("calcularTamano: archivo devuelve su tamaño", async () => {
        const dir = await crearTemp();
        const archivo = join(dir, "archivo.txt");
        await writeFile(archivo, "hola mundo");
        expect(await calcularTamano(archivo)).toBe(10);
        await rm(dir, { recursive: true, force: true });
    });

    it("calcularTamano: carpeta suma recursivamente", async () => {
        const dir = await crearTemp();
        await writeFile(join(dir, "a.txt"), "aaaa"); // 4
        await mkdir(join(dir, "sub"), { recursive: true });
        await writeFile(join(dir, "sub", "b.txt"), "bbbbbbbb"); // 8
        expect(await calcularTamano(dir)).toBe(12);
        await rm(dir, { recursive: true, force: true });
    });

    it("cabeConMargen: true si hay espacio con 10 %", () => {
        const libre = 100 * GIB;
        const necesario = 80 * GIB; // 88 GB con margen → cabe
        expect(cabeConMargen(libre, necesario).cabe).toBe(true);
    });

    it("cabeConMargen: false si no hay espacio con 10 %", () => {
        const libre = 100 * GIB;
        const necesario = 95 * GIB; // 104.5 GB con margen → no cabe
        expect(cabeConMargen(libre, necesario).cabe).toBe(false);
    });

    it("normalizarRuta limpia . y .. y barras dobles", () => {
        expect(normalizarRuta("/a/b/../c")).toBe("/a/c");
        expect(normalizarRuta("/a/./b")).toBe("/a/b");
        expect(normalizarRuta("//a//b///")).toBe("/a/b");
        // Ruta relativa: a/b/../../c → sube dos niveles desde a/b → .. → luego c → ../c
        expect(normalizarRuta("a/b/../../c")).toBe("../c");
    });

    it("construirRutaDestino une carpeta destino + nombre origen", () => {
        expect(construirRutaDestino("/origen/modelo.bin", "/destino")).toBe("/destino/modelo.bin");
        expect(construirRutaDestino("/origen/carpeta/", "/destino")).toBe("/destino/carpeta");
    });
});

describe("copiarArchivoConSha", () => {
    let origenDir: string;
    let destinoDir: string;

    beforeEach(async () => {
        origenDir = await crearTemp();
        destinoDir = await crearTemp();
    });

    afterEach(async () => {
        await Promise.all([rm(origenDir, { recursive: true, force: true }), rm(destinoDir, { recursive: true, force: true })]);
    });

    it("copia archivo y verifica SHA correcto", async () => {
        const origen = join(origenDir, "modelo.bin");
        const contenido = "pesos del modelo 1.58-bit";
        await writeFile(origen, contenido);
        const sha = await sha256DeArchivo(origen);

        const destino = join(destinoDir, "modelo.bin");
        const resultado = await copiarArchivoConSha(origen, destino, sha);

        expect(resultado.sha256).toBe(sha);
        expect(resultado.bytes).toBe(Buffer.byteLength(contenido));
        const stats = await stat(destino);
        expect(stats.size).toBe(Buffer.byteLength(contenido));
    });

    it("falla y borra destino si SHA no cuadra", async () => {
        const origen = join(origenDir, "modelo.bin");
        await writeFile(origen, "contenido original");
        const shaIncorrecto = "0".repeat(64);

        const destino = join(destinoDir, "modelo.bin");
        await expect(copiarArchivoConSha(origen, destino, shaIncorrecto)).rejects.toThrow("SHA-256 no coincide");

        // El destino no debe quedar
        await expect(stat(destino)).rejects.toThrow();
    });

    it("sobrescribe si sobrescribir=true", async () => {
        const origen = join(origenDir, "nuevo.bin");
        await writeFile(origen, "nuevo contenido");
        const sha = await sha256DeArchivo(origen);

        const destino = join(destinoDir, "existente.bin");
        await writeFile(destino, "contenido viejo");

        const resultado = await copiarArchivoConSha(origen, destino, sha, true);
        expect(resultado.sha256).toBe(sha);
        const stats = await stat(destino);
        expect(stats.size).toBe(Buffer.byteLength("nuevo contenido"));
    });

    it("falla si destino existe y sobrescribir=false", async () => {
        const origen = join(origenDir, "nuevo.bin");
        await writeFile(origen, "nuevo");
        const sha = await sha256DeArchivo(origen);

        const destino = join(destinoDir, "existente.bin");
        await writeFile(destino, "viejo");

        await expect(copiarArchivoConSha(origen, destino, sha, false)).rejects.toThrow("ya existe");
    });
});

describe("copiarCarpetaConSha", () => {
    let origenDir: string;
    let destinoDir: string;

    beforeEach(async () => {
        origenDir = await crearTemp();
        destinoDir = await crearTemp();
    });

    afterEach(async () => {
        await Promise.all([rm(origenDir, { recursive: true, force: true }), rm(destinoDir, { recursive: true, force: true })]);
    });

    it("copia carpeta con subcarpetas y verifica SHA de cada archivo", async () => {
        await writeFile(join(origenDir, "a.bin"), "aaa");
        await mkdir(join(origenDir, "sub"), { recursive: true });
        await writeFile(join(origenDir, "sub", "b.bin"), "bbb");

        const shasEsperados = {
            "a.bin": await sha256DeArchivo(join(origenDir, "a.bin")),
            "sub/b.bin": await sha256DeArchivo(join(origenDir, "sub", "b.bin")),
        };

        const destino = join(destinoDir, "copia");
        const resultado = await copiarCarpetaConSha(origenDir, destino, shasEsperados);

        expect(Object.keys(resultado.shas)).toEqual(["a.bin", "sub/b.bin"]);
        expect(resultado.shas["a.bin"]).toBe(shasEsperados["a.bin"]);
        expect(resultado.shas["sub/b.bin"]).toBe(shasEsperados["sub/b.bin"]);
        expect(resultado.bytes).toBe(6);

        // Verificar archivos copiados
        const statsA = await stat(join(destino, "a.bin"));
        const statsB = await stat(join(destino, "sub", "b.bin"));
        expect(statsA.size).toBe(3);
        expect(statsB.size).toBe(3);
    });

    it("falla y limpia todo si un SHA no cuadra", async () => {
        await writeFile(join(origenDir, "a.bin"), "aaa");
        await writeFile(join(origenDir, "b.bin"), "bbb");

        const shasEsperados = {
            "a.bin": await sha256DeArchivo(join(origenDir, "a.bin")),
            "b.bin": "0".repeat(64), // incorrecto
        };

        const destino = join(destinoDir, "copia");
        await expect(copiarCarpetaConSha(origenDir, destino, shasEsperados)).rejects.toThrow("SHA-256 no coincide");

        // Nada debe quedar en el destino
        await expect(stat(destino)).rejects.toThrow();
    });
});

describe("moverPesos (integración)", () => {
    let origenDir: string;
    let destinoDir: string;

    beforeEach(async () => {
        origenDir = await crearTemp();
        destinoDir = await crearTemp();
    });

    afterEach(async () => {
        await Promise.all([rm(origenDir, { recursive: true, force: true }), rm(destinoDir, { recursive: true, force: true })]);
    });

    it("copia archivo correctamente con SHA verificado", async () => {
        const origen = join(origenDir, "modelo.gguf");
        await writeFile(origen, "pesos del modelo");
        const sha = await sha256DeArchivo(origen);

        const entrada: MoverEntrada = { origen, destino: destinoDir, sha256Esperado: sha };
        const volsTest = [volConMontaje(origenDir, 100), volConMontaje(destinoDir, 100)];
        const resultado = await moverPesos(entrada, volsTest);

        expect(resultado.ok).toBe(true);
        expect(resultado.destino).toBeDefined();
        expect(resultado.sha256Calculado).toBe(sha);
        expect(resultado.bytesCopiados).toBeGreaterThan(0);

        // Origen sigue existiendo
        const statsOrigen = await stat(origen);
        expect(statsOrigen.size).toBeGreaterThan(0);
    });

    it("copia carpeta correctamente con SHAs verificados", async () => {
        await writeFile(join(origenDir, "config.json"), '{"modelo":"bitnet"}');
        await mkdir(join(origenDir, "pesos"), { recursive: true });
        await writeFile(join(origenDir, "pesos", "modelo.bin"), "pesos123");

        const shas: Record<string, string> = {};
        shas["config.json"] = await sha256DeArchivo(join(origenDir, "config.json"));
        shas["pesos/modelo.bin"] = await sha256DeArchivo(join(origenDir, "pesos", "modelo.bin"));

        const entrada: MoverEntrada = { origen: origenDir, destino: destinoDir, sha256Esperado: shas };
        const volsTest = [volConMontaje(origenDir, 100), volConMontaje(destinoDir, 100)];
        const resultado = await moverPesos(entrada, volsTest);

        expect(resultado.ok).toBe(true);
        expect(typeof resultado.sha256Calculado).toBe("object");
        const shasCalc = resultado.sha256Calculado as Record<string, string>;
        expect(shasCalc["config.json"]).toBe(shas["config.json"]);
        expect(shasCalc["pesos/modelo.bin"]).toBe(shas["pesos/modelo.bin"]);
    });

    it("rechaza origen fuera de volúmenes detectados", async () => {
        const origen = join(origenDir, "modelo.bin");
        await writeFile(origen, "test");

        const entrada: MoverEntrada = { origen, destino: destinoDir };
        const resultado = await moverPesos(entrada, vols); // vols no incluye origenDir

        expect(resultado.ok).toBe(false);
        expect(resultado.error).toContain("fuera de los volúmenes detectados");
    });

    it("rechaza destino fuera de volúmenes detectados", async () => {
        const origen = join(origenDir, "modelo.bin");
        await writeFile(origen, "test");

        // Usar una ruta que no esté en los volúmenes y no requiera root
        const destinoFuera = join(tmpdir(), "no-existe", "destino");
        const entrada: MoverEntrada = { origen, destino: destinoFuera };
        const resultado = await moverPesos(entrada, vols);

        expect(resultado.ok).toBe(false);
        expect(resultado.error).toContain("fuera de los volúmenes detectados");
    });

    it("falla si SHA no cuadra y no deja destino", async () => {
        const origen = join(origenDir, "modelo.bin");
        await writeFile(origen, "contenido real");
        const shaIncorrecto = "0".repeat(64);

        const entrada: MoverEntrada = { origen, destino: destinoDir, sha256Esperado: shaIncorrecto };
        const volsTest = [volConMontaje(origenDir, 100), volConMontaje(destinoDir, 100)];
        const resultado = await moverPesos(entrada, volsTest);

        expect(resultado.ok).toBe(false);
        expect(resultado.error).toContain("SHA-256 no coincide");
        expect(resultado.destino).toBeUndefined();
    });

    it("falla si no hay espacio libre suficiente (margen 10 %)", async () => {
        const origen = join(origenDir, "grande.bin");
        await writeFile(origen, "x".repeat(50 * 1024 * 1024)); // 50 MB
        const sha = await sha256DeArchivo(origen);

        // Simular poco espacio: 40 MB libres → con margen 10 % necesita 55 MB → no cabe
        const volsPocos = [volConMontaje(origenDir, 100), volConMontaje(destinoDir, 0.04)];
        const espacioMock = async (): Promise<EspacioResultado> => ({
            libreBytes: 40 * 1024 * 1024,
            totalBytes: 100 * 1024 * 1024,
            libreGb: 0.04,
            totalGb: 0.1,
            cabe: false,
            necesarioConMargen: 55 * 1024 * 1024,
        });

        const entrada: MoverEntrada = { origen, destino: destinoDir, sha256Esperado: sha };
        const resultado = await moverPesos(entrada, volsPocos, { espacioFn: espacioMock });

        expect(resultado.ok).toBe(false);
        expect(resultado.error).toContain("Espacio insuficiente");
        expect(resultado.avisos.some((a) => a.includes("Espacio libre"))).toBe(true);
    });

    it("falla si el origen no existe", async () => {
        // Usar una ruta que SÍ está en los volúmenes pero no existe
        const origenInexistente = join(origenDir, "no-existe.bin");
        const entrada: MoverEntrada = { origen: origenInexistente, destino: destinoDir };
        const volsTest = [volConMontaje(origenDir, 100), volConMontaje(destinoDir, 100)];
        const resultado = await moverPesos(entrada, volsTest);

        expect(resultado.ok).toBe(false);
        expect(resultado.error).toContain("no existe");
    });
});

describe("utilidades para tests", () => {
    it("crearArchivoTemporal crea archivo y devuelve SHA", async () => {
        const dir = await crearTemp();
        const ruta = join(dir, "temp.bin");
        const sha = await crearArchivoTemporal(ruta, 1024);
        expect(sha).toHaveLength(64);
        const stats = await stat(ruta);
        expect(stats.size).toBe(1024);
        await rm(dir, { recursive: true, force: true });
    });

    it("crearCarpetaTemporal crea varios archivos y devuelve mapa de SHAs", async () => {
        const dir = await crearTemp();
        const ruta = join(dir, "carpeta");
        const shas = await crearCarpetaTemporal(ruta, { "a.txt": "hola", "b.bin": 256 });
        expect(Object.keys(shas)).toEqual(["a.txt", "b.bin"]);
        expect(shas["a.txt"]).toHaveLength(64);
        expect(shas["b.bin"]).toHaveLength(64);
        await rm(dir, { recursive: true, force: true });
    });
});