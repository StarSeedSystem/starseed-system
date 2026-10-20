import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PanelVinculos from "../panel-vinculos";
import { siguienteAprender, vinculoAprendido, aplicarCurva } from "@/lib/protomolecula/vinculos-control";
import { decidir } from "@/lib/protomolecula/permisos";
import { conectarGamepad } from "@/lib/protomolecula/adaptador-gamepad";
import type { Autor, CandidatoParametro } from "@/lib/protomolecula/tipos";

const autorPersona: Autor = { tipo: "persona", id: "u1", nombre: "Ana" };
const autorAgente: Autor = { tipo: "agente", id: "a1" };

const candidato: CandidatoParametro = {
  ref: { atomoId: "a1", parametroId: "p1" },
  parametro: { id: "p1", nombre: "Brillo", tipo: "numero", min: 0, max: 1 },
  atomo: "Luz",
};

describe("PanelVinculos", () => {
  const baseProps = {
    vinculos: [],
    candidatos: [candidato],
    autor: autorPersona,
    rol: "editor" as const,
    ambito: "personal" as const,
    ahora: () => Date.now(),
    nuevoId: () => "id-1",
    alCrear: vi.fn(),
  };

  it("muestra parámetro y botón Aprender", () => {
    const { getByText } = render(<PanelVinculos {...baseProps} />);
    expect(getByText("Brillo")).toBeTruthy();
    expect(getByText("Aprender")).toBeTruthy();
    cleanup();
  });

  it("aprende: iniciar y confirmar crea vínculo", () => {
    const alCrear = vi.fn();
    const { getByText } = render(<PanelVinculos {...baseProps} alCrear={alCrear} />);
    fireEvent.click(getByText("Aprender"));
    cleanup();
    const estado0 = { fase: "inactivo" as const };
    const e1 = siguienteAprender(estado0, { tipo: "empezar", objetivo: candidato.ref, ahora: 0 });
    const e2 = siguienteAprender(e1, { tipo: "entrada", fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 }, bruto: 0.1, ahora: 1 });
    const e3 = siguienteAprender(e2, { tipo: "entrada", fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 }, bruto: 0.3, ahora: 2 });
    const e4 = siguienteAprender(e3, { tipo: "entrada", fuente: { tipo: "gamepad", control: "eje", numero: 0, indice: 0 }, bruto: 0.5, ahora: 3 });
    expect(e4.fase).toBe("detectado");
    const vinculo = vinculoAprendido(e4 as any, candidato.parametro, "id-1", autorPersona.id);
    expect(vinculo.objetivo).toEqual(candidato.ref);
    expect(vinculo.modo).toBe("absoluto");
  });

  it("cancelar detiene aprendizaje", () => {
    const estado = { fase: "escuchando" as const, objetivo: candidato.ref, caduca: 1000, vistos: {} };
    const e = siguienteAprender(estado, { tipo: "cancelar" });
    expect(e.fase).toBe("cancelado");
  });

  it("IA propone vínculo requiere confirmación", () => {
    const d = decidir({ rol: "editor", origen: "agente", ambito: "personal", accion: "vincular-control" });
    expect(d.permitido).toBe(true);
    expect(d.confirmar).toBe(true);
  });

  it("persona vincula sin confirmación forzada", () => {
    const d = decidir({ rol: "editor", origen: "mano", ambito: "personal", accion: "vincular-control" });
    expect(d.permitido).toBe(true);
    expect(d.confirmar).toBe(false);
  });

  it("eje con zona muerta aplica curva", () => {
    const curva = { forma: "lineal" as const, invertir: false, zonaMuerta: 0.2, suavizado: 0 };
    const y = aplicarCurva(0.45, curva, true);
    expect(y).toBe(0.5);
    const y2 = aplicarCurva(0.9, curva, true);
    expect(y2).toBeGreaterThan(0.5);
  });

  it("sin gamepad no emite", () => {
    const emit = vi.fn();
    const stop = conectarGamepad(() => [], (cb) => 1, () => {}, emit);
    expect(emit).not.toHaveBeenCalled();
    stop();
  });

  it("muestra avisos de próximamente para HID/Serie/OSC", () => {
    const { getByText } = render(<PanelVinculos {...baseProps} />);
    expect(getByText(/HID: próximamente/)).toBeTruthy();
    expect(getByText(/Serie: próximamente/)).toBeTruthy();
    expect(getByText(/OSC: próximamente/)).toBeTruthy();
    cleanup();
  });
});
