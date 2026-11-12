import { describe, expect, it } from "vitest";

import {
    cadenaDeEntrega,
    cuerpoDePeticion,
    detalleDePastilla,
    duracionS,
    idDePeticion,
    leerBanco,
    leerDirector,
    peticionPendienteDe,
    tiempoDePlataforma,
    tonoDePruebas,
    ultimasLineasDelRegistro,
    limpiarLineaDeRegistro,
    validarControl,
    versionEnFoco,
    vistaDirector,
} from "../pruebas-vivas";
import type { VersionPrueba } from "../lanzamientos-pruebas-tipos";

const AHORA = Date.parse("2026-11-12T02:00:00Z");

function version(n: number, estados: string[], extra: Partial<VersionPrueba> = {}): VersionPrueba {
    return {
        numero: n,
        version: `0.5.1-prueba.${n}`,
        etiqueta: `prueba.${n}`,
        sha: "a".repeat(40),
        fecha: "2026-11-12T01:00:00Z",
        runUrl: null,
        plataformas: estados.map((e, i) => ({ plataforma: (["macos", "windows", "linux", "android"] as const)[i], titulo: `P${i}`, estado: e, desde: null, hasta: null, job: null, url: null, detalle: null })),
        comprobaciones: [],
        aprobacion: null,
        publicadaEnTodas: estados.every((e) => e === "publicada"),
        desconocido: [],
        ...extra,
    } as unknown as VersionPrueba;
}

describe("director: lectura defensiva y estado", () => {
    it("un archivo que no es objeto no rompe", () => {
        expect(leerDirector(null)).toBeNull();
        expect(leerDirector("hola")).toBeNull();
        expect(leerDirector(42)).toBeNull();
    });
    it("sin archivo: no lee peticiones y lo dice", () => {
        const v = vistaDirector(null, AHORA);
        expect(v.estado).toBe("sin-archivo");
        expect(v.leePeticiones).toBe(false);
    });
    it("ilegible: no lee peticiones", () => {
        expect(vistaDirector("ilegible", AHORA).estado).toBe("ilegible");
    });
    it("corriendo si pasó hace poco; parado si pasaron más de 3 cadencias", () => {
        const vivo = leerDirector({ formato: 1, t: "2026-11-12T01:59:30Z", cada_s: 60, pid_ok: true });
        expect(vistaDirector(vivo, AHORA).estado).toBe("corriendo");
        expect(vistaDirector(vivo, AHORA).leePeticiones).toBe(true);
        const viejo = leerDirector({ formato: 1, t: "2026-11-12T01:50:00Z", cada_s: 60, pid_ok: true });
        expect(vistaDirector(viejo, AHORA).estado).toBe("parado");
    });
    it("pid_ok falso o pausado no leen", () => {
        const sinPid = leerDirector({ formato: 1, t: "2026-11-12T01:59:50Z", cada_s: 60, pid_ok: false });
        expect(vistaDirector(sinPid, AHORA).leePeticiones).toBe(false);
        const pausa = leerDirector({ formato: 1, t: "2026-11-12T01:59:50Z", cada_s: 60, pid_ok: true, pausado: true, pausa_motivo: "mantenimiento" });
        const v = vistaDirector(pausa, AHORA);
        expect(v.estado).toBe("pausado");
        expect(v.leePeticiones).toBe(false);
        expect(v.texto).toMatch(/pausa/i);
    });
});

describe("banco de pruebas", () => {
    it("lo corrupto no rompe", () => {
        expect(leerBanco(null)).toBeNull();
        expect(leerBanco("x")).toBeNull();
    });
    it("lee aparatos sin inventar cifras: null sigue siendo null", () => {
        const b = leerBanco({ formato: 1, t: "2026-11-12T01:40:05Z", cada_s: 60, aparatos: [{ id: "mac", nombre: "Esta Mac", esta: true, version: null }], llamadas: [], sugerencias: [], sugerencias_nota: "La Mac tiene la 37" });
        expect(b?.aparatos[0].version).toBeNull();
        expect(b?.sugerenciasNota).toMatch(/37/);
    });
});

