// @vitest-environment jsdom
/**
 * TitanioPortatilPanel (§8.1): un MiFi de operador muestra la alternativa
 * honesta (su internet entra en la malla a través de un titanio compatible) y
 * el selector «Con quién se comparte» arranca en «nadie».
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TitanioPortatilPanel } from "@/components/network/titanio-portatil-panel";

afterEach(() => {
  cleanup();
});

describe("TitanioPortatilPanel", () => {
  it("un MiFi de operador muestra la alternativa y el selector de compartir arranca en «nadie»", () => {
    render(<TitanioPortatilPanel base={{ fabricante: "ZTE", modelo: "MF920", deOperador: true }} />);
    fireEvent.change(screen.getByLabelText(/Tipo de router portátil/), { target: { value: "mifi-operador" } });
    expect(screen.getByText(/Este MiFi no se formatea, pero su internet entra en la malla a través /)).toBeTruthy();
    expect(screen.getByText(/Declara su internet como «PuertaInternet»/)).toBeTruthy();
    const compartir = screen.getByLabelText(/Con quién se comparte/) as HTMLSelectElement;
    expect(compartir.value).toBe("nadie");
    expect(screen.getByText(/Algunas operadoras no permiten compartir los datos de tu línea/)).toBeTruthy();
    expect(screen.getByText(/StarSeed no pide ni guarda el PIN de tu SIM/)).toBeTruthy();
  });

  it("la coordinación sale de la batería y el resumen sin SIM dice la verdad", () => {
    render(<TitanioPortatilPanel />);
    expect(screen.getByText(/Coordinación que tendrá como titanio: 6 enlaces/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Batería \(%\)/), { target: { value: "30" } });
    expect(screen.getByText(/Coordinación que tendrá como titanio: 4 enlaces/)).toBeTruthy();
    expect(screen.getByText(/Sin SIM este portátil es un titanio igual/)).toBeTruthy();
  });
});
