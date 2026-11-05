import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    contarAreas,
    olaDeAsunto,
    interpretarComprobaciones,
    avanzarComprobaciones,
    leerComprobacionesDe,
    bytesLeidosUltimaVez,
} from "@/lib/mando/publicacion";

describe("contarAreas", () => {
    it("agrupa las rutas por su primer segmento bajo src/", () => {
        const rutas = [
            "src/lib/mando/publicacion.ts",
            "src/lib/mando/tipos.ts",
            "src/components/mando/panel-publicacion.tsx",
            "src/app/api/mando/publicacion/route.ts",
            "supabase/migrations/0001.sql",
            "CLAUDE.md",
        ];
        expect(contarAreas(rutas)).toEqual({
            lib: 2,
            components: 1,
            app: 1,
            "raíz": 2,
        });
    });

    it("ignora líneas vacías y devuelve objeto vacío sin rutas", () => {
        expect(contarAreas(["", "   ", "\n"])).toEqual({});
        expect(contarAreas([])).toEqual({});
    });
});

describe("olaDeAsunto", () => {
    it("extrae el número de ola de un asunto de tarea", () => {
        expect(olaDeAsunto("Ola 226 · X4F2: título del commit")).toBe("226");
    });

    it("reconoce «ola» en minúsculas y sin prefijo de sección", () => {
        expect(olaDeAsunto("ola 239 · publicar")).toBe("239");
    });

    it("devuelve undefined cuando no hay número de ola", () => {
        expect(olaDeAsunto("chore: limpieza general")).toBeUndefined();
    });
});

describe("interpretarComprobaciones", () => {
    it("marca tsc y vitest en ok tras el último evento verificado", () => {
        const lineas = [
            JSON.stringify({ tipo: "verificado", texto: "tsc en verde" }),
            JSON.stringify({ tipo: "verificado", texto: "vitest 23/23 en verde" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: "ok", vitest: "ok" });
    });

    it("el último evento manda: una verificación fallida sobrescribe la anterior", () => {
        const lineas = [
            JSON.stringify({ tipo: "verificado", texto: "tsc ok" }),
            JSON.stringify({ tipo: "verificacion_fallida", texto: "tsc falla con 1 error" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: "falla", vitest: null });
    });

    it("detecta vitest también por la clave tarea", () => {
        const lineas = [JSON.stringify({ tipo: "verificado", tarea: "tests" })];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: null, vitest: "ok" });
    });

    it("ignora líneas que no son verificaciones y líneas corruptas", () => {
        const lineas = [
            "esto no es json",
            JSON.stringify({ tipo: "commit", texto: "integró algo" }),
        ];
        expect(interpretarComprobaciones(lineas)).toEqual({ tsc: null, vitest: null });
    });
});

describe("avanzarComprobaciones", () => {
    it("une resto + trozo y procesa solo líneas completas", () => {
        const estado = { tsc: "desconocido" as const, vitest: "ok" as const, resto: "" };
        const trozo = `${JSON.stringify({ tipo: "verificacion_fallida", texto: "tsc falla" })}\n`;
        const resultado = avanzarComprobaciones(estado, trozo);
        expect(resultado).toEqual({ tsc: "falla", vitest: "ok", resto: "" });
    });

    it("mantiene la línea incompleta en resto", () => {
        const estado = { tsc: "ok" as const, vitest: "ok" as const, resto: "" };
        const objJson = { tipo: "verificado", texto: "tsc " };
        const trozo = JSON.stringify(objJson) + "partial";
        const resultado = avanzarComprobaciones(estado, trozo);
        expect(resultado.tsc).toBe("ok");
        expect(resultado.resto).toBe(JSON.stringify(objJson) + "partial");
    });

    it("une resto anterior con nuevas líneas completas", () => {
        const estado = {
            tsc: "ok" as const,
            vitest: "desconocido" as const,
            resto: "",
        };
        const trozo = `${JSON.stringify({ tipo: "verificacion_fallida", texto: "vitest falla" })}\n`;
        const resultado = avanzarComprobaciones(estado, trozo);
        expect(resultado).toEqual({ tsc: "ok", vitest: "falla", resto: "" });
    });

    it("solo parsea líneas que contienen 'verifica' y el último evento manda", () => {
        const estado = { tsc: "desconocido" as const, vitest: "desconocido" as const, resto: "" };
        const trozo = [
            JSON.stringify({ tipo: "commit", texto: "algo" }),
            JSON.stringify({ tipo: "verificacion_fallida", texto: "tsc falla" }),
            JSON.stringify({ tipo: "verificado", texto: "vitest ok" }),
        ].join("\n") + "\n";
        const resultado = avanzarComprobaciones(estado, trozo);
        expect(resultado).toEqual({ tsc: "falla", vitest: "ok", resto: "" });
    });

    it("no cambia nada con trozo vacío", () => {
        const estado = { tsc: "falla" as const, vitest: "ok" as const, resto: "resto" };
        const resultado = avanzarComprobaciones(estado, "");
        expect(resultado).toEqual({ tsc: "falla", vitest: "ok", resto: "resto" });
    });
});

