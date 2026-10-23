import { afterEach, describe, expect, it } from "vitest";

import { limpiarConversores, registrarConversor, rutaDeConversion } from "../convertidores";
import { ejecutarRutaConFilee, NOMBRE_FILEE, registrarConversoresFilee } from "../conv-filee";
import { manejarAccionProtomolecula } from "../accion-agente";

afterEach(() => limpiarConversores());

describe("Filee en el grafo de conversores de la Protomolécula", () => {
    it("registra lo que dice `filee formats` y el grafo lo usa", () => {
        const n = registrarConversoresFilee({ nombre: "Markdown", ids: ["md", "markdown"], destinos: ["pdf", "docx", "md"], conMotor: ["odt"] });
        expect(n).toBe(2);
        const r = rutaDeConversion("md", "pdf")!;
        expect(r.pasos.map((p) => p.nombre)).toEqual([NOMBRE_FILEE]);
        expect(rutaDeConversion("md", "odt")).toBeNull();
    });

    it("prefiere un paso JS barato y mezcla pasos JS con Filee", async () => {
        registrarConversor({ de: "csv", a: "json", via: "js", costo: 1, nombre: "csv-json", convertir: (x) => `[${String(x).trim()}]` });
        registrarConversoresFilee({ nombre: "JSON", ids: ["json"], destinos: ["xlsx"], conMotor: [] });
        const ruta = rutaDeConversion("csv", "xlsx")!;
        expect(ruta.pasos.map((p) => p.nombre)).toEqual(["csv-json", NOMBRE_FILEE]);
        const llamadas: string[] = [];
        const r = await ejecutarRutaConFilee(ruta, "1,2", async (bytes, de, a) => {
            llamadas.push(`${de}→${a}:${new TextDecoder().decode(bytes)}`);
            return new TextEncoder().encode("XLSX");
        });
        expect(r.ok).toBe(true);
        expect(llamadas).toEqual(["json→xlsx:[1,2]"]);
    });

    it("si la neurona falla, lo dice con el paso", async () => {
        registrarConversoresFilee({ nombre: "PDF", ids: ["pdf"], destinos: ["docx"], conMotor: [] });
        const r = await ejecutarRutaConFilee(rutaDeConversion("pdf", "docx")!, new Uint8Array([1]), async () => {
            throw new Error("Filee no está instalado en esta neurona.");
        });
        expect(r).toEqual({ ok: false, motivo: "El paso «Filee» (pdf → docx) falló: Filee no está instalado en esta neurona." });
    });
});

describe("acción de agente «convertir»", () => {
    it("abre el conversor con el archivo y el formato, sin molécula abierta", () => {
        const rutas: string[] = [];
        const r = manejarAccionProtomolecula({ accion: "convertir", url: "https://x/y.pdf", archivo: "y.pdf", a: "DOCX" }, { abrirRuta: (x) => rutas.push(x) });
        expect(r.ok).toBe(true);
        expect(rutas).toEqual(["/convertir?url=https%3A%2F%2Fx%2Fy.pdf&nombre=y.pdf&a=docx"]);
        expect(r.message).toMatch(/Word \(DOCX\)/);
    });
    it("sin ruta para abrir, no finge", () => {
        expect(manejarAccionProtomolecula({ accion: "convertir", a: "pdf" }, {}).ok).toBe(false);
    });
});
