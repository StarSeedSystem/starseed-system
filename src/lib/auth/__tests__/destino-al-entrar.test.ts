/** ACC1025A · a dónde se va tras entrar: `?next=` seguro > destino de la ventana > página principal. */
import { describe, expect, it } from "vitest";
import { destinoTrasEntrar } from "../destino-al-entrar";

describe("destinoTrasEntrar", () => {
  it("sin ?next= y sin destino: la página principal", () => {
    expect(destinoTrasEntrar("", undefined)).toBe("/");
    expect(destinoTrasEntrar("?otro=1", undefined)).toBe("/");
  });

  it("null: se queda donde está", () => {
    expect(destinoTrasEntrar("", null)).toBeNull();
  });

  it("una ruta dada se respeta", () => {
    expect(destinoTrasEntrar("", "/escritorios")).toBe("/escritorios");
  });

  it("un ?next= válido manda sobre todo, también sobre «quedarse»", () => {
    expect(destinoTrasEntrar("?next=%2Fllamada%2Fabc", undefined)).toBe("/llamada/abc");
    expect(destinoTrasEntrar("?next=%2Fvivo%2F1%3Ft%3D2", null)).toBe("/vivo/1?t=2");
    expect(destinoTrasEntrar("?next=/llamada/abc", "/escritorios")).toBe("/llamada/abc");
  });

  it("un ?next= peligroso se ignora", () => {
    expect(destinoTrasEntrar("?next=//otra.web", undefined)).toBe("/");
    expect(destinoTrasEntrar("?next=https://otra.web", null)).toBeNull();
    expect(destinoTrasEntrar("?next=/api/secreto", "/escritorios")).toBe("/escritorios");
    expect(destinoTrasEntrar("?next=/login", undefined)).toBe("/");
  });
});