describe("leerComprobacionesDe", () => {
    let tempDir: string;
    let archivoPath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "publicacion-test-"));
        archivoPath = join(tempDir, "eventos.jsonl");
    });

    it("devuelve desconocido cuando el archivo no existe", () => {
        const resultado = leerComprobacionesDe(`${tempDir}/noexiste.jsonl`);
        expect(resultado).toEqual({ tsc: "desconocido", vitest: "desconocido" });
    });

    it("lee y parsea el archivo completo en la primera llamada", () => {
        const contenido = [
            JSON.stringify({ tipo: "verificado", texto: "tsc en verde" }),
            JSON.stringify({ tipo: "verificado", texto: "vitest 23/23 en verde" }),
        ].join("\n");
        writeFileSync(archivoPath, contenido, "utf8");

        const resultado = leerComprobacionesDe(archivoPath);
        expect(resultado).toEqual({ tsc: "ok", vitest: "ok" });
        expect(bytesLeidosUltimaVez()).toBe(Buffer.byteLength(contenido, "utf8"));
    });

    it("leer solo los bytes añadidos en llamadas posteriores", () => {
        const contenido = JSON.stringify({ tipo: "verificado", texto: "tsc ok" }) + "\n";
        writeFileSync(archivoPath, contenido, "utf8");

        const resultado1 = leerComprobacionesDe(archivoPath);
        expect(resultado1).toEqual({ tsc: "ok", vitest: "desconocido" });
        expect(bytesLeidosUltimaVez()).toBe(Buffer.byteLength(contenido, "utf8"));

        const masLinea = JSON.stringify({ tipo: "verificacion_fallida", texto: "vitest falla" }) + "\n";
        writeFileSync(archivoPath, contenido + masLinea, "utf8");

        const resultado2 = leerComprobacionesDe(archivoPath);
        expect(resultado2).toEqual({ tsc: "ok", vitest: "falla" });
    });

    it("vuelve a empezar si el archivo se trunca (tamaño menor que offset)", () => {
        const contenido1 = [
            JSON.stringify({ tipo: "verificado", texto: "tsc ok" }),
            JSON.stringify({ tipo: "verificacion_fallida", texto: "vitest falla" }),
        ].join("\n");
        writeFileSync(archivoPath, contenido1, "utf8");

        leerComprobacionesDe(archivoPath);
        expect(bytesLeidosUltimaVez()).toBe(Buffer.byteLength(contenido1, "utf8"));

        const contenido2 = JSON.stringify({ tipo: "verificado", texto: "vitest ok" }) + "\n";
        writeFileSync(archivoPath, contenido2, "utf8");

        const resultado = leerComprobacionesDe(archivoPath);
        expect(resultado).toEqual({ tsc: "desconocido", vitest: "ok" });
    });

    it("una línea rota sin 'verifica' no cambia el estado", () => {
        const contenido = [
            JSON.stringify({ tipo: "verificacion_fallida", texto: "tsc falla" }),
            "corrupta{linea",
        ].join("\n");
        writeFileSync(archivoPath, contenido, "utf8");

        const resultado = leerComprobacionesDe(archivoPath);
        expect(resultado).toEqual({ tsc: "falla", vitest: "desconocido" });
    });

    afterEach(() => {
        if (archivoPath) {
            try {
                unlinkSync(archivoPath);
            } catch {
                //
            }
        }
        try {
            unlinkSync(tempDir);
        } catch {
            //
        }
    });
});