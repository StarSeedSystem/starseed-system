import { describe, expect, it } from "vitest";
import {
  AJUSTES_POR_DEFECTO, NOMBRE_FUENTE, filasMedidor, resumenPastilla, validarAjustes,
  type PropuestaImaginacion,
} from "../imaginacion-tipos";

const HOY = new Date(2026, 9, 22, 12, 0, 0);
const prop = (o: Partial<PropuestaImaginacion>): PropuestaImaginacion => ({
  id: "p", fuente: "diaria", titulo: "t", cuerpo: "", archivos: [], utilidad: 0.7,
  importancia: "media", estado: "nueva", motivo: "", t: HOY.toISOString(), ...o,
});

describe("validarAjustes", () => {
  it("devuelve los defectos con basura y no los muta", () => {
    expect(validarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    validarAjustes({ rango: { max: 3 } }).fuentes.diaria = false;
    expect(AJUSTES_POR_DEFECTO.fuentes.diaria).toBe(true);
  });
  it("acota el rango y mantiene min <= max", () => {
    expect(validarAjustes({ rango: { min: 8, max: 3 } }).rango).toEqual({ min: 3, max: 3 });
    expect(validarAjustes({ rango: { min: -5, max: 99 } }).rango).toEqual({ min: 0, max: 10 });
    expect(validarAjustes({ rango: { min: true, max: 2.5 } }).rango).toEqual({ min: 0, max: 10 });
  });
  it("valida franjas: descarta las malas, admite lista vacía y ordena días", () => {
    const f = validarAjustes({ horario: { franjas: [{ dias: [3, 1, 1, 9], desde: "22:00", hasta: "02:00" }, { dias: [1], desde: "25:00", hasta: "02:00" }, { dias: [1], desde: "02:00", hasta: "02:00" }] } });
    expect(f.horario.franjas).toEqual([{ dias: [1, 3], desde: "22:00", hasta: "02:00" }]);
    expect(validarAjustes({ horario: { franjas: [] } }).horario.franjas).toEqual([]);
    expect(validarAjustes({ horario: { franjas: [{ dias: [], desde: "01:00", hasta: "02:00" }] } }).horario.franjas).toEqual(AJUSTES_POR_DEFECTO.horario.franjas);
  });
  it("modo, fuentes, automático y profunda", () => {
    const a = validarAjustes({ automatico: false, fuentes: { astraura: false, x: false }, horario: { modo: "franjas", repartir: false }, profunda: { cada_dias: 999 } });
    expect(a).toMatchObject({ automatico: false, fuentes: { astraura: false, diaria: true }, horario: { modo: "franjas", repartir: false }, profunda: { cada_dias: 365 } });
    expect(validarAjustes({ horario: { modo: "otro" } }).horario.modo).toBe("inteligente");
  });
});

describe("resumenPastilla", () => {
  const aj = validarAjustes({ rango: { min: 1, max: 4 } });
  it("cuenta lo que espera y lo autodesarrollado hoy", () => {
    const r = resumenPastilla([
      prop({ id: "a", estado: "esperando-aprobacion" }), prop({ id: "b", estado: "pregunta", importancia: "baja" }),
      prop({ id: "c", estado: "autodesarrollo" }), prop({ id: "d", estado: "autodesarrollo", t: new Date(2026, 9, 21, 12).toISOString() }),
      prop({ id: "e", estado: "hecha" }),
    ], aj, HOY);
    expect(r.texto).toBe("2 por aprobar · 1 autodesarrolladas hoy (rango 1–4)");
    expect(r.tono).toBe("atencion");
  });
  it("tono aviso con alta/crítica y ok sin nada", () => {
    expect(resumenPastilla([prop({ estado: "esperando-aprobacion", importancia: "crítica" })], aj, HOY).tono).toBe("aviso");
    expect(resumenPastilla([], aj, HOY)).toMatchObject({ tono: "ok", texto: "0 por aprobar · 0 autodesarrolladas hoy (rango 1–4)" });
  });
  it("ignora fechas ilegibles", () => {
    expect(resumenPastilla([prop({ estado: "autodesarrollo", t: "no-fecha" })], aj, HOY).autodesarrolladasHoy).toBe(0);
  });
});

describe("filasMedidor", () => {
  it("ordena: espera a Alex, luego importancia y utilidad", () => {
    const f = filasMedidor([
      prop({ id: "hecha", estado: "hecha", importancia: "crítica" }),
      prop({ id: "baja", estado: "esperando-aprobacion", importancia: "baja", utilidad: 0.9 }),
      prop({ id: "crit", estado: "pregunta", importancia: "crítica", utilidad: 0.6 }),
      prop({ id: "media2", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.9 }),
      prop({ id: "media1", estado: "esperando-aprobacion", importancia: "media", utilidad: 0.6 }),
    ]);
    expect(f.map((x) => x.id)).toEqual(["crit", "media2", "media1", "baja", "hecha"]);
  });
  it("acciones según estado y nombre legible de la fuente", () => {
    const [a, b, c] = filasMedidor([
      prop({ id: "1", estado: "esperando-aprobacion", fuente: "astraura" }),
      prop({ id: "2", estado: "pospuesta" }), prop({ id: "3", estado: "hecha", tarea: "T1" }),
    ]);
    expect(a.acciones).toEqual(["aprobar", "rechazar", "posponer", "ver-origen"]);
    expect(a.fuente).toBe("Procesos imaginativos de Astraura");
    expect(b.acciones).toContain("aprobar");
    expect(c).toMatchObject({ acciones: ["ver-origen"], tarea: "T1", esperaAlex: false });
    expect(NOMBRE_FUENTE.directores).toBe("Directores");
  });
});
