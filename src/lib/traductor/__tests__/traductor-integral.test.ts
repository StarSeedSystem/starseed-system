import { describe, expect, it, vi } from "vitest";
import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import { crearServicioTraductor } from "../servicio";
import { crearAlmacenMemoria } from "../privacidad";
import type { AlmacenHistorial } from "../historial";
import { ejecutarTraductor } from "../herramienta-astraura";
import { crearAlmacenPersonasMemoria, observar, idiomaDe, fijar } from "../idioma-por-persona";

function motorFalso(
    id: MotorTraduccion["id"],
    alcance: AlcanceMotor,
    o: { disponible?: boolean; salir?: (t: string) => string; falla?: boolean; fallaMensaje?: string } = {}
): MotorTraduccion {
    return {
        id,
        alcance,
        disponible: async () => o.disponible ?? true,
        traducir: async (textos, _origen, _destino) => {
            if (o.falla) throw new Error(o.fallaMensaje ?? `${id} falló`);
            return textos.map((t) => (o.salir ? o.salir(t) : t));
        },
    };
}

function crearAlmacenHistorialMemoria(): AlmacenHistorial {
    const mapa = new Map<string, string>();
    return {
        obtener: (clave: string) => mapa.get(clave) ?? null,
        guardar: (clave: string, valor: string) => { mapa.set(clave, valor); },
        borrar: (clave: string) => { mapa.delete(clave); },
    };
}

function crearDeps(motores: MotorTraduccion[], o: { sinHistorial?: boolean; avisosAceptados?: Record<string, boolean> } = {}) {
    const almacenHistorial = crearAlmacenHistorialMemoria();
    const almacenAvisos = crearAlmacenMemoria();
    if (o.avisosAceptados) {
        for (const [motor, aceptado] of Object.entries(o.avisosAceptados)) {
            if (aceptado) {
                almacenAvisos.guardar("starseed.traductor.avisos.v1", JSON.stringify({ [motor]: true }));
            }
        }
    }
    return {
        motores,
        almacenHistorial,
        almacenAvisos,
        opcionesHistorial: { sinHistorial: o.sinHistorial ?? false },
        reloj: () => Date.now(),
    };
}

