/**
 * LLA1108G · el adaptador de `MotorLlamada` a la superficie, con un motor falso: cada control mueve el motor o sale
 * desactivado con su motivo; cambio de tipo sin colgar con señal; invitar; grabación con consentimiento; Astraura con
 * la MISMA respuesta en todas las neuronas; chat, reacciones y fin para todos.
 */
import { describe, expect, it, vi } from "vitest";
import { AdaptadorMotor, estadoDesdeFase, finDesdeEstado, medidasDeTexto, tipoDesdeEstado, type DepsAdaptador } from "../adaptador-motor";
import { MOTIVO_PANTALLA_ANDROID, MOTIVO_PANTALLA_MAC, MOTIVO_VIDEO_BLUETOOTH, type EntornoLlamada } from "../matriz-controles";
import { BusFalso, ENTORNO_ESCRITORIO, MotorFalso, vaciar } from "./motor-falso";
import type { Invitable } from "../grupo-invitar";

const BT = { tipo: "enlace-datos" as const, texto: "Voz por Bluetooth directo · cifrada", cifrada: true };

function crear(m: MotorFalso, over: Partial<DepsAdaptador> = {}, entorno: EntornoLlamada = ENTORNO_ESCRITORIO) {
  return new AdaptadorMotor(m, { titulo: "Ana", unoAUno: true, entorno: () => entorno, esperaAckMs: 40, nuevoId: (() => { let n = 0; return () => `${m.miId}-${++n}`; })(), ...over });
}

describe("controles básicos: cada uno mueve el motor", () => {
  it("micro, cámara y pantalla llaman al motor", async () => {
    const m = new MotorFalso("a", "Yo");
    const ad = crear(m);
    ad.acciones.alternarMicro?.();
    await vaciar();
    ad.acciones.alternarCamara?.();
    await vaciar();
    ad.acciones.alternarPantalla?.();
    await vaciar();
    expect(m.llamadas).toEqual(["micro", "camara", "pantalla"]);
    expect(ad.vista().compartiendoPantalla).toBe(true);
    expect(ad.vista().motivos?.camara).toMatch(/Deja de compartir la pantalla/);
  });

  it("un error del motor (sin permiso) se enseña como aviso, no se pierde", async () => {
    const m = new MotorFalso("a", "Yo");
    m.errores.camara = "No hay permiso para la cámara.";
    const ad = crear(m);
    ad.acciones.alternarCamara?.();
    await vaciar();
    expect(ad.vista().aviso).toBe("No hay permiso para la cámara.");
  });

  it("girar la cámara pasa a la siguiente cámara del aparato; salida de audio y colgar llegan al motor", async () => {
    const m = new MotorFalso("a", "Yo");
    m.camara = true;
    m.reconstruir();
    const ad = crear(m, {}, { ...ENTORNO_ESCRITORIO, movil: true });
    ad.acciones.girarCamara?.();
    await vaciar();
    expect(m.cambiarCamara).toHaveBeenCalledWith("c2");
    ad.acciones.elegirSalidaAudio?.("altavoz-1");
    expect(m.cambiarAltavoz).toHaveBeenCalledWith("altavoz-1");
    ad.acciones.colgar?.();
    expect(m.colgar).toHaveBeenCalled();
  });

  it("espera: silencia y oculta la imagen, avisa al otro lado y al reanudar lo devuelve", async () => {
    const bus = new BusFalso();
    const a = new MotorFalso("a", "Ana", bus, 1);
    const b = new MotorFalso("b", "Beto", bus, 2);
    a.camara = true;
    bus.sincronizar();
    const ad = crear(a);
    const bd = crear(b);
    ad.acciones.alternarEspera?.();
    await vaciar();
    expect(a.micro).toBe(false);
    expect(a.camara).toBe(false);
    expect(ad.vista().estado).toBe("en-espera");
    expect(bd.vista().esperaRemota).toBe("Ana");
    ad.acciones.alternarEspera?.();
    await vaciar();
    expect(a.micro).toBe(true);
    expect(a.camara).toBe(true);
    expect(ad.vista().estado).toBe("conectada");
    expect(bd.vista().esperaRemota).toBeNull();
  });
});

