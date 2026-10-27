import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import AppError from "../error";
import { CLAVE_RECARGA } from "@/lib/pwa/recarga-por-version";

describe("error de página · recarga por versión nueva", () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("un error de trozo de versión nueva no rompe el montaje y deja anotada la recarga", () => {
    expect(() => {
      render(<AppError error={new Error("ChunkLoadError: trozo ausente")} reset={() => undefined} />);
    }).not.toThrow();
    expect(window.sessionStorage.getItem(CLAVE_RECARGA)).toBeTruthy();
  });
});
