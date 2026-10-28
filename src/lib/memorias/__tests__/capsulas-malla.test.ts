import { describe, it, expect } from "vitest";
import {
  escritorDe,
  accionPara,
  debeReplicar,
  type NeuronaMalla,
  type ArriendoSujeto,
  type CapsulaMemoria,
} from "../capsulas-malla";
import { capsulaDe, type SujetoMemoria } from "../capsulas";

const AHORA = 1_760_000_000_000; // 2025-10-09T12:13:20.000Z fijo

const makeCapsula = (sujeto: SujetoMemoria, overrides: Partial<CapsulaMemoria> = {}): CapsulaMemoria => ({
  ...capsulaDe(sujeto, new Date(AHORA)),
  ...overrides,
});

const NEURONA_A: NeuronaMalla = {
  id: "neurona-a",
  cuentaId: "cuenta-1",
  estabilidad: 0.9,
  presenciaViva: true,
  esServidorCerebro: true,
};

const NEURONA_B: NeuronaMalla = {
  id: "neurona-b",
  cuentaId: "cuenta-1",
  estabilidad: 0.7,
  presenciaViva: true,
  esServidorCerebro: false,
};

const NEURONA_C: NeuronaMalla = {
  id: "neurona-c",
  cuentaId: "cuenta-2",
  estabilidad: 0.8,
  presenciaViva: true,
  esServidorCerebro: false,
};

const NEURONA_MUERTA: NeuronaMalla = {
  id: "neurona-muerta",
  cuentaId: "cuenta-1",
  estabilidad: 0.5,
  presenciaViva: false,
  esServidorCerebro: false,
};

describe("escritorDe", () => {
  it("devuelve la neurona con arriendo vigente", () => {
    const capsula = makeCapsula({ tipo: "personalidad", id: "aurora" });
    const arriendos: ArriendoSujeto[] = [{
      sujetoTipo: "personalidad", sujetoId: "aurora", neuronaId: "neurona-b",
      concedidoEn: AHORA - 1000, expiraEn: AHORA + 3600_000,
    }];
    const escritora = escritorDe(capsula, [NEURONA_A, NEURONA_B], arriendos, AHORA);
    expect(escritora?.id).toBe("neurona-b");
  });

  it("ignora arriendo expirado y elige por estabilidad", () => {
    const capsula = makeCapsula({ tipo: "agente", id: "giro" });
    const arriendos: ArriendoSujeto[] = [{
      sujetoTipo: "agente", sujetoId: "giro", neuronaId: "neurona-b",
      concedidoEn: AHORA - 10000, expiraEn: AHORA - 1000, // expirado
    }];
    const escritora = escritorDe(capsula, [NEURONA_A, NEURONA_B], arriendos, AHORA);
    expect(escritora?.id).toBe("neurona-a"); // mayor estabilidad y esServidorCerebro
  });

  it("sin arriendo: elige la de más estabilidad y presencia viva", () => {
    const capsula = makeCapsula({ tipo: "cerebro", id: "nucleo" });
    const escritora = escritorDe(capsula, [NEURONA_B, NEURONA_A], [], AHORA);
    expect(escritora?.id).toBe("neurona-a");
  });

  it("sin arriendo: prefiere servidor de cerebro si igual estabilidad", () => {
    const capsula = makeCapsula({ tipo: "cerebro", id: "nucleo" });
    const n1: NeuronaMalla = { ...NEURONA_B, id: "n1", estabilidad: 0.8, esServidorCerebro: false };
    const n2: NeuronaMalla = { ...NEURONA_B, id: "n2", estabilidad: 0.8, esServidorCerebro: true };
    const escritora = escritorDe(capsula, [n1, n2], [], AHORA);
    expect(escritora?.id).toBe("n2");
  });

  it("ignora neuronas sin presencia viva", () => {
    const capsula = makeCapsula({ tipo: "pagina", id: "mundo" });
    const escritora = escritorDe(capsula, [NEURONA_MUERTA, NEURONA_A], [], AHORA);
    expect(escritora?.id).toBe("neurona-a");
  });

  it("devuelve null si no hay neuronas vivas", () => {
    const capsula = makeCapsula({ tipo: "bot", id: "bot1" });
    const escritora = escritorDe(capsula, [NEURONA_MUERTA], [], AHORA);
    expect(escritora).toBeNull();
  });
});

