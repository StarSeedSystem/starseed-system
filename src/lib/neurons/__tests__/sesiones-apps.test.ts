import { describe, expect, it } from "vitest";
import { agruparSesionesPorApp } from "../sesiones-apps";
import type { Neuron } from "@/lib/neurons/neurons";
import type { PresenciaMedio } from "@/lib/neurons/presencia";

describe("sesiones de otras apps (Audiomorphic) reconocidas por aparato", () => {
  const ahora = 1_750_000_000_000;

  it("agrupa Audiomorphic con cada aparato activo remoto y local y conserva sus neuronas", () => {
    const neuronas: Neuron[] = [
      {
        id: "n-phone",
        name: "Maggadroid",
        kind: "mobile",
        capabilities: {
          platform: "Android",
          aparatos: {
            "sync-phone": { n: "Móvil de bolsillo", idUnico: "tel-02", color: "#46a758", ts: ahora - 5_000 },
          },
        },
        permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
        online: true,
        isThisDevice: true,
      },
      {
        id: "n-linux",
        name: "Maggabox",
        kind: "desktop",
        capabilities: {
          platform: "Linux",
          aparatos: {
            "sync-linux": { n: "Caja Estudio", idUnico: "box-01", color: "#0091ff", ts: ahora - 10_000 },
          },
        },
        permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
        online: true,
      },
    ];

    const presenciaMedios: PresenciaMedio[] = [
      {
        n: "n-linux",
        m: "m-linux-1",
        tipo: "app-nativa",
        etiqueta: "App nativa StarSeed OS",
        sid: "sync-linux",
        plataforma: "Linux",
        visible: true,
        desde: new Date(ahora - 60_000).toISOString(),
        t: ahora - 5_000,
        s: {
          internet: { enLinea: true },
          malla: { pares: 1, otrasCuentas: 0 },
          lora: { estado: "sin-radio", nodos: 0 },
          bluetooth: { disponible: true },
          serie: { disponible: false, puertos: 0 },
          reticulum: { motivo: "sin daemon" },
        },
        ap: { id: "sync-linux", alias: "box-01", nombre: "Caja Estudio", col: "#0091ff", sync: "activa" },
        apps: [{ id: "audiomorphic", nombre: "Audiomorphic", origen: "Estación visual", desde: ahora - 45_000 }],
      },
    ];

    const grupos = agruparSesionesPorApp({
      presenciaMedios,
      neuronas,
      sesionesLocales: [
        { appId: "audiomorphic", nombre: "Audiomorphic", origen: "Capa de fondo", desde: ahora - 20_000, activa: true },
      ],
      neuronaActualId: "n-phone",
      aparatoActual: {
        id: "sync-phone",
        idUnico: "tel-02",
        nombre: "Móvil de bolsillo",
        color: "#46a758",
        plataforma: "Android",
        medio: "App nativa Android",
      },
    });

    expect(grupos).toHaveLength(1);
    expect(grupos[0].appId).toBe("audiomorphic");
    expect(grupos[0].aparatosActivos).toHaveLength(2);
    expect(grupos[0].aparatosActivos.map((a) => a.aparatoIdUnico).sort()).toEqual(["box-01", "tel-02"]);
    expect(grupos[0].aparatosActivos.find((a) => a.aparatoIdUnico === "box-01")?.neuronaNombre).toBe("Maggabox");
    expect(grupos[0].aparatosActivos.find((a) => a.aparatoIdUnico === "tel-02")?.esEsteAparato).toBe(true);
  });
});
