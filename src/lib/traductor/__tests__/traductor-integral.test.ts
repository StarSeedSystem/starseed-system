// Este archivo supera las 120 líneas porque cubre los 6 escenarios de integración requeridos por la tarea TU32
// (paquete-local, modo privado, fallback astraura, aviso pendiente, error total, idioma por persona).
// Cada escenario es una prueba de comportamiento distinta que no se puede dividir sin perder cobertura.

import { describe, expect, it, vi } from "vitest";

import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import { crearServicioTraductor } from "../servicio";
import { crearAlmacenMemoria as crearAlmacenAvisosMemoria } from "../privacidad";
import type { AlmacenHistorial } from "../historial";
import { ejecutarTraductorConServicio } from "../herramienta-astraura";
import { observar, fijar, idiomaDe, crearAlmacenPersonasMemoria } from "../idioma-por-persona";
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

function crearDeps(motores: MotorTraduccion[], o: { sinHistorial?: boolean; avisosAceptados?: Record<string, boolean> } = {}) {
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
        opcionesHistorial: { sinHistorial: o.sinHistorial ?? false },
        reloj: () => Date.now(),
    };
}

describe("traductor integral — par instalado → traducir sin red → privacidad → herramienta Astraura", () => {
    describe("1) paquete-local instalado para es→en: traduce sin fetch y local:true", () => {
        it("traduce usando paquete-local sin llamar a fetch", async () => {
            const fetchMock = vi.fn(() => Promise.reject(new Error("fetch no debe llamarse")));
            vi.spyOn(global, "fetch").mockImplementation(fetchMock);

            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { salir: (t) => t.toUpperCase() }),
            ]);
            const servicio = crearServicioTraductor(deps);

            const r = await servicio.traducir("hola mundo", { origen: "es", destino: "en" });

            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.texto).toBe("HOLA MUNDO");
                expect(r.motor).toBe("paquete-local");
                expect(r.local).toBe(true);
            }
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe("2) paquete NO instalado + modo privado: falla con error claro y no llama a Astraura", () => {
        it("lanza error cuando ningún motor privado está disponible y no intenta astraura", async () => {
            const astrauraLlamado = { valor: false };
            const motores = [
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "nube", {
                    disponible: true,
                    traducir: async () => {
                        astrauraLlamado.valor = true;
                        return ["no-debe-llegar"];
                    },
                }),
            ];
            const servicio = crearServicioTraduccion({ privado: true, motores });

            await expect(servicio.traducir(["hola"], "es", "en")).rejects.toThrow("en modo privado no hay motores de alcance privado disponibles");
            expect(astrauraLlamado.valor).toBe(false);
        });
    });

    describe("3) sin privado + aviso aceptado: cae a motor astraura falso → motor:'astraura', local:false", () => {
        it("usa astraura cuando el aviso está aceptado y no hay motores locales", async () => {
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "nube", { salir: (t) => `[astraura]${t}` }),
            ], { avisosAceptados: { astraura: true } });
            const servicio = crearServicioTraductor(deps);

            const r = await servicio.traducir("hello world", { origen: "en", destino: "es" });

            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.texto).toBe("[astraura]hello world");
                expect(r.motor).toBe("astraura");
                expect(r.local).toBe(false);
            }
        });
    });

    describe("4) aviso NO aceptado: devuelve necesitaAviso y no envía", () => {
        it("devuelve necesitaAviso para astraura sin aviso aceptado", async () => {
            const astrauraLlamado = { valor: false };
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { disponible: false }),
                motorFalso("astraura", "nube", {
                    traducir: async () => {
                        astrauraLlamado.valor = true;
                        return ["no-debe-llegar"];
                    },
                }),
            ], { avisosAceptados: {} });
            const servicio = crearServicioTraductor(deps);

            const r = await servicio.traducir("hello", { origen: "en", destino: "es" });

            expect("necesitaAviso" in r).toBe(true);
            if ("necesitaAviso" in r) {
                expect(r.necesitaAviso).toBe("astraura");
            }
            expect(astrauraLlamado.valor).toBe(false);
        });
    });

    describe("5) ejecutarTraductor devuelve {error} si todo falla y no inventa texto", () => {
        it("devuelve error cuando todos los motores fallan", async () => {
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { falla: true, fallaMensaje: "modelo no cargado" }),
                motorFalso("navegador", "aparato", { falla: true, fallaMensaje: "sin conexión" }),
            ]);
            const servicio = crearServicioTraductor(deps);

            const traducirFn = async (textos: string[], origen: string, destino: string) => {
                const r = await servicio.traducir(textos[0], { origen, destino });
                if ("error" in r) throw new Error(r.error);
                return [r.texto];
            };

            const r = await ejecutarTraductorConServicio(
                { texto: "hola", destino: "en" },
                traducirFn
            );

            expect("error" in r).toBe(true);
            if ("error" in r) {
                expect(r.error).toContain("sin conexión");
                expect(r.error).not.toBe("hola"); // no inventa el texto original como traducción
            }
        });
    });

    describe("6) idioma por persona cambia solo tras tres detecciones", () => {
        it("no cambia con una sola detección", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("en");
        });

        it("no cambia con dos detecciones consecutivas", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("en");
        });

        it("cambia tras tres detecciones consecutivas con confianza ≥0.8", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("es");
        });

        it("una detección de otro idioma rompe la racha", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "fr", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "fr", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("fr");
        });

        it("confianza <0.8 no cuenta para la racha y la reinicia", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.7 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("en");
        });

        it("pedido (fijar) gana siempre sobre lo detectado", () => {
            const almacen = crearAlmacenPersonasMemoria();
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "es", confianza: 0.9 }, almacen);
            // ahora está fijado a 'es' por detección
            fijar("persona-1", "fr", almacen);
            observar("persona-1", { idioma: "de", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "de", confianza: 0.9 }, almacen);
            observar("persona-1", { idioma: "de", confianza: 0.9 }, almacen);
            expect(idiomaDe("persona-1", "en", almacen)).toBe("fr");
        });
    });
});