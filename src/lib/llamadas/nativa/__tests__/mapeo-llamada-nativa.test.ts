import { describe, expect, it } from "vitest";
import {
  accionParaEvento,
  cargaDeEvento,
  contadoTras,
  eventoDeNombre,
  leerCapacidades,
  llamadaDesdeDirecta,
  llamadaDesdeSistema,
  pantallaCompletaLista,
  pasosHacia,
  SIN_CAPACIDADES,
  type InstantaneaMotores,
  type LlamadaParaNativa,
  type VistaDirecta,
} from "../mapeo-llamada-nativa";

const directa = (p: Partial<VistaDirecta> = {}): VistaDirecta => ({ fase: "inactiva", id: "ll-1", nombre: "Ana", video: false, micro: true, entrante: false, ...p });

describe("llamada directa → teléfono (estado del motor ↔ estado nativo)", () => {
  it("llamando y entrante suenan; en curso es activa; terminada es terminada", () => {
    expect(llamadaDesdeDirecta(directa({ fase: "llamando" }))).toMatchObject({ estado: "sonando", entrante: false, tipo: "voz" });
    expect(llamadaDesdeDirecta(directa({ fase: "entrante", entrante: true }))).toMatchObject({ estado: "sonando", entrante: true });
    expect(llamadaDesdeDirecta(directa({ fase: "en-curso" }))?.estado).toBe("activa");
    expect(llamadaDesdeDirecta(directa({ fase: "terminada" }))?.estado).toBe("terminada");
  });
  it("inactiva, o sin id, no se cuenta", () => {
    expect(llamadaDesdeDirecta(directa({ fase: "inactiva" }))).toBeNull();
    expect(llamadaDesdeDirecta(directa({ fase: "llamando", id: null }))).toBeNull();
  });
  it("vídeo, micro cerrado y nombre vacío", () => {
    const l = llamadaDesdeDirecta(directa({ fase: "en-curso", video: true, micro: false, nombre: "" }));
    expect(l).toMatchObject({ tipo: "video", silenciada: true, nombre: "StarSeed" });
  });
});

describe("sistema de llamadas → teléfono", () => {
  const activa = (p: Partial<{ fase: string; esCreador: boolean; micro: boolean; tipo: string }> = {}) => ({ sesionId: "s1", tipo: "audio", titulo: "Equipo", esCreador: true, fase: "esperando", micro: true, ...p });
  it("quien llama suena mientras espera y está activa al haber conversación", () => {
    expect(llamadaDesdeSistema(activa(), [])).toMatchObject({ estado: "sonando", entrante: false, id: "s1" });
    expect(llamadaDesdeSistema(activa({ fase: "en-curso" }), [])?.estado).toBe("activa");
    expect(llamadaDesdeSistema(activa({ fase: "llena" }), [])?.estado).toBe("activa");
  });
  it("quien contestó está activa aunque aún conecte", () => {
    expect(llamadaDesdeSistema(activa({ esCreador: false, fase: "conectando" }), [])).toMatchObject({ estado: "activa", entrante: true });
  });
  it("terminada y error terminan", () => {
    expect(llamadaDesdeSistema(activa({ fase: "terminada" }), [])?.estado).toBe("terminada");
    expect(llamadaDesdeSistema(activa({ fase: "error" }), [])?.estado).toBe("terminada");
  });
  it("un timbre sin llamada activa suena; la llamada activa manda sobre el timbre", () => {
    const t = [{ sesionId: "t1", tipo: "video", nombre: "Luz" }];
    expect(llamadaDesdeSistema(null, t)).toMatchObject({ id: "t1", estado: "sonando", entrante: true, tipo: "video", nombre: "Luz" });
    expect(llamadaDesdeSistema(activa({ fase: "en-curso" }), t)?.id).toBe("s1");
    expect(llamadaDesdeSistema(null, [])).toBeNull();
  });
  it("sala-vr y sala-ar son llamadas con pantalla", () => {
    expect(llamadaDesdeSistema(activa({ tipo: "sala-vr" }), [])?.tipo).toBe("video");
  });
});

