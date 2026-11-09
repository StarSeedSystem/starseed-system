import { describe, expect, it } from "vitest";

import { estadoSense } from "@/lib/senses/senses";

describe("estadoSense · vocabulario del contrato → catálogo de sentidos", () => {
  it("concede, deniega y pregunta con las palabras antiguas", () => {
    expect(estadoSense("concedido")).toBe("granted");
    expect(estadoSense("denegado")).toBe("denied");
    expect(estadoSense("preguntar")).toBe("prompt");
  });

  it("no disponible pasa a unsupported", () => {
    expect(estadoSense("no-disponible")).toBe("unsupported");
  });
});
