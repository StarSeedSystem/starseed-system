/**
 * CTL1126F-d2 · espejo-aparatos: modo espejo para múltiples aparatos de una neurona
 * Pruebas con dos aparatos falsos: selección, pestañas y espejo.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
    tipoEspejo,
    crearEstadoEspejo,
    agregarAparato,
    quitarAparato,
    seleccionarAparato,
    activarEspejo,
    desactivarEspejo,
    ejecutarEnEspejo,
    type AparatoEspejo,
    type EstadoEspejo,
    type ResultadoEjecucion,
    type ResultadoConEstado,
} from "../espejo-aparatos";

describe("CTL1126F-d2 · espejo-aparatos", () => {
    let estado: EstadoEspejo;

    beforeEach(() => {
        estado = crearEstadoEspejo();
    });

    describe("tipoEspejo", () => {
        it("define el tipo de aparato para el espejo", () => {
            const aparato: AparatoEspejo = {
                id: "aparato-1",
                nombre: "Teléfono",
                tienePermiso: true,
                estaControlado: false,
            };
            expect(aparato.id).toBe("aparato-1");
            expect(aparato.nombre).toBe("Teléfono");
            expect(aparato.tienePermiso).toBe(true);
            expect(aparato.estaControlado).toBe(false);
        });
    });

    describe("crearEstadoEspejo", () => {
        it("crea un estado vacío sin aparatos y espejo desactivado", () => {
            expect(estado.aparatos).toEqual([]);
            expect(estado.espejoActivo).toBe(false);
            expect(estado.aparatoSeleccionado).toBeNull();
        });
    });

    describe("agregarAparato", () => {
        it("agrega un aparato al estado", () => {
            const nuevoEstado = agregarAparato(estado, {
                id: "aparato-1",
                nombre: "Teléfono",
                tienePermiso: true,
                estaControlado: false,
            });
            expect(nuevoEstado.aparatos).toHaveLength(1);
            expect(nuevoEstado.aparatos[0].id).toBe("aparato-1");
            expect(nuevoEstado.aparatos[0].nombre).toBe("Teléfono");
        });

        it("agrega múltiples aparatos", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            expect(s.aparatos).toHaveLength(2);
        });

        it("no duplica aparatos con el mismo id", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-1", nombre: "Teléfono Duplicado", tienePermiso: false, estaControlado: false });
            expect(s.aparatos).toHaveLength(1);
            expect(s.aparatos[0].nombre).toBe("Teléfono");
        });
    });

    describe("quitarAparato", () => {
        it("quita un aparato por id", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = quitarAparato(s, "aparato-1");
            expect(s.aparatos).toHaveLength(1);
            expect(s.aparatos[0].id).toBe("aparato-2");
        });

        it("limpia selección si se quita el aparato seleccionado", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = seleccionarAparato(s, "aparato-1");
            expect(s.aparatoSeleccionado).toBe("aparato-1");
            s = quitarAparato(s, "aparato-1");
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("desactiva espejo si se quita un aparato y quedan menos de 2", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            expect(s.espejoActivo).toBe(true);
            s = quitarAparato(s, "aparato-1");
            expect(s.espejoActivo).toBe(false);
        });
    });

    describe("seleccionarAparato", () => {
        it("selecciona un aparato por id", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = seleccionarAparato(s, "aparato-2");
            expect(s.aparatoSeleccionado).toBe("aparato-2");
        });

        it("desselecciona si se pasa null", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = seleccionarAparato(s, "aparato-1");
            s = seleccionarAparato(s, null);
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("no selecciona aparato inexistente", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = seleccionarAparato(s, "inexistente");
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("desactiva espejo al seleccionar un aparato individual", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            expect(s.espejoActivo).toBe(true);
            s = seleccionarAparato(s, "aparato-1");
            expect(s.espejoActivo).toBe(false);
            expect(s.aparatoSeleccionado).toBe("aparato-1");
        });
    });

    describe("activarEspejo / desactivarEspejo", () => {
        it("activa el modo espejo cuando hay al menos 2 aparatos", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            expect(s.espejoActivo).toBe(true);
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("no activa espejo con menos de 2 aparatos", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            expect(s.espejoActivo).toBe(false);
        });

        it("desactiva el modo espejo", () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            s = desactivarEspejo(s);
            expect(s.espejoActivo).toBe(false);
        });
    });

    describe("ejecutarEnEspejo", () => {
        it("ejecuta la orden en todos los aparatos con permiso", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { resultados, estado: nuevoEstado } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
            });

            expect(resultados).toHaveLength(2);
            expect(resultados.every((r) => r.ok)).toBe(true);
            expect(resultados.find((r) => r.aparatoId === "aparato-1")?.resultado).toBe("ejecutado en Teléfono");
            expect(resultados.find((r) => r.aparatoId === "aparato-2")?.resultado).toBe("ejecutado en Tableta");
            // estado actualizado disponible
            expect(nuevoEstado.aparatos.find((a) => a.id === "aparato-1")?.estaControlado).toBe(true);
            expect(nuevoEstado.aparatos.find((a) => a.id === "aparato-2")?.estaControlado).toBe(true);
        });

        it("salta aparatos sin permiso y lo reporta", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: false, estaControlado: false });
            s = activarEspejo(s);

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { resultados } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
            });

            expect(resultados).toHaveLength(2);
            const r1 = resultados.find((r) => r.aparatoId === "aparato-1");
            const r2 = resultados.find((r) => r.aparatoId === "aparato-2");
            expect(r1?.ok).toBe(true);
            expect(r2?.ok).toBe(false);
            expect(r2?.motivo).toBe("sin-permiso");
            expect(r2?.saltado).toBe(true);
        });

        it("no ejecuta si el espejo no está activo", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            // No activar espejo

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { resultados } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
            });

            expect(resultados).toHaveLength(0);
        });

        it("ejecuta en aparato seleccionado individualmente aunque no haya espejo", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = seleccionarAparato(s, "aparato-1");

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { resultados } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
            });

            expect(resultados).toHaveLength(1);
            expect(resultados[0].aparatoId).toBe("aparato-1");
            expect(resultados[0].ok).toBe(true);
        });

        it("salta aparato seleccionado sin permiso", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: false, estaControlado: false });
            s = seleccionarAparato(s, "aparato-1");

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { resultados } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
            });

            expect(resultados).toHaveLength(1);
            expect(resultados[0].ok).toBe(false);
            expect(resultados[0].motivo).toBe("sin-permiso");
            expect(resultados[0].saltado).toBe(true);
        });

        it("actualiza estaControlado durante la ejecución", async () => {
            let s = agregarAparato(estado, { id: "aparato-1", nombre: "Teléfono", tienePermiso: true, estaControlado: false });
            s = agregarAparato(s, { id: "aparato-2", nombre: "Tableta", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);

            const orden = { accion: "toque", args: { x: 100, y: 200 } };
            const { estado: nuevoEstado } = await ejecutarEnEspejo(s, orden, async (aparato, ord) => {
                return { aparatoId: aparato.id, ok: true, resultado: "ok" };
            });

            expect(nuevoEstado.aparatos.find((a) => a.id === "aparato-1")?.estaControlado).toBe(true);
            expect(nuevoEstado.aparatos.find((a) => a.id === "aparato-2")?.estaControlado).toBe(true);
        });
    });
});