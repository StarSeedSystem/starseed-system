import { describe, expect, it } from "vitest";
import type { DecisionEncuentro } from "@/lib/nfc/decidir";
import { botonesDe } from "@/lib/nfc/encuentros";
import { enlaceBoton, notificacionDeEncuentro } from "../encuentro-nfc";

const base = {
  relacion: "cuenta_nueva",
  mostrar: true,
  aviso: "notificar",
  perfil: { tipo: "anonimo" },
  automaticas: [],
  ofrecidas: ["anadir_contacto", "mandar_mensaje"],
  ubicacion: "no",
} as unknown as DecisionEncuentro;

describe("notificacionDeEncuentro", () => {
  it("lleva los mismos botones que la hoja, en el mismo orden", () => {
    const n = notificacionDeEncuentro(base, "nfc", "n1@1")!;
    expect(n.actions.map((a) => a.label)).toEqual(botonesDe(base).map((b) => b.etiqueta));
    expect(n.actions[0].href).toBe(enlaceBoton("n1@1", "anadir_contacto"));
  });
  it("no avisa si está silenciada o ignorada", () => {
    expect(notificacionDeEncuentro({ ...base, aviso: "silenciar" }, "ble", "x")).toBeNull();
    expect(notificacionDeEncuentro({ ...base, mostrar: false }, "qr", "x")).toBeNull();
  });
});
