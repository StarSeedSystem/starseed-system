/**
 * Pruebas del filtro de Astraura en el medidor de Imaginación (Ola 1102 · IMG1102A):
 * la pastilla y el detalle incluyen `filtro_astraura` con la cuenta de lo filtrado hoy.
 */
import { describe, expect, it } from "vitest";

import { AJUSTES_POR_DEFECTO, type PropuestaImaginacion } from "@/lib/mando/imaginacion-tipos";
import { detalleDeMedidor, pastillaImaginacion, type DatosMedidores } from "@/lib/mando/medidores";

const HOY = new Date(2026, 10, 4, 12, 0, 0);
const AYER = new Date(2026, 10, 3, 12).toISOString();
const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
    id: "p", fuente: "agentes", titulo: "t", cuerpo: "", archivos: [], utilidad: 0.7,
    importancia: "media", estado: "nueva", motivo: "", t: HOY.toISOString(), ...o,
});
const astrauraProp = (o: Partial<PropuestaImaginacion> = {}): PropuestaImaginacion => prop({
    ...o, fuente: "astraura", id: `astraura:${o.id ?? "c-1"}`, titulo: o.titulo ?? "Optimización ARM NEON",
});
const datos = (propuestas: PropuestaImaginacion[], ambito: NonNullable<DatosMedidores["imaginacion"]>["ambito"] = "metagenesis", filtro_astraura?: NonNullable<DatosMedidores["imaginacion"]>["filtro_astraura"]): DatosMedidores["imaginacion"] => ({
    propuestas, ajustes: AJUSTES_POR_DEFECTO, ambito, filtro_astraura,
});

const filtroEjemplo = {
    fecha: "2026-11-04",
    tope_dia: 3,
    ventana_dias: 7,
    vistas: 10,
    entran: 2,
    filtradas: { "familia repetida": 5, "tipo de archivo": 3, tope: 0 },
    autorizacion_inventada: 1,
};

describe("pastillaImaginacion con filtro_astraura", () => {
    it("incluye filtro_astraura cuando viene en los datos", () => {
        const p = pastillaImaginacion(datos([prop({ id: "a" }), astrauraProp({ id: "c-1" })], "metagenesis", filtroEjemplo), HOY.getTime());
        expect(p.filtro_astraura).toEqual(filtroEjemplo);
    });

    it("sin filtro_astraura en los datos → undefined", () => {
        const p = pastillaImaginacion(datos([prop({ id: "a" })], "metagenesis"), HOY.getTime());
        expect(p.filtro_astraura).toBeUndefined();
    });

    it("sin datos (null) → filtro_astraura undefined", () => {
        const p = pastillaImaginacion(null, HOY.getTime());
        expect(p.filtro_astraura).toBeUndefined();
    });

    it("ámbito vacío con filtro_astraura lo conserva", () => {
        const p = pastillaImaginacion(datos([], "metagenesis", filtroEjemplo), HOY.getTime());
        expect(p.filtro_astraura).toEqual(filtroEjemplo);
        expect(p.valor).toBe("sin propuestas");
    });
});

describe("detalleDeMedidor(«imaginacion») con filtro_astraura", () => {
    it("devuelve filtro_astraura en imaginacion del detalle", () => {
        const d = detalleDeMedidor("imaginacion", { imaginacion: datos([prop({ id: "a" }), astrauraProp({ id: "c-1" })], "metagenesis", filtroEjemplo) }, HOY.getTime());
        expect(d.imaginacion?.filtro_astraura).toEqual(filtroEjemplo);
    });

    it("sin filtro_astraura → undefined en el detalle", () => {
        const d = detalleDeMedidor("imaginacion", { imaginacion: datos([prop({ id: "a" })], "metagenesis") }, HOY.getTime());
        expect(d.imaginacion?.filtro_astraura).toBeUndefined();
    });

    it("sin datos → imaginacion con hayDatos false y filtro_astraura undefined", () => {
        const d = detalleDeMedidor("imaginacion", {}, HOY.getTime());
        expect(d.imaginacion?.hayDatos).toBe(false);
        expect(d.imaginacion?.filtro_astraura).toBeUndefined();
    });
});