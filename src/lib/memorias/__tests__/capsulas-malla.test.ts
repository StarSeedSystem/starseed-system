// Pruebas del reparto de cápsulas en la malla (MVD1027B): escritor único, acción por
// neurona y réplica sellada. Solo funciones puras, sin red ni disco.
import { describe, it, expect } from "vitest";
import {
  candidatosEscritor,
  escritorDe,
  accionPara,
  debeReplicar,
  type NeuronaMalla,
  type CapsulaMalla,
} from "../capsulas-malla";

const AHORA = 1_800_000_000_000;

function capsula(alcance: "personal" | "grupo"): CapsulaMalla {
  const personal = alcance === "personal";
  return {
    nombre: personal ? "personalidad-aurora-2026T4.mv2e" : "pagina-lumen-2026T4.mv2",
    sujeto: { tipo: personal ? "personalidad" : "pagina", id: "aurora" },
    alcance,
    cifrada: personal,
    periodo: "2026T4",
    parte: 1,
    cuentaId: "cuenta-1",
  };
}

function neurona(id: string, extra: Partial<NeuronaMalla> = {}): NeuronaMalla {
  return {
    id,
    cuentaId: "cuenta-1",
    esServidorCerebro: false,
    estabilidad: 10,
    presenciaViva: true,
    ...extra,
  };
}

const N_A = neurona("a", { estabilidad: 5 });
const N_B = neurona("b", { estabilidad: 20 });
const N_C = neurona("c", { cuentaId: "cuenta-2", estabilidad: 40 });

describe("escritorDe", () => {
  it("devuelve la neurona con el arriendo vivo del sujeto", () => {
    const arriendo: ArriendoSujeto = {
      neuronaId: "a", sujeto: { tipo: "personalidad", id: "aurora" }, caducaEn: AHORA + 60_000,
    };
    expect(escritorDe(capsula("personal"), [N_A, N_B], [arriendo], AHORA)?.id).toBe("a");
  });

  it("ignora el arriendo caducado y cae a la más estable con presencia viva", () => {
    const caducado: ArriendoSujeto = {
      neuronaId: "a", sujeto: { tipo: "personalidad", id: "aurora" }, caducaEn: AHORA - 1,
    };
    const final = escritorDe(capsula("personal"), [N_A, N_B], [caducado], AHORA);
    expect(final?.id).toBe("b");
  });

  it("a igualdad de estabilidad elige siempre la misma (id menor)", () => {
    const pareja = [neurona("b"), neurona("a-signo")];
    const elegida = escritorDe(capsula("grupo"), pareja, [], AHORA);
    expect(elegida?.id).toBe("a-signo");
  });

  it("nunca devuelve dos: un solo escritor por cápsula", () => {
    const final = escritorDe(capsula("personal"), [N_A, N_B], [], AHORA);
    expect(final).not.toBeNull();
    expect(escritorDe(capsula("personal"), [N_A, N_B], [], AHORA)?.id).toBe(final?.id);
  });

  it("una cápsula personal jamás cae en una neurona de otra cuenta", () => {
    expect(escritorDe(capsula("personal"), [N_C], [], AHORA)).toBeNull();
  });

  it("descarta a una neurona con presencia muerta", () => {
    const muerta = neurona("m", { estabilidad: 99, presenciaViva: false });
    expect(escritorDe(capsula("grupo"), [muerta], [], AHORA)).toBeNull();
  });
});

describe("candidatosEscritor", () => {
  it("filtra por cuenta en cápsulas privadas y no en las públicas", () => {
    expect(candidatosEscritor(capsula("personal"), [N_A, N_C])).toEqual([N_A]);
    expect(candidatosEscritor(capsula("grupo"), [N_A, N_C])).toEqual([N_A, N_C]);
  });
});

describe("accionPara", () => {
  it("la del arriendo escribe; la que tiene réplica lee; la que no, pide", () => {
    expect(accionPara(N_B, N_B, false)).toBe("escribir");
    expect(accionPara(N_A, N_B, true)).toBe("leer-replica");
    expect(accionPara(N_A, N_B, false)).toBe("pedir-al-escritor");
  });

  it("sin escritor nadie se nombra solo: pide", () => {
    expect(accionPara(N_B, null, false)).toBe("pedir-al-escritor");
    expect(accionPara(N_B, null, true)).toBe("leer-replica");
  });
});

describe("debeReplicar", () => {
  const privada = capsula("personal");
  const publica = { ...capsula("grupo"), estado: { bytes: 1000 } };

  it("la primera copia siempre, después solo al cambiar el tamaño tras 15 min", () => {
    const desde = { bytes: 1000, selladaEn: AHORA };
    expect(debeReplicar(privada, N_A, null, AHORA)).toBe(true);
    expect(debeReplicar({ ...privada, estado: { bytes: 1000 } }, N_A, desde, AHORA)).toBe(false);
    expect(
      debeReplicar({ ...privada, estado: { bytes: 1000 } }, N_A, desde, AHORA - 1),
    ).toBe(false);
    expect(
      debeReplicar({ ...privada, estado: { bytes: 1200 } }, N_A, desde,
        AHORA + INTERVALO_REPLICA_MS),
    ).toBe(true);
  });

  it("con 15 min vencidos y el mismo tamaño no repite la copia", () => {
    const desde = { bytes: 1000, selladaEn: AHORA - INTERVALO_REPLICA_MS - 1 };
    expect(debeReplicar(publica, N_A, desde, AHORA)).toBe(false);
  });

  it("una cápsula personal solo viaja cifrada y solo dentro de la cuenta", () => {
    const cifrada = { ...capsula("personal"), estado: { bytes: 1000 } };
    expect(debeReplicar(cifrada, N_C, null, AHORA)).toBe(false);
    expect(
      debeReplicar({ ...cifrada, cifrada: false }, N_A, null, AHORA),
    ).toBe(false);
  });
});
