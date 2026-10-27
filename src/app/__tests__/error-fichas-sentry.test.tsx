import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import AppError from "../error";
import { CLAVE_RECARGA } from "@/lib/pwa/recarga-por-version";

describe("AppError · recarga por versión nueva", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("un error de trozo no rompe el montaje y deja anotada la recarga por versión", () => {
    expect(() => {
      render(<AppError error={new Error("ChunkLoadError: trozo ausente")} reset={() => undefined} />);
    }).not.toThrow();
    expect(window.sessionStorage.getItem(CLAVE_RECARGA)).toBeTruthy();
  });
});
