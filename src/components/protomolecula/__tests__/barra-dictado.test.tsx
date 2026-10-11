import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DictationHandle, DictationOptions } from "@/lib/aurora/dictation";
import type { Operacion } from "@/lib/protomolecula/tipos";
import type { ResultadoDictado } from "@/lib/protomolecula/dictado";

import { BarraDictado, type MotorDictado } from "../barra-dictado";

/** Motor falso: sin voz real; el test dispara `opts` a mano. */
function motorFalso(soportado = true) {
  const stop = vi.fn();
  const caja: { opts: DictationOptions | null } = { opts: null };
  const motor: MotorDictado = {
    soportado: () => soportado,
    iniciar: (o) => {
      caja.opts = o;
      return { stop, active: () => true } as DictationHandle;
    },
  };
  return { motor, caja, stop };
}

const OP: Operacion = {
  id: "op1",
  objetivo: { atomoId: "reverb", parametroId: "mezcla" },
  accion: { tipo: "relativa", cantidad: 10, modo: "porcentaje-valor" },
  autor: { tipo: "persona", id: "u1" },
  origen: "dictado",
  t: 0,
};
const BIEN: ResultadoDictado = { ok: true, operacion: OP, resumen: "Reverberación: +10 %" };
const MAL: ResultadoDictado = {
  ok: false,
  razon: "No encuentro «reberberación».",
  sugerencia: "Prueba con «reverberación».",
  candidatos: ["reverberación", "resonancia"],
};

afterEach(() => cleanup());

describe("BarraDictado", () => {
  it("Enter llama a alDictar con la frase escrita", () => {
    const alDictar = vi.fn(() => [BIEN]);
    const { motor } = motorFalso();
    render(<BarraDictado alDictar={alDictar} motor={motor} />);
    const campo = screen.getByLabelText("Orden para la protomolécula");
    fireEvent.change(campo, { target: { value: "sube la reverberación un 10 %" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alDictar).toHaveBeenCalledWith("sube la reverberación un 10 %");
  });

  it("el botón Aplicar también aplica y limpia el campo", () => {
    const alDictar = vi.fn(() => [BIEN]);
    const { motor } = motorFalso();
    render(<BarraDictado alDictar={alDictar} motor={motor} />);
    const campo = screen.getByLabelText("Orden para la protomolécula") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "activa el eco" } });
    fireEvent.click(screen.getByText("Aplicar"));
    expect(alDictar).toHaveBeenCalledWith("activa el eco");
    expect(campo.value).toBe("");
  });

  it("el resultado FINAL del reconocimiento aplica la frase", () => {
    const alDictar = vi.fn(() => [BIEN]);
    const { motor, caja } = motorFalso();
    render(<BarraDictado alDictar={alDictar} motor={motor} />);
    fireEvent.click(screen.getByLabelText("Dictar por voz"));
    act(() => caja.opts?.onFinal?.("pon el brillo al máximo"));
    expect(alDictar).toHaveBeenCalledWith("pon el brillo al máximo");
  });

  it("un resultado ok pinta su resumen", () => {
    const alDictar = vi.fn(() => [BIEN]);
    render(<BarraDictado alDictar={alDictar} motor={motorFalso().motor} />);
    fireEvent.change(screen.getByLabelText("Orden para la protomolécula"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Aplicar"));
    expect(screen.getByRole("status").textContent).toContain("Reverberación: +10 %");
  });

  it("un fallo pinta razón, sugerencia, candidatos y «No he aplicado nada.»", () => {
    const alDictar = vi.fn(() => [MAL]);
    render(<BarraDictado alDictar={alDictar} motor={motorFalso().motor} />);
    fireEvent.change(screen.getByLabelText("Orden para la protomolécula"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Aplicar"));
    const zona = screen.getByRole("status");
    expect(zona.textContent).toContain("No he aplicado nada.");
    expect(zona.textContent).toContain("No encuentro «reberberación».");
    expect(zona.textContent).toContain("reverberación, resonancia");
  });

  it("sin soporte de voz el micrófono queda deshabilitado y se explica", () => {
    const alDictar = vi.fn(() => []);
    render(<BarraDictado alDictar={alDictar} motor={motorFalso(false).motor} />);
    expect((screen.getByLabelText("Dictar por voz") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Este navegador no ofrece dictado por voz/)).toBeDefined();
  });

  it("el parcial rellena el campo pero NO aplica", () => {
    const alDictar = vi.fn(() => [BIEN]);
    const { motor, caja } = motorFalso();
    render(<BarraDictado alDictar={alDictar} motor={motor} />);
    fireEvent.click(screen.getByLabelText("Dictar por voz"));
    act(() => caja.opts?.onInterim?.("sube la reve"));
    expect(alDictar).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Orden para la protomolécula") as HTMLInputElement).value).toBe("sube la reve");
  });

  it("al desmontar se detiene el reconocimiento", () => {
    const { motor, caja, stop } = motorFalso();
    const { unmount } = render(<BarraDictado alDictar={() => []} motor={motor} />);
    fireEvent.click(screen.getByLabelText("Dictar por voz"));
    expect(caja.opts).not.toBeNull();
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("los errores del micrófono se muestran en claro", () => {
    const { motor, caja } = motorFalso();
    render(<BarraDictado alDictar={() => []} motor={motor} />);
    fireEvent.click(screen.getByLabelText("Dictar por voz"));
    act(() => caja.opts?.onError?.("Permiso de micrófono denegado."));
    expect(screen.getByRole("alert").textContent).toContain("Permiso de micrófono denegado.");
  });
});