describe("traductor integral — paquete local → privacidad → Astraura", () => {
    describe("(1) paquete-local instalado: traduce sin fetch y local:true", () => {
        it("traduce con paquete-local disponible, no llama a fetch y devuelve local:true", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", {
                    disponible: true,
                    salir: (t) => t.toUpperCase(),
                }),
            ]);

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("origenDetectado" in resultado).toBe(true);
            if ("origenDetectado" in resultado) {
                expect(resultado.motor).toBe("paquete-local");
                expect(resultado.local).toBe(true);
                expect(resultado.texto).toBe("HOLA MUNDO");
            }

            global.fetch = originalFetch;
        });
    });

    describe("(2) paquete NO instalado + modo privado: falla con error claro, no llama a Astraura", () => {
        it("con modo privado y sin motores de alcance privado disponibles, devuelve error y no llama a astraura", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("navegador", "aparato", { disponible: false }),
            ]);

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toContain("Ningún traductor disponible");
            }

            global.fetch = originalFetch;
        });

        it("con modo privado, motor que sale del aparato no disponible, error claro", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("libretranslate", "cuenta", { disponible: false }),
                motorFalso("astraura", "nube", { disponible: false }),
            ]);

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("error" in resultado).toBe(true);

            global.fetch = originalFetch;
        });
    });

    describe("(3) sin privado + aviso aceptado: cae a astraura falso, motor=astraura, local=false", () => {
        it("con aviso aceptado para astraura, traduce con motor astraura y local:false", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "nube", { salir: (t) => `[ASTRAURA]${t}`, disponible: true }),
            ], { avisosAceptados: { astraura: true } });

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("origenDetectado" in resultado).toBe(true);
            if ("origenDetectado" in resultado) {
                expect(resultado.motor).toBe("astraura");
                expect(resultado.local).toBe(false);
                expect(resultado.texto).toBe("[ASTRAURA]hola");
            }

            global.fetch = originalFetch;
        });

        it("con aviso aceptado para libretranslate, traduce con motor libretranslate y local:false", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("libretranslate", "cuenta", { salir: (t) => `[LT]${t}`, disponible: true }),
            ], { avisosAceptados: { libretranslate: true } });

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("origenDetectado" in resultado).toBe(true);
            if ("origenDetectado" in resultado) {
                expect(resultado.motor).toBe("libretranslate");
                expect(resultado.local).toBe(false);
                expect(resultado.texto).toBe("[LT]hola");
            }

            global.fetch = originalFetch;
        });
    });

    describe("(4) aviso sin aceptar: devuelve necesitaAviso y no envía", () => {
        it("sin aviso aceptado para astraura, devuelve necesitaAviso y no llama al motor", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "nube", { salir: (t) => `[ASTRAURA]${t}`, disponible: true }),
            ], { avisosAceptados: {} });

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("necesitaAviso" in resultado).toBe(true);
            if ("necesitaAviso" in resultado) {
                expect(resultado.necesitaAviso).toBe("astraura");
            }

            global.fetch = originalFetch;
        });

        it("sin aviso aceptado para malla, devuelve necesitaAviso", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            const originalFetch = global.fetch;
            global.fetch = fetchMock;

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("malla", "cerebro", { salir: (t) => `[MALLA]${t}`, disponible: true }),
            ], { avisosAceptados: {} });

            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola", { origen: "es", destino: "en" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect("necesitaAviso" in resultado).toBe(true);
            if ("necesitaAviso" in resultado) {
                expect(resultado.necesitaAviso).toBe("malla");
            }

            global.fetch = originalFetch;
        });
    });

    describe("(5) ejecutarTraductor devuelve {error} si todo falla y no inventa texto", () => {
        it("si todos los motores fallan, devuelve error y no inventa traducción", async () => {
            const servicioFalso = {
                ejecutarTraductor: vi.fn().mockResolvedValue({ error: "todos los motores fallaron" }),
            };

            const resultado = await ejecutarTraductor(
                { texto: "hola", destino: "en" },
                servicioFalso
            );

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toBe("todos los motores fallaron");
            }
            expect(servicioFalso.ejecutarTraductor).toHaveBeenCalledTimes(1);
        });

        it("si la entrada es inválida, devuelve error sin llamar al servicio", async () => {
            const servicioFalso = {
                ejecutarTraductor: vi.fn().mockResolvedValue({ error: "no debería llamarse" }),
            };

            const resultado = await ejecutarTraductor(
                { destino: "en" } as any,
                servicioFalso
            );

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toBe("Debe proporcionar 'texto' o 'textos'");
            }
            expect(servicioFalso.ejecutarTraductor).not.toHaveBeenCalled();
        });

        it("si el servicio devuelve error, no inventa texto en traducciones", async () => {
            const servicioFalso = {
                ejecutarTraductor: vi.fn().mockResolvedValue({ error: "servicio caído" }),
            };

            const resultado = await ejecutarTraductor(
                { texto: "hola mundo", destino: "en" },
                servicioFalso
            );

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toBe("servicio caído");
                expect(resultado).not.toHaveProperty("traducciones");
            }
        });
    });

    describe("(6) idioma por persona cambia solo tras tres detecciones", () => {
        it("una detección no cambia el idioma por defecto", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("en");
        });

        it("dos detecciones consecutivas no cambian el idioma", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("en");
        });

        it("tres detecciones consecutivas con confianza ≥0.8 fijan el idioma", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("es");
        });

        it("confianza <0.8 no cuenta y reinicia la racha", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.7 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("en");
        });

        it("cambio de idioma rompe la racha y empieza nueva", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("fr");
        });

        it("pedido (fijar) gana siempre sobre detecciones", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("es");

            // fijar sobrescribe
            fijar("persona1", "de", almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("de");

            // detecciones posteriores no cambian el pedido
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona1", { idioma: "fr", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona1", "en", almacen)).toBe("de");
        });
    });
});