describe("tiempos y pasos", () => {
    it("sin historia dice «aún no se sabe»", () => {
        const t = tiempoDePlataforma({ plataforma: "macos", titulo: "macOS", estado: "compilando", desde: "2026-11-12T01:50:00Z", hasta: null, job: null, url: null, detalle: null } as never, undefined, AHORA);
        expect(`${t.habitual} ${t.faltan}`.toLowerCase()).toContain("aún no se sabe");
    });
    it("con tipico calcula cuánto falta", () => {
        const t = tiempoDePlataforma({ plataforma: "macos", titulo: "macOS", estado: "compilando", desde: "2026-11-12T01:50:00Z", hasta: null, job: null, url: null, detalle: null } as never, { minutos: 25 }, AHORA);
        expect(t.habitual).toMatch(/25/);
    });
    it("duracionS formatea", () => {
        expect(duracionS(75)).toBe("75 s");
        expect(duracionS(3700)).toMatch(/h|min/);
    });
});

describe("tono del medidor", () => {
    it("fallo manda: peligro", () => {
        expect(tonoDePruebas(version(40, ["publicada", "fallo", "publicada", "publicada"]), null)).toBe("peligro");
    });
    it("en marcha: aviso", () => {
        expect(tonoDePruebas(version(40, ["compilando", "en-cola", "en-cola", "en-cola"]), null)).toBe("aviso");
    });
    it("sin versión: normal y detalle honesto", () => {
        expect(tonoDePruebas(null, null)).toBe("normal");
        expect(detalleDePastilla(null, null)).toMatch(/sin versiones/);
    });
    it("la versión en foco es la que está en marcha, no la más nueva publicada", () => {
        const a = version(41, ["publicada", "publicada", "publicada", "publicada"]);
        const b = version(40, ["compilando", "en-cola", "en-cola", "en-cola"]);
        expect(versionEnFoco([a, b])?.numero).toBe(40);
    });
});

describe("cadena de entrega", () => {
    it("siempre tiene ocho eslabones con id", () => {
        const c = cadenaDeEntrega({ ahora: AHORA, v: version(40, ["compilando", "en-cola", "en-cola", "en-cola"]), enMarcha: null, cola: { sinPublicar: 2, origen: null, local: null }, banco: null, director: null });
        expect(c.length).toBe(8);
        expect(new Set(c.map((e) => e.id)).size).toBe(8);
    });
    it("sin versión tampoco se rompe", () => {
        const c = cadenaDeEntrega({ ahora: AHORA, v: null, enMarcha: null, cola: { sinPublicar: null, origen: null, local: null }, banco: null, director: null });
        expect(c.length).toBe(8);
    });
});