describe("accionPara", () => {
  it("«escribir» si la neurona es la escritora designada", () => {
    const capsula = makeCapsula({ tipo: "personalidad", id: "aurora" });
    const arriendos: ArriendoSujeto[] = [{
      sujetoTipo: "personalidad", sujetoId: "aurora", neuronaId: "neurona-a",
      concedidoEn: AHORA - 1000, expiraEn: AHORA + 3600_000,
    }];
    const accion = accionPara(NEURONA_A, capsula, arriendos, AHORA);
    expect(accion).toBe("escribir");
  });

  it("«leer-replica» si no es la escritora", () => {
    const capsula = makeCapsula({ tipo: "personalidad", id: "aurora" });
    const arriendos: ArriendoSujeto[] = [{
      sujetoTipo: "personalidad", sujetoId: "aurora", neuronaId: "neurona-a",
      concedidoEn: AHORA - 1000, expiraEn: AHORA + 3600_000,
    }];
    const accion = accionPara(NEURONA_B, capsula, arriendos, AHORA);
    expect(accion).toBe("leer-replica");
  });

  it("sin arriendo: la de más estabilidad escribe, las demás leen réplica", () => {
    const capsula = makeCapsula({ tipo: "agente", id: "giro" });
    const accionA = accionPara(NEURONA_A, capsula, [], AHORA);
    const accionB = accionPara(NEURONA_B, capsula, [], AHORA);
    expect(accionA).toBe("escribir");
    expect(accionB).toBe("leer-replica");
  });
});

describe("debeReplicar", () => {
  const CAPSULA_PUBLICA: CapsulaMemoria = makeCapsula(
    { tipo: "pagina", id: "mundo-vivo" },
    { alcance: "publica", cifrada: false },
  );
  const CAPSULA_PERSONAL: CapsulaMemoria = makeCapsula(
    { tipo: "personalidad", id: "aurora" },
    { alcance: "personal", cifrada: true },
  );
  const CAPSULA_PERFIL: CapsulaMemoria = makeCapsula(
    { tipo: "perfil", id: "alex" },
    { alcance: "perfil", cifrada: true },
  );
  const CAPSULA_GRUPO: CapsulaMemoria = makeCapsula(
    { tipo: "grupo", id: "hogar" },
    { alcance: "grupo", cifrada: false },
  );

  it("pública: replica a neurona viva sin copia previa", () => {
    expect(debeReplicar(CAPSULA_PUBLICA, NEURONA_B, null, AHORA)).toBe(true);
  });

  it("pública: no replica a neurona muerta", () => {
    expect(debeReplicar(CAPSULA_PUBLICA, NEURONA_MUERTA, null, AHORA)).toBe(false);
  });

  it("personal: solo a neurona de la misma cuenta y cifrada", () => {
    // misma cuenta, cifrada -> true
    expect(debeReplicar(CAPSULA_PERSONAL, NEURONA_A, null, AHORA)).toBe(true);
    // otra cuenta -> false
    expect(debeReplicar(CAPSULA_PERSONAL, NEURONA_C, null, AHORA)).toBe(false);
    // no cifrada -> false
    const sinCifrar = { ...CAPSULA_PERSONAL, cifrada: false };
    expect(debeReplicar(sinCifrar, NEURONA_A, null, AHORA)).toBe(false);
  });

  it("perfil: misma regla que personal", () => {
    expect(debeReplicar(CAPSULA_PERFIL, NEURONA_A, null, AHORA)).toBe(true);
    expect(debeReplicar(CAPSULA_PERFIL, NEURONA_C, null, AHORA)).toBe(false);
  });

  it("grupo: replica a neurona viva (no requiere misma cuenta)", () => {
    expect(debeReplicar(CAPSULA_GRUPO, NEURONA_C, null, AHORA)).toBe(true);
  });

  it("con copia previa: no replica si no pasó 15 min", () => {
    const copia = { tamano: 1000, timestamp: AHORA - 5 * 60 * 1000 }; // 5 min atrás
    expect(debeReplicar(CAPSULA_PUBLICA, NEURONA_A, copia, AHORA)).toBe(false);
  });

  it("con copia previa: replica si pasó 15 min y neurona viva", () => {
    const copia = { tamano: 1000, timestamp: AHORA - 20 * 60 * 1000 }; // 20 min atrás
    expect(debeReplicar(CAPSULA_PUBLICA, NEURONA_A, copia, AHORA)).toBe(true);
  });

  it("con copia previa: no replica si neurona muerta aunque pasó 15 min", () => {
    const copia = { tamano: 1000, timestamp: AHORA - 20 * 60 * 1000 };
    expect(debeReplicar(CAPSULA_PUBLICA, NEURONA_MUERTA, copia, AHORA)).toBe(false);
  });
});