// @vitest-environment jsdom
/**
 * TitanioPortatilPanel (§8.1 de architecture/malla-cristalina-sio2.md):
 * un MiFi de operador se enseña como «bloqueado-operador» con la alternativa
 * honesta (su internet entra por un titanio compatible) y el selector de
 * con quién se comparte la puerta arranca en «nadie», que es la regla del
 * contrato (compartir nunca por defecto).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { TitanioPortatilPanel } from "@/components/network/titanio-portatil-panel";

afterEach(() => {
  cleanup();
});

describe("TitanioPortatilPanel", () => {
  test("un MiFi de operador muestra la alternativa y el selector de compartir arranca en «nadie»", () => {
    render(<TitanioPortatilPanel tipoInicial="mifi-operador" fabricante="Vodafone" modelo="R218" />);
    expect(screen.getByText("Estado: bloqueado-operador")).toBeTruthy();
    expect(screen.getByText(/su internet entra en la malla a través de un titanio compatible/)).toBeTruthy();
    const compartir = screen.getByLabelText("¿Con quién se comparte?") as HTMLSelectElement;
    expect(compartir.value).toBe("nadie");
    expect(screen.getByText(/StarSeed no pide ni guarda el PIN de tu SIM/)).toBeTruthy();
  });

  test("sin SIM se enseña la alternativa real: la malla va por los radios Wi‑Fi", () => {
    render(<TitanioPortatilPanel />);
    expect(screen.getByText(/Sin SIM este portátil es un titanio igual/)).toBeTruthy();
    expect(screen.getByText(/Puerta a internet \(opcional\)/)).toBeTruthy();
  });
});
