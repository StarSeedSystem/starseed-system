import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import { crearServicioTraductor } from "../servicio";
import { crearAlmacenMemoria as crearAlmacenAvisosMemoria } from "../privacidad";
import type { AlmacenHistorial } from "../historial";
import { ejecutarTraductor, ejecutarTraductorConServicio, type ServicioTraductor, type ResultadoEjecucion } from "../herramienta-astraura";
import { crearAlmacenPersonasMemoria, observar, fijar, idiomaDe } from "../idioma-por-persona";
import { crearServicioTraduccion } from "../motores-traductor";

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

function crearDepsServicio(motores: MotorTraduccion[], o: { avisosAceptados?: Record<string, boolean> } = {}) {
    const almacenHistorial = crearAlmacenHistorialMemoria();
    const almacenAvisos = crearAlmacenAvisosMemoria();
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
        opcionesHistorial: { sinHistorial: false },
        reloj: () => Date.now(),
    };
}

describe("traductor integral — casos de integración sin red", () => {
    describe("1) paquete-local instalado: traduce sin fetch y local:true", () => {
        it("traduce es→en con paquete-local instalado y no llama a fetch", async () => {
            const fetchOriginal = global.fetch;
            global.fetch = vi.fn(() => Promise.reject(new Error("fetch no debería llamarse")));

            const deps = crearDepsServicio([
                motorFalso("paquete-local", "aparato", { salir: (t) => `EN:${t}` }),
            ]);
            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            global.fetch = fetchOriginal;

            expect("origenDetectado" in resultado).toBe(true);
            if ("origenDetectado" in resultado) {
                expect(resultado.texto).toBe("EN:hola mundo");
                expect(resultado.motor).toBe("paquete-local");
                expect(resultado.local).toBe(true);
                expect(resultado.aviso).toBeUndefined();
            }
        });
    });

    describe("2) paquete NO instalado + modo privado: error claro y no llama a Astraura", () => {
        it("lanza error descriptivo cuando no hay motores privados disponibles (servicio de motores con privado:true)", async () => {
            const fetchOriginal = global.fetch;
            global.fetch = vi.fn(() => Promise.reject(new Error("fetch no debería llamarse")));

            const motores = [
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "publico", { disponible: true, salir: (t) => `AST:${t}` }),
            ];
            const servicioPrivado = crearServicioTraduccion({ privado: true, motores });
            
            await expect(servicioPrivado.traducir(["hola mundo"], "es", "en")).rejects.toThrow(/modo privado/);

            global.fetch = fetchOriginal;
        });

        it("no intenta usar motor astraura cuando está en modo privado", async () => {
            let astrauraLlamado = false;
            const motores = [
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "publico", {
                    disponible: true,
                    salir: (t) => {
                        astrauraLlamado = true;
                        return `AST:${t}`;
                    },
                }),
            ];
            const servicioPrivado = crearServicioTraduccion({ privado: true, motores });
            await servicioPrivado.traducir(["hola mundo"], "es", "en").catch(() => {});

            expect(astrauraLlamado).toBe(false);
        });
    });

    describe("3) sin privado + aviso aceptado: cae a astraura con motor:'astraura' y local:false", () => {
        it("usa astraura cuando paquete-local no está y aviso fue aceptado", async () => {
            const fetchOriginal = global.fetch;
            global.fetch = vi.fn(() => Promise.reject(new Error("fetch no debería llamarse")));

            const deps = crearDepsServicio([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "publico", { salir: (t) => `AST:${t}` }),
            ], { avisosAceptados: { astraura: true } });
            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            global.fetch = fetchOriginal;

            expect("origenDetectado" in resultado).toBe(true);
            if ("origenDetectado" in resultado) {
                expect(resultado.texto).toBe("AST:hola mundo");
                expect(resultado.motor).toBe("astraura");
                expect(resultado.local).toBe(false);
            }
        });
    });

    describe("4) aviso no aceptado: devuelve necesitaAviso y no envía", () => {
        it("devuelve necesitaAviso para astraura sin aviso aceptado", async () => {
            let astrauraLlamado = false;
            const deps = crearDepsServicio([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "publico", {
                    disponible: true,
                    salir: (t) => {
                        astrauraLlamado = true;
                        return `AST:${t}`;
                    },
                }),
            ], { avisosAceptados: {} });
            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            expect(astrauraLlamado).toBe(false);
            expect("necesitaAviso" in resultado).toBe(true);
            if ("necesitaAviso" in resultado) {
                expect(resultado.necesitaAviso).toBe("astraura");
            }
        });

        it("devuelve necesitaAviso para libretranslate sin aviso aceptado", async () => {
            let libretranslateLlamado = false;
            const deps = crearDepsServicio([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("libretranslate", "cuenta", {
                    disponible: true,
                    salir: (t) => {
                        libretranslateLlamado = true;
                        return `LT:${t}`;
                    },
                }),
            ], { avisosAceptados: {} });
            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            expect(libretranslateLlamado).toBe(false);
            expect("necesitaAviso" in resultado).toBe(true);
            if ("necesitaAviso" in resultado) {
                expect(resultado.necesitaAviso).toBe("libretranslate");
            }
        });
    });

    describe("5) ejecutarTraductor devuelve {error} si todo falla y no inventa texto", () => {
        it("devuelve error cuando el servicio falla y no inventa traducción", async () => {
            const servicioFalso: ServicioTraductor = {
                ejecutarTraductor: async () => ({ error: "servicio caído" }),
            };
            const resultado = await ejecutarTraductor(
                { texto: "hola mundo", origen: "es", destino: "en" },
                servicioFalso
            );

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toBe("servicio caído");
            }
        });

        it("devuelve error de validación si falta destino", async () => {
            const servicioFalso: ServicioTraductor = {
                ejecutarTraductor: async (): Promise<ResultadoEjecucion> => ["no debería llegar aquí"] as any,
            };
            const resultado = await ejecutarTraductor(
                { texto: "hola mundo", origen: "es" } as any,
                servicioFalso
            );

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect(resultado.error).toContain("destino");
            }
        });

        it("no inventa texto cuando todos los motores fallan en el servicio", async () => {
            const deps = crearDepsServicio([
                motorFalso("paquete-local", "aparato", { falla: true, fallaMensaje: "modelo no cargado" }),
                motorFalso("navegador", "aparato", { falla: true, fallaMensaje: "sin conexión" }),
            ]);
            const servicio = crearServicioTraductor(deps);
            const resultado = await servicio.traducir("texto original", { origen: "es", destino: "en" });

            expect("error" in resultado).toBe(true);
            if ("error" in resultado) {
                expect("texto" in resultado).toBe(false);
                expect(resultado.error).not.toBe("texto original");
            }
        });
    });
});

describe("6) idioma por persona: cambia solo tras tres detecciones", () => {
    const crearAlmacen = () => crearAlmacenPersonasMemoria();

    it("una detección no cambia el idioma", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("en");
    });

    it("dos detecciones del mismo idioma no cambian todavía", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("en");
    });

    it("tres detecciones consecutivas del mismo idioma con confianza ≥0.8 fijan el idioma", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("es");
    });

    it("una detección de otro idioma rompe la racha y reinicia contador", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "fr", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("fr");
    });

    it("confianza <0.8 no cuenta para la racha y la reinicia", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.7 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("en");
    });

    it("pedido (fijar) gana siempre sobre lo detectado", () => {
        const almacen = crearAlmacen();
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "es", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("es");
        fijar("p1", "fr", almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("fr");
        observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
        observar("p1", { idioma: "de", confianza: 0.9 }, almacen);
        expect(idiomaDe("p1", "en", almacen)).toBe("fr");
    });
});