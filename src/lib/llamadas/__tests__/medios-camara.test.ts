// @vitest-environment jsdom
/**
 * VID1110A · el caso de prueba.32: el sistema abre el iPhone (Continuidad) por defecto; la llamada debe quedarse con la
 * cámara del propio aparato y dejar `camara elegida=…` en el registro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fijarSumideroDiagnostico } from "../voz-datos/diagnostico";
import { afinarCamara } from "../medios";
import { guardarPreferencia } from "../camaras";

function pista(deviceId: string, label: string) {
  const t = { kind: "video", label, stopped: false, getSettings: () => ({ deviceId }), stop() { this.stopped = true; } };
  return t as unknown as MediaStreamTrack & { stopped: boolean };
}

function flujo(...pistas: MediaStreamTrack[]) {
  const l = [...pistas];
  return {
    getVideoTracks: () => l.slice(),
    addTrack: (t: MediaStreamTrack) => void l.push(t),
    removeTrack: (t: MediaStreamTrack) => void l.splice(l.indexOf(t), 1),
  } as unknown as MediaStream;
}

function dispositivos(abre: Record<string, ReturnType<typeof pista>>) {
  const pedidos: string[] = [];
  const md = {
    enumerateDevices: async () => [
      { kind: "videoinput", deviceId: "ph", label: "Maggabook's iPhone Camera" },
      { kind: "videoinput", deviceId: "ft", label: "FaceTime HD Camera (Built-in)" },
    ],
    getUserMedia: async (c: { video: { deviceId?: { exact: string } } }) => {
      const id = c.video.deviceId?.exact ?? "";
      pedidos.push(id);
      return { getVideoTracks: () => [abre[id]] };
    },
  } as unknown as MediaDevices;
  return { md, pedidos };
}

describe("afinarCamara", () => {
  const lineas: string[] = [];
  beforeEach(() => {
    localStorage.clear();
    lineas.length = 0;
    fijarSumideroDiagnostico((l) => void lineas.push(`${l.hito} ${l.detalle}`));
  });

  it("el sistema abrió el iPhone: se reabre la FaceTime, se suelta el iPhone y queda en el registro", async () => {
    const iphone = pista("ph", "Maggabook's iPhone Camera");
    const ft = pista("ft", "FaceTime HD Camera (Built-in)");
    const s = flujo(iphone);
    const { md, pedidos } = dispositivos({ ft });
    await afinarCamara(md, s, null, "t-mac", "mac");
    expect(pedidos).toEqual(["ft"]);
    expect(iphone.stopped).toBe(true);
    expect(s.getVideoTracks()).toEqual([ft]);
    expect(lineas).toContain('camara camara elegida="FaceTime HD Camera (Built-in)" (integrada) motivo=integrada');
  });

  it("si ya es la del aparato no reabre nada", async () => {
    const ft = pista("ft", "FaceTime HD Camera (Built-in)");
    const s = flujo(ft);
    const { md, pedidos } = dispositivos({});
    await afinarCamara(md, s, null, "t-mac", "mac");
    expect(pedidos).toEqual([]);
    expect(ft.stopped).toBe(false);
  });

  it("si la persona eligió el iPhone antes, se respeta (es una opción configurable)", async () => {
    guardarPreferencia("t-mac", { camara: { id: "ph", etiqueta: "Maggabook's iPhone Camera" } });
    const iphone = pista("ph", "Maggabook's iPhone Camera");
    const s = flujo(iphone);
    const { md, pedidos } = dispositivos({});
    await afinarCamara(md, s, null, "t-mac", "mac");
    expect(pedidos).toEqual([]);
    expect(lineas.some((l) => l.includes("(continuidad) motivo=guardada"))).toBe(true);
  });

  it("si la reapertura falla, se queda con la que abrió el sistema (nunca sin cámara)", async () => {
    const iphone = pista("ph", "Maggabook's iPhone Camera");
    const s = flujo(iphone);
    const md = {
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "ph", label: "Maggabook's iPhone Camera" }, { kind: "videoinput", deviceId: "ft", label: "FaceTime HD Camera" }],
      getUserMedia: async () => {
        throw new Error("ocupada");
      },
    } as unknown as MediaDevices;
    await afinarCamara(md, s, null, "t-mac", "mac");
    expect(s.getVideoTracks()).toEqual([iphone]);
    expect(iphone.stopped).toBe(false);
  });

  it("con cámara pedida a mano no cambia nada", async () => {
    const iphone = pista("ph", "Maggabook's iPhone Camera");
    const s = flujo(iphone);
    const { md, pedidos } = dispositivos({});
    await afinarCamara(md, s, "ph", "t-mac", "mac");
    expect(pedidos).toEqual([]);
    expect(lineas.some((l) => l.includes("motivo=pedida"))).toBe(true);
  });
});
