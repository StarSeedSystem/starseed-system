import { describe, it, expect } from "vitest";
import {
    AJUSTES_POR_DEFECTO, NOMBRE_FUENTE, filasMedidor, resumenPastilla, validarAjustes,
    type PropuestaImaginacion,
} from "@/lib/mando/imaginacion-tipos";

const hoy = new Date(2026, 9, 22, 12, 0, 0);
const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
    id: "p", fuente: "diaria", titulo: "t", cuerpo: "", archivos: [], utilidad: 0.5,
    importancia: "baja", estado: "nueva", motivo: "", t: new Date(2026, 9, 22, 3).toISOString(), ...o,
});

describe("validarAjustes", () => {
    it("devuelve los defectos con basura y no los muta", () => {
        expect(validarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
        validarAjustes({ rango: { max: 3 } }).horario.franjas.pop();
        expect(AJUSTES_POR_DEFECTO.horario.franjas).toHaveLength(1);
    });
    it("acota el rango y ordena min ≤ max", () => {
        expect(validarAjustes({ rango: { min: 8, max: 3 } }).rango).toEqual({ min: 3, max: 3 });
        expect(validarAjustes({ rango: { min: -4, max: 99 } }).rango).toEqual({ min: 0, max: 10 });
        expect(validarAjustes({ rango: { min: true, max: 2.5 } }).rango).toEqual({ min: 0, max: 10 });
    });
    it("valida franjas: descarta inválidas, admite vacío, conserva si todas son inválidas", () => {
        const f = validarAjustes({ horario: { modo: "franjas", franjas: [{ dias: [2, 2, 9, 0], desde: "22:00", hasta: "06:00" }, { dias: [1], desde: "7:00", hasta: "8:00" }] } });
        expect(f.horario.franjas).toEqual([{ dias: [0, 2], desde: "22:00", hasta: "06:00" }]);
        expect(validarAjustes({ horario: { franjas: [] } }).horario.franjas).toEqual([]);
        expect(validarAjustes({ horario: { franjas: [{ dias: [], desde: "01:00", hasta: "02:00" }] } }).horario.franjas).toEqual(AJUSTES_POR_DEFECTO.horario.franjas);
        expect(validarAjustes({ horario: { modo: "otro" } }).horario.modo).toBe("inteligente");
    });
    it("fuentes, automático y profunda", () => {
        const a = validarAjustes({ automatico: false, fuentes: { diaria: false, x: false }, profunda: { cada_dias: 0 } });
        expect(a.automatico).toBe(false);
        expect(a.fuentes).toEqual({ diaria: false, profunda: true, astraura: true, directores: true });
        expect(a.profunda.cada_dias).toBe(0);
        expect(validarAjustes({ profunda: { cada_dias: 9999 } }).profunda.cada_dias).toBe(365);
    });
});

describe("resumenPastilla", () => {
    it("todo en calma", () => {
        expect(resumenPastilla([], AJUSTES_POR_DEFECTO, hoy)).toEqual({ texto: "0 por aprobar · 0 autodesarrolladas hoy (rango 0–10)", tono: "ok" });
    });
    it("cuenta por aprobar y autodesarrolladas de hoy, no las de otro día ni sin tarea", () => {
        const ps = [
            prop({ id: "a", estado: "esperando-aprobacion", importancia: "media" }),
            prop({ id: "b", estado: "pregunta" }),
            prop({ id: "c", estado: "autodesarrollo", tarea: "IMN1" }),
            prop({ id: "d", estado: "hecha", tarea: "IMN2" }),
            prop({ id: "e", estado: "hecha", tarea: "IMN3", t: new Date(2026, 9, 21, 3).toISOString() }),
            prop({ id: "f", estado: "autodesarrollo" }),
            prop({ id: "g", estado: "pospuesta" }),
        ];
        const r = resumenPastilla(ps, validarAjustes({ rango: { min: 2, max: 5 } }), hoy);
        expect(r.texto).toBe("2 por aprobar · 2 autodesarrolladas hoy (rango 2–5)");
        expect(r.tono).toBe("pendiente");
    });
    it("tono de atención con algo alto o crítico esperando", () => {
        expect(resumenPastilla([prop({ estado: "esperando-aprobacion", importancia: "critica" })], AJUSTES_POR_DEFECTO, hoy).tono).toBe("atencion");
    });
});

describe("filasMedidor", () => {
    it("ordena lo que espera a Alex primero, por importancia y utilidad", () => {
        const ps = [
            prop({ id: "hecha", estado: "hecha", importancia: "critica", utilidad: 1 }),
            prop({ id: "baja", estado: "pregunta", importancia: "baja", utilidad: 0.9 }),
            prop({ id: "crit", estado: "esperando-aprobacion", importancia: "critica", utilidad: 0.2 }),
            prop({ id: "alta-u", estado: "esperando-aprobacion", importancia: "alta", utilidad: 0.9 }),
            prop({ id: "alta-l", estado: "esperando-aprobacion", importancia: "alta", utilidad: 0.3 }),
        ];
        const copia = ps.map((p) => p.id);
        expect(filasMedidor(ps).map((f) => f.id)).toEqual(["crit", "alta-u", "alta-l", "baja", "hecha"]);
        expect(ps.map((p) => p.id)).toEqual(copia);
    });
    it("acciones según el estado y nombre legible de la fuente", () => {
        const [a, b] = filasMedidor([prop({ id: "a", estado: "esperando-aprobacion", fuente: "astraura" }), prop({ id: "b", estado: "hecha" })]);
        expect(a.acciones).toEqual(["aprobar", "rechazar", "posponer", "ver-origen"]);
        expect(a.fuente).toBe("Procesos imaginativos de Astraura");
        expect(b.acciones).toEqual(["ver-origen"]);
        expect(b.esperaAAlex).toBe(false);
        expect(Object.values(NOMBRE_FUENTE)).toEqual(["Imaginación diaria", "Imaginación profunda", "Procesos imaginativos de Astraura", "Directores"]);
    });
});
