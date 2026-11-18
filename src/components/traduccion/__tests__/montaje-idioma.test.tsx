import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MontajeIdioma } from "../montaje-idioma";
import { AccountProvider } from "@/context/account-context";
import "@testing-library/jest-dom/vitest";

describe("MontajeIdioma", () => {
  it("se monta sin errores", () => {
    const { container } = render(
      <AccountProvider>
        <MontajeIdioma />
      </AccountProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
