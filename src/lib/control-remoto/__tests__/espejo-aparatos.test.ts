/**
 * CTL1126F-d3 · espejo-aparatos: varios aparatos de una neurona
 * Cada aparato se controla en su ventana o pestaña; el «modo espejo» repite las
 * mismas órdenes en todos a la vez. Se prueba con dos aparatos falsos: selección,
 * pestañas y espejo, y que el que no tiene permiso se salta y se reporta.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    activarEspejo,
    agregarAparato,
    crearEstadoEspejo,
    desactivarEspejo,
    ejecutarEnEspejo,
    quitarAparato,
    seleccionarAparato,
    tipoEspejo,
    type AparatoEspejo,
    type EstadoEspejo,
    type OrdenEspejo,
} from "../espejo-aparatos";

const TELEFONO: AparatoEspejo = {
    id: "aparato-telefono",
    nombre: "Teléfono",
    tienePermiso: true,
    estaControlado: false,
};

const TABLETA: AparatoEspejo = {
    id: "aparato-tableta",
    nombre: "Tableta",
    tienePermiso: true,
    estaControlado: false,
};

const TOQUE: OrdenEspejo = { accion: "toque", args: { x: 100, y: 200 } };

function conDosAparatos(): EstadoEspejo {
    let s = crearEstadoEspejo();
    s = agregarAparato(s, TELEFONO);
    s = agregarAparato(s, TABLETA);
    return s;
}

function ejecutorFalso(vistos: string[] = []) {
    return async (aparato: AparatoEspejo) => {
        vistos.push(aparato.id);
        return { aparatoId: aparato.id, ok: true, resultado: `ejecutado en ${aparato.nombre}` };
    };
}

describe("CTL1126F-d3 · espejo-aparatos", () => {
    let estado: EstadoEspejo;

    beforeEach(() => {
        estado = crearEstadoEspejo();
    });

    it("declara el tipo de contrato del espejo", () => {
        expect(tipoEspejo).toBe("espejo-aparatos.v1");
    });

    it("arranca sin aparatos, sin espejo y sin selección", () => {
        expect(estado.aparatos).toEqual([]);
        expect(estado.espejoActivo).toBe(false);
        expect(estado.aparatoSeleccionado).toBeNull();
    });

    describe("agregarAparato", () => {
        it("agrega un aparato y lo deja sin controlar", () => {
            const s = agregarAparato(estado, { ...TELEFONO, estaControlado: true });
            expect(s.aparatos).toHaveLength(1);
            expect(s.aparatos[0]).toMatchObject({ id: TELEFONO.id, nombre: "Teléfono" });
            expect(s.aparatos[0].estaControlado).toBe(false);
        });

        it("agrega los dos aparatos de la neurona", () => {
            const s = conDosAparatos();
            expect(s.aparatos.map((a) => a.id)).toEqual([TELEFONO.id, TABLETA.id]);
        });

        it("no duplica un aparato con el mismo id", () => {
            let s = agregarAparato(estado, TELEFONO);
            s = agregarAparato(s, { ...TELEFONO, nombre: "Teléfono duplicado", tienePermiso: false });
            expect(s.aparatos).toHaveLength(1);
            expect(s.aparatos[0].nombre).toBe("Teléfono");
        });
    });

    describe("quitarAparato", () => {
        it("quita solo el aparato pedido", () => {
            const s = quitarAparato(conDosAparatos(), TELEFONO.id);
            expect(s.aparatos.map((a) => a.id)).toEqual([TABLETA.id]);
        });

        it("limpia la selección si se quita el aparato seleccionado", () => {
            let s = conDosAparatos();
            s = seleccionarAparato(s, TELEFONO.id);
            expect(s.aparatoSeleccionado).toBe(TELEFONO.id);
            s = quitarAparato(s, TELEFONO.id);
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("desactiva el espejo si al quitar queda menos de dos aparatos", () => {
            let s = activarEspejo(conDosAparatos());
            expect(s.espejoActivo).toBe(true);
            s = quitarAparato(s, TELEFONO.id);
            expect(s.espejoActivo).toBe(false);
        });

        it("mantiene el espejo si todavía quedan dos aparatos", () => {
            let s = conDosAparatos();
            s = agregarAparato(s, { id: "aparato-portatil", nombre: "Portátil", tienePermiso: true, estaControlado: false });
            s = activarEspejo(s);
            s = quitarAparato(s, TELEFONO.id);
            expect(s.aparatos).toHaveLength(2);
            expect(s.espejoActivo).toBe(true);
        });
    });

    describe("seleccionarAparato", () => {
        it("selecciona un aparato de la neurona", () => {
            const s = seleccionarAparato(conDosAparatos(), TABLETA.id);
            expect(s.aparatoSeleccionado).toBe(TABLETA.id);
        });

        it("vuelve a «ninguno» cuando se pasa null", () => {
            let s = seleccionarAparato(conDosAparatos(), TELEFONO.id);
            s = seleccionarAparato(s, null);
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("no selecciona un aparato que no existe", () => {
            const s = seleccionarAparato(conDosAparatos(), "aparato-fantasma");
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("desactiva el espejo al pasar a una pestaña concreta", () => {
            let s = activarEspejo(conDosAparatos());
            expect(s.espejoActivo).toBe(true);
            s = seleccionarAparato(s, TELEFONO.id);
            expect(s.espejoActivo).toBe(false);
            expect(s.aparatoSeleccionado).toBe(TELEFONO.id);
        });
    });

    describe("activarEspejo / desactivarEspejo", () => {
        it("activa el espejo con dos aparatos y quita la pestaña concreta", () => {
            let s = seleccionarAparato(conDosAparatos(), TELEFONO.id);
            s = activarEspejo(s);
            expect(s.espejoActivo).toBe(true);
            expect(s.aparatoSeleccionado).toBeNull();
        });

        it("no activa el espejo con un solo aparato", () => {
            const s = activarEspejo(agregarAparato(estado, TELEFONO));
            expect(s.espejoActivo).toBe(false);
        });

        it("desactiva el espejo sin tocar la lista de aparatos", () => {
            const s = desactivarEspejo(activarEspejo(conDosAparatos()));
            expect(s.espejoActivo).toBe(false);
            expect(s.aparatos).toHaveLength(2);
        });
    });

    describe("pestañas: cada aparato en su ventana", () => {
        it("con el teléfono en su pestaña, la orden no toca la tableta", async () => {
            const vistos: string[] = [];
            let s = conDosAparatos();
            s = seleccionarAparato(s, TELEFONO.id);

            const { resultados } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([TELEFONO.id]);
            expect(resultados).toHaveLength(1);
            expect(resultados[0].aparatoId).toBe(TELEFONO.id);
        });

        it("al cambiar a la pestaña de la tableta, la orden va solo a ella", async () => {
            const vistos: string[] = [];
            let s = conDosAparatos();
            s = seleccionarAparato(s, TELEFONO.id);
            s = seleccionarAparato(s, TABLETA.id);

            const { resultados } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([TABLETA.id]);
            expect(resultados.map((r) => r.aparatoId)).toEqual([TABLETA.id]);
        });

        it("sin pestaña elegida ni espejo, la orden no se ejecuta en ninguno", async () => {
            const vistos: string[] = [];
            const { resultados } = await ejecutarEnEspejo(conDosAparatos(), TOQUE, ejecutorFalso(vistos));
            expect(vistos).toEqual([]);
            expect(resultados).toEqual([]);
        });

        it("cada pestaña conserva el aviso de control solo en el aparato usado", async () => {
            let s = conDosAparatos();
            s = seleccionarAparato(s, TELEFONO.id);
            const { estado: trasTelefono } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso());

            const telefono = trasTelefono.aparatos.find((a) => a.id === TELEFONO.id);
            const tableta = trasTelefono.aparatos.find((a) => a.id === TABLETA.id);
            expect(telefono?.estaControlado).toBe(true);
            expect(tableta?.estaControlado).toBe(false);
        });
    });

    describe("modo espejo: la misma orden en todos a la vez", () => {
        it("ejecuta la orden en los dos aparatos de la neurona", async () => {
            const vistos: string[] = [];
            const s = activarEspejo(conDosAparatos());

            const { resultados } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([TELEFONO.id, TABLETA.id]);
            expect(resultados).toHaveLength(2);
            expect(resultados.every((r) => r.ok)).toBe(true);
            expect(resultados.map((r) => r.resultado)).toEqual([
                "ejecutado en Teléfono",
                "ejecutado en Tableta",
            ]);
        });

        it("pasa la misma orden a cada aparato", async () => {
            const recibidas: OrdenEspejo[] = [];
            const s = activarEspejo(conDosAparatos());

            await ejecutarEnEspejo(s, TOQUE, async (aparato, orden) => {
                recibidas.push(orden);
                return { aparatoId: aparato.id, ok: true };
            });

            expect(recibidas).toHaveLength(2);
            expect(recibidas[0]).toEqual(TOQUE);
            expect(recibidas[1]).toEqual(TOQUE);
        });

        it("marca como controlados los dos aparatos que ejecutaron", async () => {
            const s = activarEspejo(conDosAparatos());
            const { estado: nuevo } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso());

            expect(nuevo.aparatos.every((a) => a.estaControlado)).toBe(true);
        });

        it("salta el aparato sin permiso, no lo ejecuta y lo dice", async () => {
            const vistos: string[] = [];
            let s = agregarAparato(estado, TELEFONO);
            s = agregarAparato(s, { ...TABLETA, tienePermiso: false });
            s = activarEspejo(s);

            const { resultados, estado: nuevo } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([TELEFONO.id]);
            const saltado = resultados.find((r) => r.aparatoId === TABLETA.id);
            expect(saltado).toMatchObject({ ok: false, motivo: "sin-permiso", saltado: true });
            expect(nuevo.aparatos.find((a) => a.id === TABLETA.id)?.estaControlado).toBe(false);
            expect(nuevo.aparatos.find((a) => a.id === TELEFONO.id)?.estaControlado).toBe(true);
        });

        it("salta el aparato sin permiso también cuando es la pestaña elegida", async () => {
            const vistos: string[] = [];
            let s = agregarAparato(estado, { ...TELEFONO, tienePermiso: false });
            s = seleccionarAparato(s, TELEFONO.id);

            const { resultados } = await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([]);
            expect(resultados).toHaveLength(1);
            expect(resultados[0]).toMatchObject({ aparatoId: TELEFONO.id, ok: false, motivo: "sin-permiso", saltado: true });
        });

        it("el espejo manda a todos aunque antes hubiera una pestaña elegida", async () => {
            const vistos: string[] = [];
            let s = conDosAparatos();
            s = seleccionarAparato(s, TABLETA.id);
            s = activarEspejo(s);

            await ejecutarEnEspejo(s, TOQUE, ejecutorFalso(vistos));

            expect(vistos).toEqual([TELEFONO.id, TABLETA.id]);
        });
    });
});
