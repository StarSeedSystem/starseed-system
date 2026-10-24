import { describe, it, expect } from "vitest";
import { modoDeCapa, estiloDeCapa, mascaraCss, firmaEstructura } from "../politica-shader";

const viva = {
  webgpu: true, reducirMovimiento: false, ahorroBateria: false, bateriaPct: null, visible: true,
};

describe("politica-shader · modoDeCapa", () => {
  it("la pestaña oculta o la capa apagada manda sobre todo: pausa sin destruir", () => {
    expect(modoDeCapa({ ...viva, visible: false })).toBe("pausado");
    expect(modoDeCapa({ webgpu: false, reducirMovimiento: true, ahorroBateria: true, bateriaPct: 5, visible: false })).toBe("pausado");
  });
  it("sin WebGPU o con «reducir movimiento»: fijo, aunque haya batería", () => {
    expect(modoDeCapa({ ...viva, webgpu: false })).toBe("fijo");
    expect(modoDeCapa({ ...viva, reducirMovimiento: true })).toBe("fijo");
  });
  it("ahorro de batería o batería baja: 30 fps como máximo", () => {
    expect(modoDeCapa({ ...viva, ahorroBateria: true })).toBe("vivo-30fps");
    expect(modoDeCapa({ ...viva, bateriaPct: 20 })).toBe("vivo-30fps");
    expect(modoDeCapa({ ...viva, bateriaPct: 21 })).toBe("vivo");
    expect(modoDeCapa({ ...viva, bateriaPct: 0 })).toBe("vivo-30fps");
  });
  it("el caso bueno: WebGPU, batería en null y sin restricciones → vivo", () => {
    expect(modoDeCapa({ ...viva })).toBe("vivo");
  });
});

describe("politica-shader · encuadre y máscara", () => {
  it("estiloDeCapa pasa lo relativo 0-1 a porcentajes y rota solo si toca", () => {
    expect(estiloDeCapa()).toEqual({ left: "0%", top: "0%", width: "100%", height: "100%", transform: undefined, transformOrigin: "center" });
    expect(estiloDeCapa({ x: 0.25, y: 0.5, escala: 0.5, rotacion: 90, ancho: 0.4, alto: 0.2 })).toEqual({ left: "25%", top: "50%", width: "20%", height: "10%", transform: "rotate(90deg)", transformOrigin: "center" });
  });
  it("mascaraCss: radial, lineal o nada (ninguna y desconocida no recortan)", () => {
    expect(mascaraCss("radial")).toEqual({ WebkitMaskImage: expect.stringContaining("radial-gradient"), maskImage: expect.stringContaining("radial-gradient") });
    expect(mascaraCss("lineal").maskImage).toContain("linear-gradient");
    expect(mascaraCss("ninguna")).toEqual({});
    expect(mascaraCss()).toEqual({});
  });
  it("firmaEstructura: solo tipos e ids; cambia el props pero no la firma", () => {
    const a = firmaEstructura({ components: [{ type: "Aurora", id: "a", props: { vel: 1 } }] });
    expect(a).toBe(firmaEstructura({ components: [{ type: "Aurora", id: "a", props: { vel: 9 } }] }));
    expect(a).not.toBe(firmaEstructura({ components: [{ type: "Aurora", id: "a", props: { vel: 9 } }, { type: "FilmGrain", id: "f" }] }));
    expect(firmaEstructura(undefined)).toBe(JSON.stringify([]));
  });
});