describe("pasos hacia el teléfono (ciclo de vida)", () => {
  const sonando: LlamadaParaNativa = { id: "a", nombre: "Ana", tipo: "voz", entrante: true, estado: "sonando", silenciada: false };
  const ciclo = (ahoras: Array<LlamadaParaNativa | null>) => {
    let contado = null as ReturnType<typeof contadoTras>;
    const todos: string[] = [];
    for (const a of ahoras) {
      const pasos = pasosHacia(contado, a);
      todos.push(...pasos.map((p) => (p.paso === "iniciar" ? `iniciar:${p.llamada.id}` : `${p.estado}:${p.id}`)));
      contado = contadoTras(contado, pasos);
    }
    return todos;
  };
  it("sonando → activa → terminada, cada paso una vez", () => {
    expect(ciclo([sonando, sonando, { ...sonando, estado: "activa" }, { ...sonando, estado: "activa" }, { ...sonando, estado: "terminada" }, { ...sonando, estado: "terminada" }])).toEqual(["iniciar:a", "activa:a", "terminada:a"]);
  });
  it("silenciar cuenta como cambio y el micro vuelve a contar", () => {
    const a = { ...sonando, estado: "activa" as const };
    expect(ciclo([a, { ...a, silenciada: true }, { ...a, silenciada: false }])).toEqual(["iniciar:a", "activa:a", "activa:a", "activa:a"]);
  });
  it("si la llamada desaparece sin decir «terminada», se cierra lo nativo (una vez)", () => {
    expect(ciclo([sonando, null, null])).toEqual(["iniciar:a", "terminada:a"]);
  });
  it("una llamada que acabó sin contarse nunca no se cuenta", () => {
    expect(ciclo([{ ...sonando, estado: "terminada" }])).toEqual([]);
  });
  it("otra llamada distinta cierra la anterior y empieza la suya; la misma id puede volver a sonar", () => {
    const b = { ...sonando, id: "b" };
    expect(ciclo([sonando, b])).toEqual(["iniciar:a", "terminada:a", "iniciar:b"]);
    expect(ciclo([sonando, { ...sonando, estado: "terminada" }, sonando])).toEqual(["iniciar:a", "terminada:a", "iniciar:a"]);
  });
  it("si lo primero que se ve ya está activa: iniciar y activa", () => {
    expect(ciclo([{ ...sonando, estado: "activa" }])).toEqual(["iniciar:a", "activa:a"]);
  });
  it("en espera es un estado más", () => {
    const a = { ...sonando, estado: "activa" as const };
    expect(ciclo([a, { ...a, estado: "en-espera" }, a])).toEqual(["iniciar:a", "activa:a", "en-espera:a", "activa:a"]);
  });
});

