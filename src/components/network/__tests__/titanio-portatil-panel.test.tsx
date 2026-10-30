// @vitest-environment jsdom
/**
 * TitanioPortatilPanel (§8.1 de architecture/malla-cristalina-sio2.md):
 * un MiFi de operador enseña la alternativa honesta (su internet entra por
 * un titanio compatible) y el selector de compartir arranca en «nadie».
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TitanioPortatilPanel } from "@/components/network/titanio-portatil-panel";

afterEach(() => {
  cleanup();
});

describe("TitanioPortatilPanel", () => {
  it("un MiFi de operador muestra la alternativa y el selector de compartir arranca en «nadie»", () => {
    render(<TitanioPortatilPanel />);
    fireEvent.change(screen.getByLabelText("Tipo de router portátil"), { target: { value: "mifi-operador" } });

    expect(screen.getByText(/Este MiFi no se formatea/)).toBeTruthy();
    expect(screen.getByText(/titanio compatible/)).toBeTruthy();
    const compartir = screen.getByLabelText("Se comparte con") as HTMLSelectElement;
    expect(compartir.value).toBe("nadie");
  });

  it("los avisos fijos de contrato y PIN están siempre a la vista", () => {
    render(<TitanioPortatilPanel />);
    expect(screen.getByText(/Algunas operadoras no permiten compartir los datos de tu línea/)).toBeTruthy();
    expect(screen.getByText("StarSeed no pide ni guarda el PIN de tu SIM.")).toBeTruthy();
    expect(screen.getByText("Puerta a internet (opcional)")).toBeTruthy();
  });
});
