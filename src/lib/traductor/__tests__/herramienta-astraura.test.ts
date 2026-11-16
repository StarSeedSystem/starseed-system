import { describe, expect, it } from "vitest";
import {
    validarEntradaTraductor,
    ejecutarTraductor,
    ejecutarTraductorConServicio,
    descripcionHerramienta,
    type EntradaTraductor,
    type ServicioTraductor,
    type ResultadoEjecucion,
} from "../herramienta-astraura";

describe("validarEntradaTraductor", () => {
    it("acepta entrada válida con texto", () => {
        const entrada: EntradaTraductor = { texto: "hola", destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(true);
    });

    it("acepta entrada válida con array de textos", () => {
        const entrada: EntradaTraductor = { textos: ["hola", "adiós"], destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(true);
    });

    it("acepta origen 'auto'", () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "auto", destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(true);
    });

    it("acepta origen como código de idioma válido", () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "es", destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(true);
    });

    it("requiere 'destino'", () => {
        const entrada = { texto: "hola" } as EntradaTraductor;
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toBe("'destino' es obligatorio");
    });

    it("error si ambos texto y textos están definidos", () => {
        const entrada: EntradaTraductor = { texto: "hola", textos: ["hola"], destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toBe("No puede proporcionar ambos 'texto' y 'textos'");
    });

    it("error si faltan texto y textos", () => {
        const entrada: EntradaTraductor = { destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toBe("Debe proporcionar 'texto' o 'textos'");
    });

    it("error si origen no es auto ni código de 2 letras", () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "español", destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toContain("origen");
    });

    it("error si el texto excede el límite de caracteres", () => {
        const entrada: EntradaTraductor = { texto: "x".repeat(6000), destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toBe("el texto no puede exceder 5000 caracteres");
    });

    it("error si el total de caracteres en textos excede el límite", () => {
        const entrada: EntradaTraductor = { textos: ["x".repeat(4000), "y".repeat(2000)], destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toContain("5000");
    });

    it("error si hay más de 20 textos", () => {
        const textos = Array(21).fill("hola");
        const entrada: EntradaTraductor = { textos, destino: "en" };
        const resultado = validarEntradaTraductor(entrada);
        expect(resultado.valido).toBe(false);
        expect(resultado.error).toBe("máximo 20 textos");
    });

    it("acepta códigos de idioma con region (es-ES, en-US)", () => {
        const entrada1: EntradaTraductor = { texto: "hola", destino: "es-ES" };
        const entrada2: EntradaTraductor = { texto: "hello", destino: "en-US" };
        expect(validarEntradaTraductor(entrada1).valido).toBe(true);
        expect(validarEntradaTraductor(entrada2).valido).toBe(true);
    });
});

describe("ejecutarTraductor", () => {
    it("devuelve error para entrada inválida", async () => {
        const entrada = { destino: "en" } as EntradaTraductor;
        const resultado = await ejecutarTraductor(entrada, { ejecutarTraductor: async () => ({ error: "test" }) });
        expect(resultado).toHaveProperty("error");
        if ("error" in resultado) {
            expect(resultado.error).toBe("Debe proporcionar 'texto' o 'textos'");
        }
    });
});

describe("ejecutarTraductorConServicio", () => {
    it("devuelve error para entrada inválida", async () => {
        const entrada = { destino: "en" } as EntradaTraductor;
        const resultado = await ejecutarTraductorConServicio(entrada, async () => []);
        expect(resultado).toHaveProperty("error");
    });

    it("no traduce si origen y destino coinciden", async () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "es", destino: "es" };
        const resultado = await ejecutarTraductorConServicio(entrada, async () => ["traducido"]);
        if ("error" in resultado) {
            throw new Error("No debería devolver error");
        } else {
            expect(resultado.traducciones).toEqual(["hola"]);
            expect(resultado.origenDetectado).toBe("es");
            expect(resultado.motor).toBe("sin-cambio");
            expect(resultado.aviso).toBe("El idioma de origen y destino coinciden");
        }
    });

    it("llama al servicio de traducción con los textos correctos", async () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "es", destino: "en" };
        let textoRecibido = "";
        await ejecutarTraductorConServicio(entrada, (textos, origen, destino) => {
            textoRecibido = textos[0] ?? "";
            return Promise.resolve(["hello"]);
        });
        expect(textoRecibido).toBe("hola");
    });

    it("devuelve traducciones del servicio", async () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "es", destino: "en" };
        const resultado = await ejecutarTraductorConServicio(entrada, async () => ["hello"]);
        if ("error" in resultado) {
            throw new Error("No debería devolver error");
        } else {
            expect(resultado.traducciones).toEqual(["hello"]);
            expect(resultado.motor).toBe("servicio-personalizado");
        }
    });

    it("detecta origen como null cuando es auto", async () => {
        const entrada: EntradaTraductor = { texto: "hola", origen: "auto", destino: "en" };
        const resultado = await ejecutarTraductorConServicio(entrada, async () => ["hello"]);
        if ("error" in resultado) {
            throw new Error("No debería devolver error");
        } else {
            expect(resultado.origenDetectado).toBe(null);
            expect(resultado.aviso).toBe("idioma detectado automáticamente");
        }
    });
});

describe("descripcionHerramienta", () => {
    it("devuelve nombre, descripción y esquema válidos", () => {
        const descripcion = descripcionHerramienta();
        expect(descripcion.nombre).toBe("traducir");
        expect(descripcion.descripcion).toContain("Astraura");
        expect(descripcion.esquema.tipo).toBe("object");
        expect(descripcion.esquema.required).toEqual(["destino"]);
    });

    it("el esquema incluye las propiedades correctas", () => {
        const descripcion = descripcionHerramienta();
        const props = descripcion.esquema.propiedades as Record<string, unknown>;
        expect(props.texto).toBeDefined();
        expect(props.textos).toBeDefined();
        expect(props.origen).toBeDefined();
        expect(props.destino).toBeDefined();
        expect(props.tono).toBeDefined();
        expect(props.contexto).toBeDefined();
    });

    it("el esquema define enum para origen", () => {
        const descripcion = descripcionHerramienta();
        const props = descripcion.esquema.propiedades as Record<string, unknown>;
        const origenSchema = props.origen as { enum?: string[] };
        expect(origenSchema.enum).toContain("auto");
    });

    it("el esquema define enum para tono", () => {
        const descripcion = descripcionHerramienta();
        const props = descripcion.esquema.propiedades as Record<string, unknown>;
        const tonoSchema = props.tono as { enum?: string[] };
        expect(tonoSchema.enum).toContain("neutro");
        expect(tonoSchema.enum).toContain("formal");
        expect(tonoSchema.enum).toContain("cercano");
    });

    it("el esquema define enum para contexto", () => {
        const descripcion = descripcionHerramienta();
        const props = descripcion.esquema.propiedades as Record<string, unknown>;
        const contextoSchema = props.contexto as { enum?: string[] };
        expect(contextoSchema.enum).toContain("chat");
        expect(contextoSchema.enum).toContain("documento");
        expect(contextoSchema.enum).toContain("voz");
    });

    it("el esquema protege nombres propios", () => {
        const descripcion = descripcionHerramienta();
        expect(descripcion.descripcion).toContain("nombres propios");
    });
});