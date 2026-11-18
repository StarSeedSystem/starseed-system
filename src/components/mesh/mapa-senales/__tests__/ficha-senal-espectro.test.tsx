/** La ficha enseña toda la información de la señal, «sin dato» en lo que falta y opciones que solo delegan en `onAccion`. */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Compatibilidad, SenalEspectro } from "@/lib/senales/espectro/tipos";
import { FichaSenalEspectro } from "../ficha-senal-espectro";

const OPCION_WIFI: Compatibilidad = {
  con: "wifi",
  que: "enlazar por Wi-Fi",
  posible: true,
  motivo: "este aparato declara radio Wi-Fi que el sistema deja usar",
};

const OPCION_SDR: Compatibilidad = {
  con: "sdr",
  que: "escuchar la señal con un SDR",
  posible: false,
  motivo: "este aparato no tiene un SDR para escuchar esa banda",
};

const COMPLETA: SenalEspectro = {
  id: "wifi:1", medio: "wifi", banda: "wifi-2.4",
  frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -58, calidad: 82,
  origen: "medida", capa: "publica", fuente: "escaneo de Wi-Fi del sistema",
  medidoEn: new Date(2026, 0, 1, 14, 32).getTime(),
  zona: "casa", vinculo: { tipo: "antena", id: "wifi" },
  compatibles: [OPCION_WIFI, OPCION_SDR],
};

const SIN_DATOS: SenalEspectro = {
  id: "lora:2", medio: "lora", banda: "lora-868",
  frecuenciaKhz: null, anchoKhz: null, fuerzaDbm: null, calidad: null,
  origen: "estimada", capa: "externa", fuente: "modelo log-distancia",
  medidoEn: null, zona: null, compatibles: [],
};

afterEach(() => cleanup());

describe("ficha de una señal del espectro", () => {
  test("una señal medida completa enseña sus valores legibles, su origen y su vínculo", () => {
    render(<FichaSenalEspectro senal={COMPLETA} onAccion={vi.fn()} />);
    expect(screen.getByText("2,437 GHz")).toBeInTheDocument(); // frecuencia legible
    expect(screen.getByText("20,0 MHz")).toBeInTheDocument(); // ancho legible
    expect(screen.getByText("-58 dBm")).toBeInTheDocument();
    expect(screen.getByText("82 %")).toBeInTheDocument();
    expect(screen.getByText("medida a las 14:32")).toBeInTheDocument();
    expect(screen.getByText("pública")).toBeInTheDocument();
    expect(screen.getByText("casa")).toBeInTheDocument();
    expect(screen.getByText("escaneo de Wi-Fi del sistema")).toBeInTheDocument();
    expect(screen.getByText("antena wifi")).toBeInTheDocument();
  });

  test("lo que falta se enseña «sin dato», nunca 0", () => {
    render(<FichaSenalEspectro senal={SIN_DATOS} onAccion={vi.fn()} />);
    for (const etiqueta of ["Frecuencia", "Ancho", "Fuerza", "Calidad", "Zona aproximada", "Vínculo"]) {
      const fila = screen.getByText(etiqueta).closest("[data-fila]");
      expect(fila).not.toBeNull();
      expect(within(fila as HTMLElement).getByText("sin dato")).toBeInTheDocument();
      expect(within(fila as HTMLElement).queryByText("0")).not.toBeInTheDocument();
    }
  });

  test("una opción no posible enseña su motivo y no tiene botón", () => {
    render(<FichaSenalEspectro senal={COMPLETA} onAccion={vi.fn()} />);
    expect(screen.getByText(OPCION_SDR.motivo)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: OPCION_SDR.que })).not.toBeInTheDocument();
  });

  test("el botón de una opción posible SOLO llama a onAccion con esa opción", () => {
    const onAccion = vi.fn();
    render(<FichaSenalEspectro senal={COMPLETA} onAccion={onAccion} />);
    fireEvent.click(screen.getByRole("button", { name: OPCION_WIFI.que }));
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onAccion).toHaveBeenCalledWith(OPCION_WIFI);
  });
});