describe("eventos del teléfono → acciones del motor", () => {
  const base: InstantaneaMotores = { directa: null, activa: null, timbres: [] };
  const carga = (id: string, valor: unknown = null) => ({ id, valor });

  it("contestar y rechazar: la llamada directa que suena aquí", () => {
    const m = { ...base, directa: { fase: "entrante" as const, id: "ll-1", micro: true } };
    expect(accionParaEvento("contestar", carga("ll-1"), m)).toEqual({ motor: "directa", accion: "contestar" });
    expect(accionParaEvento("rechazar", carga("ll-1"), m)).toEqual({ motor: "directa", accion: "rechazar" });
  });
  it("contestar y rechazar: el timbre del sistema con ese id", () => {
    const m = { ...base, timbres: [{ sesionId: "t1" }] };
    expect(accionParaEvento("contestar", carga("t1"), m)).toEqual({ motor: "sistema", accion: "contestar", sesionId: "t1" });
    expect(accionParaEvento("rechazar", carga("t1"), m)).toEqual({ motor: "sistema", accion: "rechazar", sesionId: "t1" });
  });
  it("nunca actúa sobre una llamada que no es la del evento", () => {
    const m = { ...base, directa: { fase: "entrante" as const, id: "ll-1", micro: true }, timbres: [{ sesionId: "t1" }] };
    for (const e of ["contestar", "rechazar", "colgar"] as const) expect(accionParaEvento(e, carga("otra"), m)).toBeNull();
  });
  it("no se contesta lo que no suena (ya en curso o saliente)", () => {
    expect(accionParaEvento("contestar", carga("ll-1"), { ...base, directa: { fase: "en-curso", id: "ll-1", micro: true } })).toBeNull();
    expect(accionParaEvento("contestar", carga("ll-1"), { ...base, directa: { fase: "llamando", id: "ll-1", micro: true } })).toBeNull();
  });
  it("colgar: directa viva, timbre (es rechazarlo) o llamada activa del sistema", () => {
    expect(accionParaEvento("colgar", carga("ll-1"), { ...base, directa: { fase: "en-curso", id: "ll-1", micro: true } })).toEqual({ motor: "directa", accion: "colgar" });
    expect(accionParaEvento("colgar", carga("ll-1"), { ...base, directa: { fase: "llamando", id: "ll-1", micro: true } })).toEqual({ motor: "directa", accion: "colgar" });
    expect(accionParaEvento("colgar", carga("t1"), { ...base, timbres: [{ sesionId: "t1" }] })).toEqual({ motor: "sistema", accion: "rechazar", sesionId: "t1" });
    expect(accionParaEvento("colgar", carga("s1"), { ...base, activa: { sesionId: "s1", micro: true, cerrada: false } })).toEqual({ motor: "sistema", accion: "colgar" });
    expect(accionParaEvento("colgar", carga("s1"), { ...base, activa: { sesionId: "s1", micro: true, cerrada: true } })).toBeNull();
    expect(accionParaEvento("colgar", carga("ll-1"), { ...base, directa: { fase: "terminada", id: "ll-1", micro: true } })).toBeNull();
  });
  it("rechazar una llamada ya contestada es colgar", () => {
    expect(accionParaEvento("rechazar", carga("ll-1"), { ...base, directa: { fase: "en-curso", id: "ll-1", micro: true } })).toEqual({ motor: "directa", accion: "colgar" });
  });
  it("silenciar: solo si cambia algo, y el valor tiene que ser true/false", () => {
    const m = { ...base, directa: { fase: "en-curso" as const, id: "ll-1", micro: true } };
    expect(accionParaEvento("silenciar", carga("ll-1", true), m)).toEqual({ motor: "directa", accion: "silenciar" });
    expect(accionParaEvento("silenciar", carga("ll-1", false), m)).toBeNull();
    expect(accionParaEvento("silenciar", carga("ll-1", "si"), m)).toBeNull();
    const s = { ...base, activa: { sesionId: "s1", micro: false, cerrada: false } };
    expect(accionParaEvento("silenciar", carga("s1", false), s)).toEqual({ motor: "sistema", accion: "silenciar" });
    expect(accionParaEvento("silenciar", carga("s1", true), s)).toBeNull();
  });
  it("ruta, proximidad y espera no tocan el motor", () => {
    const m = { ...base, directa: { fase: "en-curso" as const, id: "ll-1", micro: true } };
    for (const e of ["ruta", "proximidad", "espera"] as const) expect(accionParaEvento(e, carga("ll-1", true), m)).toBeNull();
  });
});

describe("lo que llega de fuera se valida", () => {
  it("nombre del evento", () => {
    expect(eventoDeNombre("llamada-nativa://contestar")).toBe("contestar");
    expect(eventoDeNombre("llamada-nativa://formatear")).toBeNull();
    expect(eventoDeNombre("otro://contestar")).toBeNull();
  });
  it("carga", () => {
    expect(cargaDeEvento({ id: "a", valor: true })).toEqual({ id: "a", valor: true });
    expect(cargaDeEvento({ id: "a" })).toEqual({ id: "a", valor: null });
    expect(cargaDeEvento({ id: "" })).toBeNull();
    expect(cargaDeEvento({ id: "x".repeat(81) })).toBeNull();
    expect(cargaDeEvento(null)).toBeNull();
    expect(cargaDeEvento("a")).toBeNull();
  });
  it("capacidades: lo raro queda como «sin capacidades» y las rutas desconocidas no pasan", () => {
    expect(leerCapacidades(null)).toBe(SIN_CAPACIDADES);
    const c = leerCapacidades({ plataforma: "android", nativa: true, telecom: true, rutas: ["auricular", "moto"], ruta: "altavoz", pantalla_completa: "denegado", proximidad: true });
    expect(c).toMatchObject({ nativa: true, telecom: true, rutas: ["auricular"], ruta: "altavoz", proximidad: true });
    expect(pantallaCompletaLista(c)).toBe(false);
    expect(pantallaCompletaLista({ ...c, pantalla_completa: "no-aplica" })).toBe(true);
    expect(leerCapacidades({ ruta: "moto" }).ruta).toBe("");
  });
});

describe("LLA1108F: eventos de timbre", () => {
  it("la lista de eventos incluye ignorar, silencio y mensaje", async () => {
    const m = await import("../mapeo-llamada-nativa");
    expect(m.EVENTOS_NATIVOS).toEqual(expect.arrayContaining(["ignorar", "silencio", "mensaje"]));
    expect(m.EVENTOS_NATIVOS).toHaveLength(10);
  });
});