describe("desactivado con motivo (sin botones muertos)", () => {
  it("por Bluetooth el vídeo no cabe: la cámara y el cambio a vídeo salen desactivados y la acción no toca el motor", async () => {
    const m = new MotorFalso("a", "Yo");
    m.poner({ medio: BT });
    const ad = crear(m);
    expect(ad.vista().motivos?.camara).toBe(MOTIVO_VIDEO_BLUETOOTH);
    expect(ad.vista().motivos?.["tipo-video"]).toBe(MOTIVO_VIDEO_BLUETOOTH);
    expect(ad.vista().motivos?.invitar).toMatch(/Bluetooth solo se habla de dos en dos/);
    ad.acciones.alternarCamara?.();
    await vaciar();
    expect(m.llamadas).not.toContain("camara");
    expect(ad.vista().aviso).toContain("Bluetooth");
    await expect(ad.cambiarTipo("video")).rejects.toThrow(/Bluetooth/);
    expect(m.llamadas).not.toContain("camara");
  });

  it("en Android no se comparte la pantalla (con el motivo); en la app de Mac, tampoco si el motor web no la ofrece", async () => {
    const m = new MotorFalso("a", "Yo");
    const android = crear(m, {}, { ...ENTORNO_ESCRITORIO, pantalla: false, androidWebView: true, movil: true });
    expect(android.vista().motivos?.pantalla).toBe(MOTIVO_PANTALLA_ANDROID);
    android.acciones.alternarPantalla?.();
    await vaciar();
    expect(m.llamadas).not.toContain("pantalla");
    expect(android.vista().aviso).toBe(MOTIVO_PANTALLA_ANDROID);
    const mac = crear(new MotorFalso("m", "Yo"), {}, { ...ENTORNO_ESCRITORIO, pantalla: false, macWebView: true });
    expect(mac.vista().motivos?.pantalla).toBe(MOTIVO_PANTALLA_MAC);
  });

  it("la transmisión en vivo no se activa a mitad de llamada y lo dice; Medio solo admite automático", async () => {
    const m = new MotorFalso("a", "Yo");
    const ad = crear(m);
    expect(ad.vista().motivos?.["tipo-vivo"]).toMatch(/desde el chat/);
    await expect(ad.cambiarTipo("vivo")).rejects.toThrow(/desde el chat/);
    const opciones = ad.vista().opcionesMedio ?? [];
    expect(opciones.find((o) => o.medio === "automatico")?.disponible).toBe(true);
    expect(opciones.filter((o) => o.medio !== "automatico").every((o) => !o.disponible)).toBe(true);
    await ad.acciones.elegirMedio?.("turn");
    expect(ad.vista().aviso).toMatch(/no se puede fijar/);
    await ad.acciones.elegirMedio?.("automatico");
    expect(ad.vista().medioElegido).toBe("automatico");
  });
});

describe("cambiar de tipo sin colgar, con la señal para que el otro lado siga", () => {
  it("voz → vídeo → pantalla → voz: la misma conexión, sin colgar; la otra superficie ve el chip y el tipo nuevo", async () => {
    const bus = new BusFalso();
    const a = new MotorFalso("a", "Ana", bus, 1);
    const b = new MotorFalso("b", "Beto", bus, 2);
    const ad = crear(a);
    const bd = crear(b, { titulo: "Beto" });
    expect(ad.vista().tipo).toBe("voz");

    await ad.cambiarTipo("video");
    await vaciar();
    expect(a.llamadas).toEqual(["camara"]);
    expect(a.colgar).not.toHaveBeenCalled();
    expect(a.enviados.find((c) => c.k === "tipo")).toMatchObject({ k: "tipo", a: "video" });
    expect(bd.vista().chip).toMatch(/Ana pasa a vídeo/);
    expect(bd.vista().tipo).toBe("video");
    expect(ad.vista().tipo).toBe("video");
    expect(ad.vista().cambiandoA).toBeNull();

    await ad.cambiarTipo("pantalla");
    await vaciar();
    expect(a.llamadas).toEqual(["camara", "pantalla"]);
    expect(bd.vista().tipo).toBe("pantalla");

    await ad.cambiarTipo("voz");
    await vaciar();
    // Apagó la pantalla y no había cámara nueva que apagar (la pantalla ya había sustituido a la cámara en el motor falso).
    expect(a.pantalla).toBe(false);
    expect(ad.vista().tipo).toBe("voz");
    expect(a.colgar).not.toHaveBeenCalled();
  });

  it("si el aparato no puede, vuelve a como estaba y lo dice (no queda una llamada a medias)", async () => {
    const m = new MotorFalso("a", "Yo");
    m.errores.camara = "Cámara ocupada por otra app.";
    const ad = crear(m);
    await expect(ad.cambiarTipo("video")).rejects.toThrow("Cámara ocupada por otra app.");
    expect(ad.vista().cambiandoA).toBeNull();
    expect(ad.vista().chip ?? null).toBeNull();
    expect(ad.vista().tipo).toBe("voz");
  });

  it("no encadena dos cambios y no cambia al mismo tipo", async () => {
    const m = new MotorFalso("a", "Yo");
    const ad = crear(m);
    await expect(ad.cambiarTipo("voz")).rejects.toThrow(/Ya estás/);
    const p = ad.cambiarTipo("video");
    await vaciar(1);
    await p;
    expect(m.llamadas.filter((x) => x === "camara")).toHaveLength(1);
  });
});