describe("control: validación y petición", () => {
    it("rechaza acciones desconocidas", () => {
        expect(validarControl({ accion: "borrar-todo" })).toEqual({ error: "Acción no válida." });
        expect(validarControl(null)).toEqual({ error: "Acción no válida." });
    });
    it("compilar sin sha = cabeza de origin/main; sha mal formado se rechaza", () => {
        expect(validarControl({ accion: "compilar" })).toMatchObject({ accion: "compilar", sha: null });
        expect(validarControl({ accion: "compilar", sha: "abc" })).toHaveProperty("error");
        expect(validarControl({ accion: "compilar", sha: "A".repeat(40) })).toMatchObject({ sha: "a".repeat(40) });
    });
    it("la nota de más de 500 caracteres se rechaza", () => {
        expect(validarControl({ accion: "compilar", nota: "x".repeat(501) })).toHaveProperty("error");
    });
    it("pedir-arreglo exige prueba y comprobación o plataforma", () => {
        expect(validarControl({ accion: "pedir-arreglo" })).toHaveProperty("error");
        expect(validarControl({ accion: "pedir-arreglo", prueba: 39 })).toHaveProperty("error");
        expect(validarControl({ accion: "pedir-arreglo", prueba: 39, comprobacion: "c7", nota: "el vídeo no sale" })).toMatchObject({ prueba: 39, comprobacion: "c7" });
        expect(validarControl({ accion: "pedir-arreglo", prueba: 39, plataforma: "macos" })).toMatchObject({ plataforma: "mac" });
        expect(validarControl({ accion: "pedir-arreglo", prueba: 39, comprobacion: "rm -rf" })).toHaveProperty("error");
    });
    it("cancelar con número o sin él", () => {
        expect(validarControl({ accion: "cancelar" })).toMatchObject({ numero: null });
        expect(validarControl({ accion: "cancelar", numero: 39 })).toMatchObject({ numero: 39 });
        expect(validarControl({ accion: "cancelar", numero: -3 })).toHaveProperty("error");
    });
    it("el id cumple el formato del director", () => {
        const id = idDePeticion(1731371000123, "AB12");
        expect(id).toBe("pet-1731371000-ab12");
        expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    });
    it("el cuerpo lleva formato 1 y solo los campos de su acción", () => {
        const p = validarControl({ accion: "cancelar", numero: 39 });
        if ("error" in p) throw new Error("no debía fallar");
        const c = cuerpoDePeticion(p, "pet-1-aaaa", "2026-11-12T02:00:00Z");
        expect(c).toMatchObject({ formato: 1, accion: "cancelar", numero: 39, sha: null, prueba: null, quien: "alex" });
    });
    it("una petición sin atender de la misma acción bloquea la segunda", () => {
        const pend = [{ id: "pet-1-aaaa", accion: "compilar", estado: "pendiente" }] as never;
        expect(peticionPendienteDe("compilar", pend)).not.toBeNull();
        expect(peticionPendienteDe("cancelar", pend)).toBeNull();
    });
});

describe("registro del fallo", () => {
    it("no deja pasar claves, rutas ni cabeceras de autorización", () => {
        const sucio = [
            "2026-11-12T01:00:00.000Z Authorization: Bearer abcdefghijklmnop1234567890",
            "2026-11-12T01:00:01.000Z token " + ["gh", "p_" + "a".repeat(36)].join(""),
            "2026-11-12T01:00:02.000Z leyendo /Users/alex/Documents/starseed-os-main/src/x.ts",
            "2026-11-12T01:00:03.000Z error: build failed",
        ].join("\n");
        const r = ultimasLineasDelRegistro(sucio);
        const texto = r.lineas.join("\n");
        expect(texto).not.toMatch(/Bearer abcdef/);
        expect(texto).not.toMatch(/ghp_/);
        expect(texto).not.toMatch(/\/Users\/alex/);
        expect(texto).toMatch(/build failed/);
    });
    it("parte las líneas largas y se queda con las últimas", () => {
        const largo = "x ".repeat(400);
        const muchas = Array.from({ length: 80 }, (_, i) => `linea ${i}`).join("\n") + "\n" + largo;
        const r = ultimasLineasDelRegistro(muchas, 40, 140);
        expect(r.lineas.length).toBeLessThanOrEqual(60);
        expect(r.recortado).toBe(true);
        expect(Math.max(...r.lineas.map((l) => l.length))).toBeLessThanOrEqual(140);
    });
    it("limpia la marca de hora de GitHub", () => {
        expect(limpiarLineaDeRegistro("2026-11-12T01:00:03.1234567Z hola")).toBe("hola");
    });
});

