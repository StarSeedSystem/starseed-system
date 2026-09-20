// Tests de elegir-nodo (HW-2): payload puro con fixtures de mesh.
import { describe, expect, it } from "vitest";
import {
  elegir,
  marcarCaido,
  ordenarCandidatos,
  type Candidato,
} from "@/lib/astraura/elegir-nodo";

const localVivo: Candidato = {
  id: "mac-m1", tipo: "local", url: "http://127.0.0.1:8000",
  vivo: true, tokS: 7, ramLibreMb: 3000, latenciaMs: 4,
};
const vecinoRapido: Candidato = {
  id: "vec-a", tipo: "vecino", url: "http://192.168.1.10:8000",
  vivo: true, tokS: 11, ramLibreMb: 6000, latenciaMs: 25,
};
const vecinoLento: Candidato = {
  id: "vec-b", tipo: "vecino", url: "http://192.168.1.22:8000",
  vivo: true, tokS: 5, ramLibreMb: 2000, latenciaMs: 60,
};
const nubeX86: Candidato = {
  id: "nube-gcp", tipo: "nube", url: "https://astraura-nube.example",
  vivo: true, tokS: 13, ramLibreMb: 1700, latenciaMs: 90,
};
const nubeLenta: Candidato = {
  id: "nube-b", tipo: "nube", url: "https://nube-b.example",
  vivo: true, tokS: 13, ramLibreMb: 1700, latenciaMs: 180,
};

describe("ordenarCandidatos", () => {
  it("con preferencia 'local' pone el local vivo el primero, luego el resto por tok/s", () => {
    const orden = ordenarCandidatos([vecinoRapido, nubeX86, localVivo], "local");
    expect(orden.map((c) => c.id)).toEqual(["mac-m1", "nube-gcp", "vec-a"]);
  });

  it("con preferencia 'nube' gana la nube aunque la latencia del vecino sea menor", () => {
    const orden = ordenarCandidatos([vecinoRapido, nubeX86], "nube");
    expect(orden.map((c) => c.id)).toEqual(["nube-gcp", "vec-a"]);
  });

  it("entre dos del tipo preferido a igual tok/s gana el de menor latencia", () => {
    const orden = ordenarCandidatos([nubeLenta, nubeX86], "nube");
    expect(orden.map((c) => c.id)).toEqual(["nube-gcp", "nube-b"]);
  });

  it("las medidas null van después de las medidas", () => {
    const sinMedir: Candidato = { ...vecinoLento, id: "vec-sin", tokS: null, latenciaMs: null };
    const orden = ordenarCandidatos([sinMedir, vecinoLento], "vecino");
    expect(orden.map((c) => c.id)).toEqual(["vec-b", "vec-sin"]);
  });

  it("nunca devuelve candidatos muertos y con 'ninguno' devuelve vacío", () => {
    const muertoLocal = marcarCaido([localVivo], "mac-m1");
    expect(ordenarCandidatos([...muertoLocal, vecinoRapido], "local")).toEqual([vecinoRapido]);
    expect(ordenarCandidatos([localVivo, vecinoRapido], "ninguno")).toEqual([]);
  });
});

describe("elegir", () => {
  it("devuelve el mejor candidato vivo", () => {
    expect(elegir([vecinoRapido, nubeX86], "vecino")?.id).toBe("vec-a");
  });

  it("devuelve null cuando todos están muertos", () => {
    const caidos = marcarCaido(marcarCaido([vecinoRapido, nubeX86], "vec-a"), "nube-gcp");
    expect(elegir(caidos, "vecino")).toBeNull();
  });
});

describe("marcarCaido", () => {
  it("relevo: local muerto → se elige el vecino y la lista original no muta", () => {
    const lista = [localVivo, vecinoRapido];
    expect(elegir(lista, "local")?.id).toBe("mac-m1");
    const relevo = marcarCaido(lista, "mac-m1");
    expect(elegir(relevo, "local")?.id).toBe("vec-a");
    expect(lista[0].vivo).toBe(true);
    expect(relevo[0]).toEqual({ ...localVivo, vivo: false });
  });

  it("marcar un id inexistente o ya muerto no rompe nada", () => {
    const lista = [vecinoRapido];
    expect(marcarCaido(lista, "no-existe")).toEqual(lista);
    const caido = marcarCaido(lista, "vec-a");
    expect(marcarCaido(caido, "vec-a")).toEqual(caido);
  });
});