describe("invitar: de 1:1 a grupo sin colgar", () => {
  const grupo: Invitable = { id: "g1", nombre: "Equipo", clase: "grupo", miembros: 3 };
  const ana: Invitable = { id: "u1", nombre: "Carla", clase: "usuario" };

  it("avisa a quien se invita, lo difunde y dice que la llamada pasa a grupo", async () => {
    const bus = new BusFalso();
    const a = new MotorFalso("a", "Ana", bus, 1);
    new MotorFalso("b", "Beto", bus, 2);
    const invitarA = vi.fn(async (q: Invitable[]) => ({ entregadas: q, fallidas: [] }));
    const ad = crear(a, { invitarA });
    await ad.acciones.invitar?.([grupo, ana]);
    expect(invitarA).toHaveBeenCalledWith([grupo, ana]);
    expect(a.enviados.find((c) => c.k === "invitacion")).toMatchObject({ ids: ["g1", "u1"] });
    expect(ad.vista().aviso).toMatch(/Avisado: Equipo, Carla/);
    expect(ad.vista().aviso).toMatch(/pasa a ser de grupo/);
    expect(a.colgar).not.toHaveBeenCalled();
  });

  it("con la llamada completa no invita y explica el tope; sin forma de avisar, también lo dice", async () => {
    const bus = new BusFalso();
    const a = new MotorFalso("a", "Ana", bus, 1);
    for (let i = 2; i <= 8; i++) new MotorFalso(`p${i}`, `P${i}`, bus, i);
    const invitarA = vi.fn(async () => ({ entregadas: [], fallidas: [] }));
    const ad = crear(a, { invitarA });
    expect(ad.vista().motivos?.invitar).toMatch(/completa/);
    await ad.acciones.invitar?.([ana]);
    expect(invitarA).not.toHaveBeenCalled();
    const solo = crear(new MotorFalso("s", "S"));
    await solo.acciones.invitar?.([ana]);
    expect(solo.vista().aviso).toMatch(/enlace de la llamada/);
  });

  it("lo que no se pudo avisar se cuenta con su motivo", async () => {
    const m = new MotorFalso("a", "Ana");
    const ad = crear(m, { invitarA: async (q) => ({ entregadas: [], fallidas: q.map((invitable) => ({ invitable, motivo: "No se pudo enviar el aviso." })) }) });
    await ad.acciones.invitar?.([ana]);
    expect(ad.vista().aviso).toContain("Carla: No se pudo enviar el aviso.");
  });
});

