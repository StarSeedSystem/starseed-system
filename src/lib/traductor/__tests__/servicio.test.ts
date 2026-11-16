import { describe, expect, it } from "vitest";

import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";
import { crearServicioTraductor } from "../servicio";
import { crearAlmacenMemoria } from "../privacidad";
import type { AlmacenHistorial } from "../historial";

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
            return textos.map((t) => ({ texto: o.salir ? o.salir(t) : t }));
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

describe("crearServicioTraductor", () => {
    describe("auto-detección", () => {
        it("detecta español automáticamente y traduce", async () => {
            const deps = crearDeps([motorFalso("paquete-local", "aparato", { salir: (t) => t.toUpperCase() })]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola niño cómo estás hoy el día está bonito", { origen: "auto", destino: "en" });
            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.origenDetectado).toBe("es");
                expect(r.texto).toBe("HOLA NIÑO CÓMO ESTÁS HOY EL DÍA ESTÁ BONITO");
                expect(r.motor).toBe("paquete-local");
                expect(r.local).toBe(true);
            }
        });

        it("devuelve aviso cuando confianza < 0.6", async () => {
            const deps = crearDeps([motorFalso("paquete-local", "aparato")]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hi", { origen: "auto", destino: "en" });
            expect("aviso" in r).toBe(true);
            if ("aviso" in r) {
                expect(r.aviso).toContain("confianza");
            }
        });

        it("pide elegir idioma cuando detección devuelve null", async () => {
            const deps = crearDeps([motorFalso("paquete-local", "aparato")]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("", { origen: "auto", destino: "en" });
            expect("aviso" in r).toBe(true);
        });
    });

    describe("texto largo", () => {
        it("recorta a 5000 caracteres con aviso", async () => {
            const textoLargo = "a".repeat(6000);
            const deps = crearDeps([motorFalso("paquete-local", "aparato", { salir: (t) => t + "-traducido" })]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir(textoLargo, { origen: "es", destino: "en" });
            expect("aviso" in r).toBe(true);
            if ("aviso" in r) {
                expect(r.aviso).toContain("5000");
                expect(r.texto.length).toBeLessThanOrEqual(5000 + 11); // texto + "-traducido"
            }
        });
    });

    describe("aviso pendiente no envía", () => {
        it("devuelve necesitaAviso para motor que sale del aparato sin aviso aceptado", async () => {
            const deps = crearDeps([motorFalso("libretranslate", "cuenta", { salir: (t) => t + "-traducido" })], { avisosAceptados: {} });
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("necesitaAviso" in r).toBe(true);
            if ("necesitaAviso" in r) {
                expect(r.necesitaAviso).toBe("libretranslate");
            }
        });

        it("traduce normalmente si el aviso ya fue aceptado", async () => {
            const deps = crearDeps([motorFalso("libretranslate", "cuenta", { salir: (t) => t + "-traducido" })], { avisosAceptados: { libretranslate: true } });
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.texto).toBe("hola-traducido");
                expect(r.motor).toBe("libretranslate");
            }
        });

        it("no pide aviso para motores locales", async () => {
            const deps = crearDeps([motorFalso("paquete-local", "aparato", { salir: (t) => t + "-traducido" })], { avisosAceptados: {} });
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("origenDetectado" in r).toBe(true);
        });
    });

    describe("error de motores", () => {
        it("pasa al siguiente motor si el primero falla y el segundo tiene éxito", async () => {
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { falla: true, fallaMensaje: "modelo no cargado" }),
                motorFalso("navegador", "aparato", { salir: (t) => t + "-ok" }),
            ]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.texto).toBe("hola-ok");
                expect(r.motor).toBe("navegador");
            }
        });

        it("devuelve error del último motor si todos fallan", async () => {
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { falla: true, fallaMensaje: "modelo no cargado" }),
                motorFalso("navegador", "aparato", { falla: true, fallaMensaje: "sin conexión" }),
            ]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("error" in r).toBe(true);
            if ("error" in r) {
                expect(r.error).toContain("sin conexión");
                expect(r.motor).toBe("navegador");
            }
        });

        it("pasa al siguiente motor si el primero falla", async () => {
            const deps = crearDeps([
                motorFalso("paquete-local", "aparato", { falla: true }),
                motorFalso("navegador", "aparato", { salir: (t) => t + "-ok" }),
            ]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("origenDetectado" in r).toBe(true);
            if ("origenDetectado" in r) {
                expect(r.texto).toBe("hola-ok");
                expect(r.motor).toBe("navegador");
            }
        });

        it("devuelve error claro si ningún motor está disponible", async () => {
            const deps = crearDeps([motorFalso("paquete-local", "aparato", { disponible: false })]);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("error" in r).toBe(true);
            if ("error" in r) {
                expect(r.error).toContain("Ningún traductor disponible");
            }
        });
    });

    describe("historial", () => {
        it("guarda en historial cuando no está desactivado", async () => {
            const almacenHistorial = crearAlmacenHistorialMemoria();
            const almacenAvisos = crearAlmacenMemoria();
            const deps = {
                motores: [motorFalso("paquete-local", "aparato", { salir: (t) => t + "-traducido" })],
                almacenHistorial,
                almacenAvisos,
                opcionesHistorial: { sinHistorial: false },
                reloj: () => Date.now(),
            };
            const servicio = crearServicioTraductor(deps);
            await servicio.traducir("hola", { origen: "es", destino: "en" });
            const raw = almacenHistorial.obtener("starseed.traductor.historial.v1");
            expect(raw).not.toBeNull();
            const historial = JSON.parse(raw!);
            expect(historial.length).toBe(1);
            expect(historial[0].textoOrigen).toBe("hola");
            expect(historial[0].textoDestino).toBe("hola-traducido");
        });

        it("no guarda en historial cuando sinHistorial es true", async () => {
            const almacenHistorial = crearAlmacenHistorialMemoria();
            const almacenAvisos = crearAlmacenMemoria();
            const deps = {
                motores: [motorFalso("paquete-local", "aparato", { salir: (t) => t + "-traducido" })],
                almacenHistorial,
                almacenAvisos,
                opcionesHistorial: { sinHistorial: true },
                reloj: () => Date.now(),
            };
            const servicio = crearServicioTraductor(deps);
            await servicio.traducir("hola", { origen: "es", destino: "en" });
            const raw = almacenHistorial.obtener("starseed.traductor.historial.v1");
            expect(raw).toBeNull();
        });
    });

    describe("medición de tiempo", () => {
        it("incluye ms en el resultado", async () => {
            let tiempo = 1000;
            const deps = crearDeps([motorFalso("paquete-local", "aparato", { salir: (t) => t + "-traducido" })], {});
            deps.reloj = () => (tiempo += 50);
            const servicio = crearServicioTraductor(deps);
            const r = await servicio.traducir("hola", { origen: "es", destino: "en" });
            expect("ms" in r).toBe(true);
            if ("ms" in r) {
                expect(r.ms).toBeGreaterThanOrEqual(0);
            }
        });
    });
});