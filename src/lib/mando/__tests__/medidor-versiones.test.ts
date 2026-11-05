/**
 * El medidor «Versiones» (2026-11-05 · Centro de Versiones).
 *
 * Contrato: architecture/centro-versiones-1105.md §4.
 * Estado leído de ~/.starseed/produccion/lanzamientos-estado.json (mismo que la API de lanzamientos).
 * Devuelve: versión publicada, versión en curso, tono (normal/aviso/peligro), una fila por medio,
 * y el lanzamiento vigente con sus pasos y jobs.
 */
import { describe, expect, it } from "vitest";

import { detalleDeMedidor, type DatosMedidores } from "@/lib/mando/medidores";

const estadoLanzado: DatosMedidores["lanzamientosEstado"] = {
    fase: "lanzado",
    detalle: "v0.4.0 lanzada y verificada en cada medio",
    version: "0.4.0",
    pasos: [
        { fase: "esperando-lista", t: 1700000000, detalle: "lista terminada" },
        { fase: "esperando-publicacion", t: 1700000100, detalle: "publicada la versión: etiqueto" },
        { fase: "preparando", t: 1700000200, detalle: "preparo v0.4.0" },
        { fase: "etiquetando", t: 1700000300, detalle: "etiqueta v0.4.0 subida: espero a que arranque el workflow" },
        { fase: "compilando", t: 1700000400, detalle: "compilando v0.4.0 en GitHub" },
        { fase: "verificando-archivos", t: 1700000500, detalle: "workflow en verde: compruebo cada archivo" },
        { fase: "publicando", t: 1700000600, detalle: "todos los archivos están y pesan lo que deben" },
        { fase: "verificando-medios", t: 1700000700, detalle: "release publicada: compruebo cada descarga" },
        { fase: "lanzado", t: 1700000800, detalle: "v0.4.0 lanzada y verificada en cada medio" },
    ],
    jobs: [
        { medio: "macos", job: "Build · macos-latest", estado: "ok", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:15:00Z" },
        { medio: "windows", job: "Build · windows-latest", estado: "ok", url: "https://github.com/.../jobs/2", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:18:00Z" },
        { medio: "linux", job: "Build · ubuntu-22.04", estado: "ok", url: "https://github.com/.../jobs/3", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:20:00Z" },
        { medio: "android", job: "Build · android", estado: "ok", url: "https://github.com/.../jobs/4", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:25:00Z" },
        { medio: "ios", job: "Build · ios", estado: "omitido", url: "https://github.com/.../jobs/5", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:05:00Z" },
        { medio: "canales", job: "Canales · escritorio", estado: "ok", url: "https://github.com/.../jobs/6", inicio: "2026-11-05T10:20:00Z", fin: "2026-11-05T10:22:00Z" },
    ],
    medios: {
        web: { estado: "al-dia", faltan: [], pequenos: [] },
        pwa: { estado: "al-dia", faltan: [], pequenos: [] },
        macos: { estado: "al-dia", faltan: [], pequenos: [] },
        windows: { estado: "al-dia", faltan: [], pequenos: [] },
        linux: { estado: "al-dia", faltan: [], pequenos: [] },
        android: { estado: "al-dia", faltan: [], pequenos: [] },
        ios: { estado: "no-disponible", faltan: ["StarSeed-OS-0.4.0-unsigned.ipa"], pequenos: [] },
        canales: { estado: "al-dia", faltan: [], pequenos: [] },
        libreria: { estado: "al-dia", faltan: [], pequenos: [] },
    },
    run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123456",
    release_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
    historial: [{ t: 1700000000, tipo: "lanzado", version: "0.4.0" }],
    pausado: false,
    tono: "normal",
};

const estadoCompilando: DatosMedidores["lanzamientosEstado"] = {
    fase: "compilando",
    detalle: "compilando v0.4.0 en GitHub",
    version: "0.4.0",
    pasos: [
        { fase: "esperando-lista", t: 1700000000, detalle: "lista terminada" },
        { fase: "esperando-publicacion", t: 1700000100, detalle: "publicada la versión: etiqueto" },
        { fase: "preparando", t: 1700000200, detalle: "preparo v0.4.0" },
        { fase: "etiquetando", t: 1700000300, detalle: "etiqueta v0.4.0 subida: espero a que arranque el workflow" },
        { fase: "compilando", t: 1700000400, detalle: "compilando v0.4.0 en GitHub" },
    ],
    jobs: [
        { medio: "macos", job: "Build · macos-latest", estado: "en-curso", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z", fin: null },
        { medio: "windows", job: "Build · windows-latest", estado: "en-cola", url: "https://github.com/.../jobs/2", inicio: null, fin: null },
        { medio: "linux", job: "Build · ubuntu-22.04", estado: "en-cola", url: "https://github.com/.../jobs/3", inicio: null, fin: null },
    ],
    medios: {
        web: { estado: "al-dia", faltan: [], pequenos: [] },
        pwa: { estado: "al-dia", faltan: [], pequenos: [] },
        macos: { estado: "generando", faltan: [], pequenos: [] },
        windows: { estado: "generando", faltan: [], pequenos: [] },
        linux: { estado: "generando", faltan: [], pequenos: [] },
        android: { estado: "generando", faltan: [], pequenos: [] },
        ios: { estado: "no-disponible", faltan: ["StarSeed-OS-0.4.0-unsigned.ipa"], pequenos: [] },
        canales: { estado: "generando", faltan: [], pequenos: [] },
        libreria: { estado: "generando", faltan: [], pequenos: [] },
    },
    run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123456",
    release_url: null,
    historial: [{ t: 1699900000, tipo: "lanzado", version: "0.3.0" }],
    pausado: false,
    tono: "aviso",
};

const estadoAtascado: DatosMedidores["lanzamientosEstado"] = {
    fase: "atascado",
    detalle: "error de código en macos: tarea LZ040A al enjambre",
    version: "0.4.0",
    pasos: [
        { fase: "esperando-lista", t: 1700000000, detalle: "lista terminada" },
        { fase: "esperando-publicacion", t: 1700000100, detalle: "publicada la versión: etiqueto" },
        { fase: "preparando", t: 1700000200, detalle: "preparo v0.4.0" },
        { fase: "etiquetando", t: 1700000300, detalle: "etiqueta v0.4.0 subida: espero a que arranque el workflow" },
        { fase: "compilando", t: 1700000400, detalle: "compilando v0.4.0 en GitHub" },
        { fase: "atascado", t: 1700000500, detalle: "error de código en macos: tarea LZ040A al enjambre" },
    ],
    jobs: [
        { medio: "macos", job: "Build · macos-latest", estado: "fallo", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:10:00Z" },
        { medio: "windows", job: "Build · windows-latest", estado: "ok", url: "https://github.com/.../jobs/2", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:18:00Z" },
    ],
    medios: {
        web: { estado: "al-dia", faltan: [], pequenos: [] },
        pwa: { estado: "al-dia", faltan: [], pequenos: [] },
        macos: { estado: "atascado", faltan: ["StarSeed.OS_0.4.0_universal.dmg"], pequenos: [] },
        windows: { estado: "al-dia", faltan: [], pequenos: [] },
        linux: { estado: "generando", faltan: [], pequenos: [] },
        android: { estado: "generando", faltan: [], pequenos: [] },
        ios: { estado: "no-disponible", faltan: ["StarSeed-OS-0.4.0-unsigned.ipa"], pequenos: [] },
        canales: { estado: "generando", faltan: [], pequenos: [] },
        libreria: { estado: "generando", faltan: [], pequenos: [] },
    },
    run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123456",
    release_url: null,
    historial: [],
    pausado: false,
    tono: "peligro",
};

const estadoEsperandoLista: DatosMedidores["lanzamientosEstado"] = {
    fase: "esperando-lista",
    detalle: "la lista no ha terminado: 3 tarea(s)",
    version: null,
    pasos: [{ fase: "esperando-lista", t: 1700000000, detalle: "lista terminada" }],
    jobs: [],
    medios: {
        web: { estado: "al-dia", faltan: [], pequenos: [] },
        pwa: { estado: "al-dia", faltan: [], pequenos: [] },
        macos: { estado: "al-dia", faltan: [], pequenos: [] },
        windows: { estado: "al-dia", faltan: [], pequenos: [] },
        linux: { estado: "al-dia", faltan: [], pequenos: [] },
        android: { estado: "al-dia", faltan: [], pequenos: [] },
        ios: { estado: "no-disponible", faltan: ["StarSeed-OS-0.4.0-unsigned.ipa"], pequenos: [] },
        canales: { estado: "al-dia", faltan: [], pequenos: [] },
        libreria: { estado: "al-dia", faltan: [], pequenos: [] },
    },
    run_url: null,
    release_url: null,
    historial: [{ t: 1699900000, tipo: "lanzado", version: "0.3.0" }],
    pausado: false,
    tono: "normal",
};

describe("detalleDeMedidor · versiones", () => {
    it("cuando está en 'lanzado' muestra versión publicada y versión en curso nula, tono normal", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoLanzado }, 1700001000);
        expect(d.titulo).toBe("Versiones");
        expect(d.resumen).toContain("publicada: v0.4.0");
        expect(d.resumen).toContain("en curso: —");
        expect(d.tono).toBe("normal");
    });

    it("cuando está compilando muestra versión en curso y tono aviso", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoCompilando }, 1700000500);
        expect(d.resumen).toContain("publicada: v0.3.0");
        expect(d.resumen).toContain("en curso: v0.4.0");
        expect(d.tono).toBe("aviso");
    });

    it("cuando está atascado el tono es peligro", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoAtascado }, 1700000600);
        expect(d.tono).toBe("peligro");
        expect(d.aviso).toBeTruthy();
    });

    it("cuando está esperando lista muestra versión publicada del historial y en curso nula", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoEsperandoLista }, 1700000100);
        expect(d.resumen).toContain("publicada: v0.3.0");
        expect(d.resumen).toContain("en curso: —");
    });

    it("una fila por medio con estado, faltan y enlace cuando procede", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoLanzado }, 1700001000);
        expect(d.filas.length).toBe(9); // 9 medios del contrato
        const macos = d.filas.find((f) => f.id === "macos");
        expect(macos).toBeTruthy();
        expect(macos?.estado).toBe("al-dia");
        expect(macos?.porque).toContain(".dmg");
        expect(macos?.enlace).toContain("github.com");
    });

    it("iOS dice no-disponible y explica por qué", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoLanzado }, 1700001000);
        const ios = d.filas.find((f) => f.id === "ios");
        expect(ios).toBeTruthy();
        expect(ios?.estado).toBe("no-disponible");
        expect(ios?.porque).toContain("cuenta de Apple");
    });

    it("acciones del medidor: lanzar, pausar, reintentar paso, toggle auto", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoCompilando }, 1700000500);
        const clases = d.acciones.map((a) => a.clase);
        // En compilando NO se ofrece "lanzar-version" (solo en esperando-lista o lanzado)
        expect(clases).toContain("pausar-lanzamiento");
        expect(clases).toContain("reintentar-paso");
        expect(clases).toContain("toggle-auto-lanzamiento");
        expect(clases).toContain("ir-a");
    });

    it("cuando está en 'lanzado' ofrece lanzar versión", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoLanzado }, 1700001000);
        const clases = d.acciones.map((a) => a.clase);
        expect(clases).toContain("lanzar-version");
    });

    it("sin estado dice que no hay datos", () => {
        const d = detalleDeMedidor("versiones", {}, Date.now());
        expect(d.filas).toEqual([]);
        expect(d.vacio?.toLowerCase()).toContain("sin datos");
        expect(d.aviso?.toLowerCase()).toContain("no se pudo leer");
    });
});