describe("grabación con consentimiento visible", () => {
  class GrabadoraFalsa {
    static creadas = 0;
    static isTypeSupported = () => true;
    state = "recording";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor() {
      GrabadoraFalsa.creadas++;
    }
    start() {
      queueMicrotask(() => this.ondataavailable?.({ data: new Blob(["x"]) }));
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  }
  const grabacion = () => ({
    ctor: GrabadoraFalsa as never,
    mezcla: () => ({ stream: {} as MediaStream, anadir: vi.fn(), cerrar: vi.fn() }),
    guardar: vi.fn(async (_b: Blob, nombre: string) => `grabaciones-llamada/${nombre}`),
  });

  it("avisa a TODOS, espera su acuse y solo entonces graba; todos ven el indicador; al parar elige destino y guarda", async () => {
    GrabadoraFalsa.creadas = 0;
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    const mc = new MotorFalso("c", "Cris", bus, 3);
    const g = grabacion();
    const A = crear(ma, { grabacion: g });
    const B = crear(mb);
    const C = crear(mc);
    await A.acciones.iniciarGrabacion?.();
    await vaciar();
    expect(A.vista().grabacion?.fase).toBe("grabando");
    expect(GrabadoraFalsa.creadas).toBe(1);
    // Los dos acusaron el aviso y los dos lo ven.
    expect(mb.enviados.some((c) => c.k === "grabacion-ack")).toBe(true);
    expect(mc.enviados.some((c) => c.k === "grabacion-ack")).toBe(true);
    for (const v of [B.vista(), C.vista()]) expect(Object.values(v.grabacion?.graban ?? {}).map((x) => x.nombre)).toEqual(["Ana"]);

    await A.acciones.pararGrabacion?.();
    await vaciar();
    expect(A.vista().grabacion?.fase).toBe("decidiendo");
    expect(Object.keys(B.vista().grabacion?.graban ?? {})).toHaveLength(0);
    await A.acciones.destinoGrabacion?.("archivos");
    expect(g.guardar).toHaveBeenCalledTimes(1);
    expect(A.vista().aviso).toMatch(/Grabación guardada en Archivos: grabaciones-llamada\/llamada-.*\.webm/);
    expect(A.vista().grabacion?.fase).toBe("apagada");
  });

  it("falla cerrado: si un participante no acusa el aviso, NO se graba y se dice por qué", async () => {
    GrabadoraFalsa.creadas = 0;
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    new MotorFalso("c", "Cris", bus, 3);
    bus.sordos.add("c");
    const A = crear(ma, { grabacion: grabacion() });
    crear(mb);
    await A.acciones.iniciarGrabacion?.();
    await vaciar();
    expect(GrabadoraFalsa.creadas).toBe(0);
    expect(A.vista().grabacion?.fase).toBe("apagada");
    expect(A.vista().aviso).toMatch(/aviso de grabación no llegó a todos/);
  });

  it("quien entra tarde recibe el aviso de la grabación en marcha", async () => {
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    const A = crear(ma, { grabacion: grabacion() });
    crear(mb);
    await A.acciones.iniciarGrabacion?.();
    await vaciar();
    const mc = new MotorFalso("c", "Cris", bus, 3);
    const C = crear(mc);
    bus.sincronizar();
    await vaciar();
    expect(Object.values(C.vista().grabacion?.graban ?? {}).map((x) => x.nombre)).toEqual(["Ana"]);
  });

  it("sin grabadora en el aparato, el control sale desactivado con su motivo", () => {
    const m = new MotorFalso("a", "Yo");
    const ad = crear(m, {}, { ...ENTORNO_ESCRITORIO, grabadora: false });
    expect(ad.vista().motivos?.grabar).toMatch(/no puede grabar/);
  });
});

describe("Astraura en la llamada: la misma respuesta en todas las neuronas", () => {
  const ajustes = { voz: "voz-1", tono: "cercano" as const, velocidad: 1 };
  const astr = (capaz = true) => ({ capaz, local: false, responder: vi.fn(async (q: string, _contexto: string) => `Respuesta a: ${q}`), hablar: vi.fn(), ajustes: () => ajustes });

  async function sala(capaces: boolean[]) {
    const bus = new BusFalso();
    const motores = capaces.map((_, i) => new MotorFalso(String.fromCharCode(97 + i), `N${i}`, bus, i + 1));
    const deps = capaces.map((c) => astr(c));
    const ads = motores.map((m, i) => crear(m, { astraura: deps[i] }));
    for (const ad of ads) ad.acciones.alternarAstraura?.();
    await vaciar();
    return { bus, motores, deps, ads };
  }

  it("una sola neurona genera (la de quien pregunta, si puede); todas las activas muestran lo MISMO y leen con los mismos ajustes", async () => {
    const { deps, ads } = await sala([true, true, true]);
    ads[1].acciones.alternarHablarAstraura?.();
    await ads[0].acciones.preguntarAstraura?.("¿qué hora es?");
    await vaciar();
    expect(deps.map((d) => d.responder.mock.calls.length)).toEqual([1, 0, 0]);
    const resp = ads.map((a) => a.vista().astraura?.respuestas ?? []);
    for (const r of resp) expect(r).toHaveLength(1);
    expect(new Set(resp.map((r) => r[0].id)).size).toBe(1);
    expect(new Set(resp.map((r) => r[0].texto)).size).toBe(1);
    expect(resp[2][0].ajustes).toEqual(ajustes);
    // La neurona que pidió leer en voz alta lo lee con los ajustes compartidos; las demás, no.
    expect(deps[1].hablar).toHaveBeenCalledWith("Respuesta a: ¿qué hora es?", ajustes);
    expect(deps[0].hablar).not.toHaveBeenCalled();
    expect(deps[2].hablar).not.toHaveBeenCalled();
  });

  it("si quien pregunta no puede generar, lo hace otra y todas siguen viendo la misma respuesta (una vez)", async () => {
    const { deps, ads } = await sala([false, true, true]);
    await ads[0].acciones.preguntarAstraura?.("resume");
    await vaciar();
    expect(deps.map((d) => d.responder.mock.calls.length)).toEqual([0, 1, 0]);
    for (const a of ads) expect(a.vista().astraura?.respuestas).toHaveLength(1);
  });

  it("sin activar Astraura no se comparte ni se muestra nada; y no se puede preguntar", async () => {
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "A", bus, 1);
    const mb = new MotorFalso("b", "B", bus, 2);
    const A = crear(ma, { astraura: astr() });
    const B = crear(mb, { astraura: astr() });
    A.acciones.alternarAstraura?.();
    await vaciar();
    await A.acciones.preguntarAstraura?.("hola");
    await vaciar();
    expect(A.vista().astraura?.respuestas).toHaveLength(1);
    expect(B.vista().astraura?.respuestas).toHaveLength(0);
    await B.acciones.preguntarAstraura?.("¿puedo?");
    expect(B.vista().aviso).toMatch(/Activa Astraura/);
  });

  it("la transcripción solo se comparte con quien tiene Astraura y entra en el contexto del prompt", async () => {
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    let alTexto: (t: string) => void = () => undefined;
    const reconocedor = { tipo: "navegador" as const, iniciar: (cb: (t: string) => void) => { alTexto = cb; return () => undefined; } };
    const da = astr();
    const db = astr();
    const A = crear(ma, { astraura: da, reconocedor });
    const B = crear(mb, { astraura: db });
    A.acciones.alternarAstraura?.();
    B.acciones.alternarAstraura?.();
    await vaciar();
    A.acciones.alternarTranscripcion?.();
    alTexto("vamos a cenar a las nueve");
    await vaciar();
    await B.acciones.preguntarAstraura?.("¿a qué hora cenamos?");
    await vaciar();
    expect(db.responder.mock.calls[0][1]).toContain("Ana: vamos a cenar a las nueve");
  });
});

