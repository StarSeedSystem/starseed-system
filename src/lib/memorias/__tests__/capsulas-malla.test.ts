import { describe, it, expect } from "vitest";
import {
  accionPara, debeReplicar, escritorDe, INTERVALO_REPLICA_MS,
  type ArriendoCapsula, type CopiaReplica, type NeuronaMalla,
} from "../capsulas-malla";
import { capsulaDe } from "../capsulas";

const F = new Date(Date.UTC(2026, 9, 28)); // Fijo: 2026T4, no depende del reloj
const AURORA = capsulaDe({ tipo: "personalidad", id: "aurora" }, F); // personal, cifrada
const PAGINA = capsulaDe({ tipo: "pagina", id: "mundo" }, F); // pública, sin cifrar

const N = (id: string, extra?: Partial<NeuronaMalla>): NeuronaMalla => ({
  id, cuentaId: "cuenta-alex", estabilidad: 0.5, presenciaViva: true, ...extra,
});
const A = (neuronaId: string, caduca = 10e12): ArriendoCapsula => (
  { sujeto: { tipo: "personalidad", id: "aurora" }, neuronaId, caduca }
);
const COPIA = (extra?: Partial<CopiaReplica>): CopiaReplica => (
  { sellada: true, cifrada: true, tamanoBytes: 100, at: F.getTime(), ...extra }
);

describe("escritorDe", () => {
  it("devuelve UNA neurona: la del arriendo vigente del sujeto", () => {
    const ns = [N("a", { estabilidad: 0.2 }), N("b", { estabilidad: 0.9 })];
    const e = escritorDe(AURORA, ns, [A("a")], F.getTime());
    expect(e?.id).toBe("a");
  });

  it("el arriendo caducado no cuenta en vigor: cae el más estable vivo", () => {
    const ns = [N("a"), N("b", { estabilidad: 0.9 })];
    const e = escritorDe(AURORA, ns, [A("a", 1)], F.getTime());
    expect(e?.id).toBe("b");
  });

  it("sin arriendo: servidor de cerebro por delante y desempate por id", () => {
    const ns = [N("c1"), N("b1"), N("b2")];
    const e = escritorDe(PAGINA, ns, [], F.getTime());
    expect(e?.id).toBe("b1"); // b1 y b2 empatan: gana el id más chico
    const e2 = escritorDe(PAGINA, [N("x"), N("y", { esServidorCerebro: true })], [], F.getTime());
    expect(e2?.id).toBe("y");
  });

  it("nunca dos: una sola respuesta, y null si nadie está vivo", () => {
    expect(escritorDe(AURORA, [], [])).toBeNull();
    expect(escritorDe(AURORA, [N("a", { presenciaViva: false })], [A("a")])).toBeNull();
  });

  it("el escritor arrendado sin presencia no vale; vive la de más estabilidad", () => {
    const ns = [N("a", { presenciaViva: false }), N("b", { estabilidad: 0.8 })];
    expect(escritorDe(AURORA, ns, [A("a")], F.getTime())?.id).toBe("b");
  });
});

describe("accionPara", () => {
  const escritora = N("escritora");

  it("la escritora designada escribe; las demás piden o leen réplica", () => {
    expect(accionPara(escritora, AURORA, escritora)).toBe("escribir");
    expect(accionPara(N("otra"), AURORA, escritora)).toBe("pedir-al-escritor");
    expect(accionPara(N("otra"), AURORA, escritora, { replicaViva: true })).toBe("leer-replica");
  });

  it("sin escritor designado nadie se autopromueve: pedir", () => {
    expect(accionPara(N("otra"), AURORA, null)).toBe("pedir-al-escritor");
  });

  it("una cápsula personal no llega a otra cuenta", () => {
    const fuera = N("tuya", { cuentaId: "cuenta-otra" });
    expect(accionPara(fuera, AURORA, escritora, { cuentaCapsula: "cuenta-alex" })).toBeNull();
    expect(accionPara(fuera, AURORA, escritora)).toBe("pedir-al-escritor");
  });
});

describe("debeReplicar", () => {
  const neurona = N("n1");
  const T = F.getTime(); // Base del reloj

  it("sin copia previa, siempre replica; la ronda es de 15 min", () => {
    expect(debeReplicar(AURORA, neurona, null, { cuentaCapsula: "cuenta-alex" })).toBe(true);
    expect(INTERVALO_REPLICA_MS).toBe(15 * 60 * 1000);
  });

  it("sello nuevo cada 15 min SOLO si cambió el tamaño", () => {
    const o = { cuentaCapsula: "cuenta-alex", tamanoActual: 100, ahora: T };
    expect(debeReplicar(AURORA, neurona, COPIA(), o)).toBe(false); // Igual: no
    const o2 = { cuentaCapsula: "cuenta-alex", tamanoActual: 200, ahora: T + 15 * 60_000 };
    expect(debeReplicar(AURORA, neurona, COPIA(), o2)).toBe(true); // Cambió: sí
  });

  it("cambió de tamaño antes de la ronda: espera al cuarto de hora", () => {
    const o = { cuentaCapsula: "cuenta-alex", tamanoActual: 200, ahora: T + 14 * 60_000 };
    expect(debeReplicar(AURORA, neurona, COPIA(), o)).toBe(false);
  });

  it("una copia sin sello o sin el cifrado del alcance obliga a repetir", () => {
    const o = { cuentaCapsula: "cuenta-alex", ahora: T };
    expect(debeReplicar(AURORA, neurona, COPIA({ sellada: false }), o)).toBe(true);
    expect(debeReplicar(AURORA, neurona, COPIA({ cifrada: false }), o)).toBe(true);
    expect(debeReplicar(PAGINA, neurona, COPIA({ cifrada: false }), o)).toBe(true);
    expect(debeReplicar(PAGINA, neurona, COPIA(), o)).toBe(false);
  });

  it("personal y perfil solo viajan cifradas a neuronas de la misma cuenta", () => {
    const fuera = N("tuya", { cuentaId: "cuenta-otra" });
    const o = { cuentaCapsula: "cuenta-alex" };
    expect(debeReplicar(AURORA, fuera, null, o)).toBe(false); // No va jamás
    expect(debeReplicar(PAGINA, fuera, null, o)).toBe(true); // Pública sí
  });
});