describe("PRB1111X · el foco con los datos reales", () => {
    const todas = (e: string[]) => ["publicada", "publicada", "publicada", "publicada"].map((x, i) => e[i] ?? x);
    const v39 = version(39, todas([]), { comprobaciones: [{ id: "c1", texto: "x", aparato: "Mac", estado: "pendiente", nota: "", quien: "", t: null } as never] });
    const versiones = [
        version(36, todas([])),
        version(37, todas(["fallo", "fallo", "fallo"])),
        version(38, todas([])),
        v39,
    ];
    it("una prueba fallida de hace dos pruebas no toma el foco", () => {
        expect(versionEnFoco(versiones)?.numero).toBe(39);
    });
    it("la pastilla dice publicada y comprobaciones pendientes, sin peligro", () => {
        const f = versionEnFoco(versiones);
        expect(tonoDePruebas(f, null)).not.toBe("peligro");
        expect(detalleDePastilla(f, null)).toMatch(/publicada/);
        expect(detalleDePastilla(f, null)).toMatch(/faltan comprobaciones/);
        expect(detalleDePastilla(f, null)).not.toMatch(/falló/);
    });
    it("si la más nueva es la que falló, sigue mandando el fallo", () => {
        const f = versionEnFoco([version(38, todas([])), version(39, todas(["fallo"]))]);
        expect(f?.numero).toBe(39);
        expect(tonoDePruebas(f, null)).toBe("peligro");
    });
    it("la fallida sigue en la lista de versiones", () => {
        expect(versiones.some((x) => x.numero === 37)).toBe(true);
    });
    it("app-abrir se valida sin más campos", () => {
        expect(validarControl({ accion: "app-abrir", nota: "x" })).toMatchObject({ accion: "app-abrir", nota: null, sha: null, numero: null });
        const p = validarControl({ accion: "app-abrir" });
        if ("error" in p) throw new Error("no debía fallar");
        expect(cuerpoDePeticion(p, "pet-1-aaaa", "2026-11-12T02:00:00Z")).toMatchObject({ accion: "app-abrir", sha: null, numero: null, prueba: null, nota: null });
    });
});

describe("PRB1111Z · la evidencia pertenece a una versión (formato v1.3)", () => {
    const crudo = {
        formato: 1, t: "2026-11-12T02:00:00Z", cada_s: 60,
        aparatos: [{ id: "mac", nombre: "Esta Mac", esta: true, version: "0.5.1-prueba.39", version_de: "app-instalada", version_desde: "2026-11-12T01:49:00Z", version_desde_fuente: "paquete-instalado", app_abierta: true }],
        llamadas: [
            { id: "llamada-20261111T191944", desde: "2026-11-11T19:19:44Z", version_relacion: "otra", version_mac: "0.5.1-prueba.37", lados: {} },
            { id: "llamada-x", version_relacion: "desconocida", version_mac: null, lados: {} },
            { id: "llamada-vieja", lados: {} },
        ],
        sugerencias: [{ prueba: 39, comprobacion: "c19", senal: "arranque-limpio", veredicto: "bien", motivo: "arranque limpio", llamada: null }],
        sin_evidencia: [{ prueba: 39, comprobacion: "c7", senal: "video-fps-ble", razon: "La tablet no da señal desde 21:01Z.", produciria: "una llamada con la 39 en ambos aparatos" }, { prueba: "x" }],
    };
    it("lee la versión desde cuándo, la relación de cada llamada y sin_evidencia", () => {
        const b = leerBanco(crudo)!;
        expect(b.aparatos[0].versionDesde).toBe("2026-11-12T01:49:00Z");
        expect(b.aparatos[0].versionDesdeFuente).toBe("paquete-instalado");
        expect(b.llamadas.map((l) => l.versionRelacion)).toEqual(["otra", "desconocida", null]);
        expect(b.llamadas[0].versionMac).toBe("0.5.1-prueba.37");
        expect(b.sinEvidencia).toEqual([{ prueba: 39, comprobacion: "c7", senal: "video-fps-ble", razon: "La tablet no da señal desde 21:01Z.", produciria: "una llamada con la 39 en ambos aparatos" }]);
        expect(b.sugerencias.map((x) => x.comprobacion)).toEqual(["c19"]);
    });
    it("un archivo anterior a la v1.3 se lee igual, sin inventar nada", () => {
        const b = leerBanco({ formato: 1, aparatos: [{ id: "mac" }], llamadas: [{ id: "llamada-1" }] })!;
        expect(b.aparatos[0].versionDesde).toBeNull();
        expect(b.llamadas[0].versionRelacion).toBeNull();
        expect(b.sinEvidencia).toEqual([]);
    });
});