describe("chat, reacciones y terminar para todos", () => {
  it("el chat y las reacciones llegan a todos; una reacción rara se descarta", async () => {
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    const A = crear(ma, { duracionReaccionMs: 30 });
    const B = crear(mb, { duracionReaccionMs: 30 });
    A.acciones.enviarChat?.("  hola a todos  ");
    A.acciones.reaccionar?.("👍");
    A.acciones.reaccionar?.("💣");
    await vaciar();
    expect(A.vista().chat?.[0]).toMatchObject({ texto: "hola a todos", mio: true });
    expect(B.vista().chat?.[0]).toMatchObject({ texto: "hola a todos", mio: false, nombre: "Ana" });
    expect(B.vista().reacciones?.map((r) => r.emoji)).toEqual(["👍"]);
    await new Promise((r) => setTimeout(r, 60));
    expect(B.vista().reacciones).toHaveLength(0);
  });

  it("solo quien llevaba más tiempo en la llamada la termina para todos; una orden de otro se ignora", async () => {
    const bus = new BusFalso();
    const ma = new MotorFalso("a", "Ana", bus, 1);
    const mb = new MotorFalso("b", "Beto", bus, 2);
    const mc = new MotorFalso("c", "Cris", bus, 3);
    const A = crear(ma, { unoAUno: false, titulo: "Equipo" });
    const B = crear(mb, { unoAUno: false, titulo: "Equipo" });
    crear(mc, { unoAUno: false, titulo: "Equipo" });
    expect(A.vista().puedeTerminarParaTodos).toBe(true);
    expect(B.vista().puedeTerminarParaTodos).toBe(false);
    expect(B.vista().motivos?.["colgar-todos"]).toMatch(/Solo quien empezó/);
    // Beto manda un fin-todos a mano (aparato manipulado): Ana y Cris no cuelgan.
    mb.enviarApp({ k: "fin-todos", motivo: "x" });
    await vaciar();
    expect(ma.colgar).not.toHaveBeenCalled();
    expect(mc.colgar).not.toHaveBeenCalled();
    A.acciones.colgarTodos?.();
    await vaciar();
    expect(ma.colgar).toHaveBeenCalled();
    expect(mb.colgar).toHaveBeenCalled();
    expect(mc.colgar).toHaveBeenCalled();
  });

  it("«Terminar para todos» no existe en una llamada de dos (colgar ya termina para los dos)", () => {
    const ad = crear(new MotorFalso("a", "Yo"));
    expect(ad.vista().puedeTerminarParaTodos).toBe(false);
    expect(ad.vista().motivos?.["colgar-todos"]).toMatch(/de dos/);
  });
});

