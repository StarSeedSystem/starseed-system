import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DisenoMinimo } from "../diseno-minimo";

describe("DisenoMinimo", () => {
  it("renderiza el componente con estado", () => {
    const { getByText } = render(
      <DisenoMinimo 
        estado="calma" 
        tam={64} 
        preguntar="¿En qué puedo ayudarte?" 
      />
    );
    expect(getByText(/en calma/i)).toBeDefined();
    expect(getByText("¿En qué puedo ayudarte?")).toBeDefined();
  });

  it("no incluye hilo ni sugerencias", () => {
    const { queryByTestId } = render(
      <DisenoMinimo 
        estado="calma" 
        tam={64} 
        preguntar="¿En qué puedo ayudarte?" 
      />
    );
    expect(queryByTestId("hilo-conversacion")).toBeNull();
    expect(queryByTestId("sugerencias")).toBeNull();
  });
});
