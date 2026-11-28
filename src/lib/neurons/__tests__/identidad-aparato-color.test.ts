import { describe, expect, it } from "vitest";
import {
  aparatosDe,
  colorAparatoDe,
  entradaViva,
  estadoSyncAparato,
  idUnicoPorDefecto,
  leerMapaAparatos,
} from "../aparatos-de-neurona";
import { revisarIdentidadCompartida } from "../revision-identidad";

describe("identidad de neurona (apellido) y aparato (ID único, color y sync)", () => {
  const ahora = 1_750_000_000_000;

  it("conserva y lee idUnico, color, huella y estadoSync en capabilities.aparatos", () => {
    const entrada = entradaViva(
      {
        nombre: "Móvil de bolsillo",
        idUnico: "pixel-bolsillo-01",
        color: "#0091FF",
        huella: "hw-android-phone-99",
        syncEstado: "pendiente",
        syncPendientes: 3,
        medio: "app-nativa",
        so: "Android",
        equipo: "Pixel 8",
      },
      ahora,
    );

    const lista = aparatosDe({ aparatos: { "sync_phone_1": entrada } });
    expect(lista).toHaveLength(1);
    expect(lista[0].idUnico).toBe("pixel-bolsillo-01");
    expect(lista[0].color).toBe("#0091ff");
    expect(lista[0].huella).toBe("hw-android-phone-99");
    expect(colorAparatoDe(lista[0])).toBe("#0091ff");

    const sync = estadoSyncAparato(lista[0], { ahora });
    expect(sync.estado).toBe("pendiente");
    expect(sync.pendientes).toBe(3);
  });

  it("genera color e ID único deterministas cuando el aparato aún no los personalizó", () => {
    const mapa = leerMapaAparatos({
      aparatos: {
        sync_tablet_01: { n: "Maggaboard", so: "Android", ts: ahora - 10_000 },
      },
    });
    const lista = aparatosDe({ aparatos: mapa });
    expect(lista).toHaveLength(1);
    expect(colorAparatoDe(lista[0])).toMatch(/^#[0-9a-f]{6}$/);
    expect(idUnicoPorDefecto(lista[0])).toContain("maggaboard");
    expect(estadoSyncAparato(lista[0], { ahora }).estado).toBe("activa");
  });

  it("distingue dos Android compartiendo neurona por su huella e idUnico cuando yoId es syncDeviceId", () => {
    const cap = {
      aparatos: {
        sync_tablet_android: entradaViva(
          { nombre: "Maggaboard", idUnico: "tab-01", huella: "hw-tab-s9", so: "Android", ts: undefined } as never,
          ahora - 120_000,
        ),
        sync_phone_android: entradaViva(
          { nombre: "Maggaphone", idUnico: "phone-02", huella: "hw-pixel-8", so: "Android" },
          ahora - 30_000,
        ),
      },
    };
    cap.aparatos.sync_tablet_android.ts = ahora - 120_000;

    const revPhone = revisarIdentidadCompartida({
      idNeurona: "e0b9faf2-1111-4000-8000-000000000001",
      nombreNeurona: "Maggaboard",
      capabilities: cap,
      yoId: "sync_phone_android",
      ahora,
    });
    expect(revPhone).not.toBeNull();
    expect(revPhone!.yoSeUnioDespues).toBe(true);
    expect(revPhone!.otrosNombres).toEqual(["Maggaboard"]);
  });
});