describe("vista: calidad, estados y cierre", () => {
  it("la calidad usa lo medido (latencia, pérdida, códec, cifrado) y el medio real", () => {
    const ad = crear(new MotorFalso("a", "Yo"));
    const filas = Object.fromEntries((ad.vista().calidad?.filas ?? []).map((f) => [f.clave, f.valor]));
    expect(filas.latencia).toBe("80 ms");
    expect(filas.perdida).toBe("2.0 %");
    expect(filas.codec).toBe("Opus");
    expect(filas.cifrado).toMatch(/cifrado/);
    expect(filas.medio).toBe("Voz por WebRTC · cifrada");
  });

  it("la voz por enlace de datos da su calidad en texto: se aprovecha", () => {
    expect(medidasDeTexto("latencia 180 ms · pérdida 2,5 % · ADPCM")).toEqual({ rttMs: 180, perdidaPct: 2.5, codec: "ADPCM" });
    expect(medidasDeTexto(undefined)).toEqual({ rttMs: null, perdidaPct: null, codec: null });
  });

  it("estados: preparando/conectando = saliente; esperando tras contestar = reconectando; fin según quién y cómo", () => {
    expect(estadoDesdeFase({ fase: "conectando", contestada: false }, true, false, false)).toBe("saliente");
    expect(estadoDesdeFase({ fase: "esperando", contestada: true }, true, false, false)).toBe("reconectando");
    expect(estadoDesdeFase({ fase: "en-curso", contestada: true }, true, true, false)).toBe("en-espera");
    expect(estadoDesdeFase({ fase: "error", contestada: false }, true, false, false)).toBe("terminada");
    expect(finDesdeEstado({ fase: "terminada", contestada: false, rechazos: [] }, true, true)).toBe("sin-respuesta");
    expect(finDesdeEstado({ fase: "terminada", contestada: false, rechazos: [{ uid: "u", nombre: "B" }] }, true, true)).toBe("rechazada");
    expect(finDesdeEstado({ fase: "terminada", contestada: true, rechazos: [] }, false, true)).toBe("colgada");
    expect(finDesdeEstado({ fase: "error", contestada: false, rechazos: [] }, true, true)).toBe("fallo");
    expect(tipoDesdeEstado({ participantes: [], camara: false, pantalla: true })).toBe("pantalla");
  });

  it("al terminar la llamada se informa UNA vez (para el historial) con el medio, la duración y el tipo", async () => {
    const m = new MotorFalso("a", "Yo");
    m.poner({ inicio: Date.now() - 5000 });
    const alTerminar = vi.fn();
    const ad = crear(m, { alTerminar });
    ad.acciones.colgar?.();
    await vaciar();
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(alTerminar.mock.calls[0][0]).toMatchObject({ medio: "Voz por WebRTC · cifrada", tipo: "voz", contestada: true });
    expect(ad.vista().estado).toBe("terminada");
  });
});
