import { describe, expect, it } from "vitest";
import { enriquecerConMalla } from "../senales-enlace-malla";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import { qualityFromRtt, type DetectedSignal } from "../signals";

function senal(neuronId = "n-1"): DetectedSignal {
  return {
    id: `neuron:${neuronId}`, antenna: "account", antennaLabel: "Cuenta",
    signalType: "Neurona", label: "Portátil", detail: "Registro",
    quality: 0.2, qualityDetail: "Presencia", metrics: [{ label: "Estado", value: "en línea" }],
    compatible: true, compatDetail: "Compatible",
    starseed: { via: "neuron-registry", sourceId: neuronId, name: "Portátil",
      ownAccount: true, online: false, capabilities: [] },
    placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.2, mode: "sector",
      distanceM: null, accuracyM: null, detail: "Sector de cuenta" },
    lastHeard: null, actions: [], simulated: false, color: "#fff",
  };
}

function fila(extra: Partial<DispositivoMallaRow> = {}): DispositivoMallaRow {
  return {
    neuronId: "n-1", nombre: "Portátil", plataforma: "Linux", tipo: "laptop",
    online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" },
    ...extra,
  };
}

describe("enriquecerConMalla", () => {
  it("enriquece un enlace conectado en la red local", () => {
    const entrada = senal();
    entrada.metrics.push({ label: "Enlace P2P", value: "anterior" });
    const [salida] = enriquecerConMalla([entrada], [fila({ enlace: {
      estado: "conectado", latenciaMs: 42,
      ruta: { clase: "misma-red-local", tipoLocal: "host", tipoRemoto: "host",
        protocolo: "udp", rttMs: 42, bytesEnviados: 2_048,
        bytesRecibidos: 2_097_152, medidoEn: 1 },
    } })]);

    expect(salida.quality).toBe(qualityFromRtt(42));
    expect(salida.qualityDetail).toContain("latencia REAL del canal P2P");
    expect(salida.starseed?.online).toBe(true);
    expect(salida.placement.detail).toContain("está cerca de ti en la red, no en metros");
    expect(salida.metrics).toEqual(expect.arrayContaining([
      { label: "Estado", value: "en línea" },
      { label: "Enlace P2P", value: "conectado · 42 ms" },
      { label: "Ruta", value: "misma red local" },
      { label: "Tráfico P2P", value: "2 KB enviados · 2 MB recibidos" },
    ]));
    expect(salida.metrics.filter((m) => m.label === "Enlace P2P")).toHaveLength(1);
  });

  it("muestra un enlace fallido con su motivo sin tocar la calidad", () => {
    const [salida] = enriquecerConMalla([senal()], [fila({
      enlace: { estado: "fallido", motivo: "ICE agotado" },
    })]);
    expect(salida.metrics).toContainEqual({ label: "Enlace P2P", value: "fallido: ICE agotado" });
    expect(salida.quality).toBe(0.2);
    expect(salida.starseed?.online).toBe(false);
  });

  it("conserva sin cambios una señal que no tiene fila", () => {
    const entrada = senal("otra");
    expect(enriquecerConMalla([entrada], [fila()])[0]).toBe(entrada);
  });

  it("tolera listas indefinidas sin lanzar", () => {
    const entrada = senal();
    expect(enriquecerConMalla([entrada], undefined)[0]).toBe(entrada);
  });

  it("añade la ficha y enumera solo sus capas activas", () => {
    const [salida] = enriquecerConMalla([senal()], [fila({ ficha: {
      v: 1, syncDeviceId: "sync-1", neuronDeviceId: "n-1", nombre: "Portátil",
      tipo: "laptop", plataforma: "Linux", versionOS: "0.2.2", ramClase: "8 GB",
      backendLocal: true, capas: { local: true, mesh: false, nube: true, colectiva: false },
      at: 1, sirveAstraura: true, astrauraLatenciaMs: 18,
    } })]);
    expect(salida.metrics).toEqual(expect.arrayContaining([
      { label: "Versión del OS", value: "0.2.2" }, { label: "RAM", value: "8 GB" },
      { label: "Backend local", value: "sí" },
      { label: "Sirve Astraura 1.58", value: "sí · 18 ms" },
      { label: "Capas 1.58 activas", value: "local, nube" },
    ]));
  });
});
