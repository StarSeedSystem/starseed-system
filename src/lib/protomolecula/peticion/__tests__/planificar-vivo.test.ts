// Pruebas de «hazlo vivo» en el planificador (CVV1028G · contrato §2 y §7).
import { describe, it, expect, vi } from "vitest";
import type { ContextoProto } from "../contrato";
import { nivelesDeContenidoVivo, planificar, planificarVivo, type Completar } from "../planificar";

const PUBLICACION: ContextoProto = { ruta: "/post/p1", entidad: { tipo: "publicacion", id: "p1", nombre: "Mi diario" }, ambito: "personal" };

const ia = (texto = "{}"): Completar => vi.fn(async () => ({ texto, motor: "modelo-gratis" }));

describe("planificar · peticiones de contenido vivo", () => {
  it("reconoce las frases del contrato y no llama a la IA", async () => {
    const c = ia();
    const frases = ["hazlo vivo", "hazla viva", "añade un 3D", "una película de scroll", "fotos vivas", "un gráfico vivo que explique el producto"];
    for (const frase of frases) {
      expect(nivelesDeContenidoVivo(frase), frase).not.toBeNull();
      const r = await planificar({ texto: frase, contexto: PUBLICACION }, { completar: c });
      expect("error" in r, frase).toBe(false);
    }
    expect(c).not.toHaveBeenCalled();
  });

  it("sin nivel explícito pide los tres niveles", () => {
    expect(nivelesDeContenidoVivo("hazlo vivo")).toEqual([1, 2, 3]);
    expect(nivelesDeContenidoVivo("hazla viva")).toEqual([1, 2, 3]);
  });

  it("cada frase pide su nivel", () => {
    expect(nivelesDeContenidoVivo("añade un 3D")).toEqual([1]);
    expect(nivelesDeContenidoVivo("añade un 3D al gráfico")).toEqual([1]);
    expect(nivelesDeContenidoVivo("una película de scroll")).toEqual([2]);
    expect(nivelesDeContenidoVivo("fotos vivas")).toEqual([2]);
    expect(nivelesDeContenidoVivo("un gráfico vivo que explique el producto")).toEqual([3]);
  });

  it("los niveles explícitos mandan y se pueden combinar", () => {
    expect(nivelesDeContenidoVivo("hazlo vivo con los niveles 1 y 3")).toEqual([1, 3]);
    expect(nivelesDeContenidoVivo("hazla viva en el nivel 2")).toEqual([2]);
    expect(nivelesDeContenidoVivo("hazlo vivo con los tres niveles")).toEqual([1, 2, 3]);
  });

  it("el plan abre el átomo contenido-vivo en la Protomolécula con los niveles pedidos", () => {
    const plan = planificarVivo("hazlo vivo");
    expect(plan.motor).toBe("reglas locales");
    expect(plan.tipoCambio).toBe("contenido");
    expect(plan.pasos).toEqual([{ tipo: "abrir-en", donde: "protomolecula", que: "contenido-vivo · niveles 1, 2 y 3" }]);
    expect(plan.fuera).toEqual([]);
  });

  it("cada nivel se escribe en singular o en plural", () => {
    expect(planificarVivo("añade un 3D").pasos[0]).toMatchObject({ que: "contenido-vivo · nivel 1" });
    expect(planificarVivo("hazlo vivo con los niveles 1 y 3").pasos[0]).toMatchObject({ que: "contenido-vivo · niveles 1 y 3" });
  });

  it("no intercepta los planes que ya existían", async () => {
    const r = await planificar({ texto: "hazme un cubo 3D girando", contexto: PUBLICACION }, { completar: ia() });
    expect("error" in r).toBe(false);
    expect("pasos" in r && r.pasos[0]).toEqual({ tipo: "crear-objeto-3d", descripcion: "cubo 3D girando", animado: true });
  });
});
