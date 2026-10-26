import { beforeEach, describe, expect, it } from "vitest";
import { crearControlador, restriccionesPantalla, type Controlador } from "../controlador";
import {
  ContextoAudioFalso,
  FlujoFalso,
  GrabadorFalso,
  PistaFalsa,
  UA_SAFARI_IPHONE,
  depsFalsas,
  flujoDeCamara,
  flujoDeMicro,
  flujoDePantalla,
  type DepsFalsas,
} from "../falsos-prueba";
import { CALIDADES, LIMITE_AUTOPARADA_BYTES, OPCIONES_POR_DEFECTO, type OpcionesGrabacion } from "../tipos";

const vaciar = () => new Promise<void>((r) => setTimeout(r, 0));

interface Banco {
  deps: DepsFalsas;
  c: Controlador;
  pedidos: { display: number; usuario: Array<{ video?: unknown; audio?: unknown }> };
  pantalla: FlujoFalso;
  camara: FlujoFalso;
  micro: FlujoFalso;
}

function montar(opts: { audioPantalla?: boolean; entorno?: Parameters<typeof depsFalsas>[0] } = {}): Banco {
  const deps = depsFalsas(opts.entorno);
  const pantalla = flujoDePantalla({ audio: opts.audioPantalla });
  const camara = flujoDeCamara();
  const micro = flujoDeMicro();
  const pedidos: Banco["pedidos"] = { display: 0, usuario: [] };
  if (deps.entorno.mediaDevices && !opts.entorno?.mediaDevices) {
    deps.entorno.mediaDevices = {
      getDisplayMedia: async () => {
        pedidos.display += 1;
        return pantalla;
      },
      getUserMedia: async (c: { video?: unknown; audio?: unknown }) => {
        pedidos.usuario.push(c);
        return c.video ? camara : micro;
      },
      getSupportedConstraints: () => ({}),
    };
  }
  return { deps, c: crearControlador(deps), pedidos, pantalla, camara, micro };
}

const op = (extra: Partial<OpcionesGrabacion> = {}): OpcionesGrabacion => ({ ...OPCIONES_POR_DEFECTO, cuentaAtras: 0, ...extra });
const grabador = () => GrabadorFalso.instancias[GrabadorFalso.instancias.length - 1];

beforeEach(() => {
  GrabadorFalso.reiniciar(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]);
  ContextoAudioFalso.creados = 0;
});

describe("grabadora · permisos y soporte", () => {
  it("crear el controlador y mirar su estado NO pide ningún permiso", () => {
    const b = montar();
    b.c.obtener();
    b.c.soporte();
    expect(b.pedidos.display).toBe(0);
    expect(b.pedidos.usuario).toHaveLength(0);
    expect(b.c.obtener().fase).toBe("inactiva");
  });

  it("al pulsar Grabar pide SOLO la pantalla (micro y cámara no, si no se activaron)", async () => {
    const b = montar();
    await b.c.iniciar(op());
    expect(b.pedidos.display).toBe(1);
    expect(b.pedidos.usuario).toHaveLength(0);
  });

  it("la pantalla se pide antes que nada, sin esperar a otra cosa (conserva el gesto del clic)", async () => {
    const b = montar();
    const orden: string[] = [];
    const md = b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<FlujoFalso>; getUserMedia: (c: { video?: unknown }) => Promise<FlujoFalso> };
    const display = md.getDisplayMedia;
    const usuario = md.getUserMedia;
    md.getDisplayMedia = () => {
      orden.push("pantalla");
      return display();
    };
    md.getUserMedia = (c) => {
      orden.push(c.video ? "camara" : "micro");
      return usuario(c);
    };
    const promesa = b.c.iniciar(op({ camaraSuperpuesta: true, microfono: true }));
    // Nada de `await` entre la llamada y la petición de la pantalla.
    expect(orden).toEqual(["pantalla"]);
    await promesa;
    expect(orden).toEqual(["pantalla", "camara", "micro"]);
  });

  it("en iPhone no hay botón que valga: iniciar da un error claro y no toca el navegador", async () => {
    const b = montar({
      entorno: { userAgent: UA_SAFARI_IPHONE, plataforma: "iPhone", puntosTactiles: 5, mediaDevices: { getUserMedia: async () => new FlujoFalso() } },
    });
    await b.c.iniciar(op());
    const s = b.c.obtener();
    expect(s.fase).toBe("error");
    expect(s.error).toMatch(/iPhone y iPad/);
    expect(GrabadorFalso.instancias).toHaveLength(0);
    expect(b.c.soporte().pantalla).toBe(false);
  });

  it("cerrar el selector de pantalla no es un error: vuelve a inactiva con un aviso", async () => {
    const b = montar();
    (b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<never> }).getDisplayMedia = async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    };
    await b.c.iniciar(op());
    const s = b.c.obtener();
    expect(s.fase).toBe("inactiva");
    expect(s.error).toBeNull();
    expect(s.avisos[0]).toMatch(/No elegiste qué compartir/);
  });

  it("restricciones de pantalla: audio y systemAudio solo si se pidieron", () => {
    expect(restriccionesPantalla(op(), CALIDADES.estandar)).toMatchObject({ audio: false });
    expect(restriccionesPantalla(op({ sonidoSistema: true }), CALIDADES.estandar)).toMatchObject({ systemAudio: "include", audio: { echoCancellation: false } });
    expect(restriccionesPantalla(op(), CALIDADES.ligera).video).toEqual({ frameRate: { ideal: 15, max: 30 } });
  });
});

describe("grabadora · ciclo completo", () => {
  it("cuenta atrás 3 → graba → pausa → reanuda → para → archivo listo, y suelta todo", async () => {
    const b = montar();
    await b.c.iniciar(op({ cuentaAtras: 3 }));
    expect(b.c.obtener()).toMatchObject({ fase: "cuenta-atras", cuenta: 3, superficie: "monitor" });
    expect(grabador().state).toBe("inactive"); // todavía no graba

    b.deps.reloj.avanzar(1000);
    expect(b.c.obtener().cuenta).toBe(2);
    b.deps.reloj.avanzar(2000);
    expect(b.c.obtener()).toMatchObject({ fase: "grabando", cuenta: 0 });
    expect(grabador().llamadas).toContain("start:1000"); // trozos de 1 s: tamaño en vivo

    grabador().trozo(150_000);
    expect(b.c.obtener().bytes).toBe(150_000);
    b.deps.reloj.avanzar(4000);
    expect(b.c.duracion()).toBe(4000);

    b.c.pausar();
    expect(b.c.obtener().fase).toBe("pausada");
    expect(grabador().state).toBe("paused");
    b.deps.reloj.avanzar(10_000);
    expect(b.c.duracion()).toBe(4000); // la pausa no cuenta
    b.c.reanudar();
    expect(b.c.obtener().fase).toBe("grabando");
    b.deps.reloj.avanzar(1000);

    void b.c.parar();
    expect(b.c.obtener().fase).toBe("procesando");
    await vaciar();
    const s = b.c.obtener();
    expect(s.fase).toBe("lista");
    expect(s.resultado).toMatchObject({
      tipo: "video",
      mimeType: "video/webm",
      extension: "webm",
      nombre: "starseed-grabacion-2026-10-26-1530.webm",
      duracionMs: 5000,
    });
    expect(s.resultado!.bytes).toBe(150_000 + 2048);
    expect(s.resultado!.url).toBe("blob:falso/1");
    // Todo suelto: pistas paradas, sin temporizadores vivos.
    expect(b.pantalla.pistas.every((p) => p.detenida)).toBe(true);
    expect(b.deps.reloj.pendientes).toBe(0);

    b.c.descartar();
    expect(b.c.obtener().fase).toBe("inactiva");
    expect(b.deps.revocadas).toContain("blob:falso/1");
  });

  it("sin cuenta atrás empieza a grabar de inmediato con el mejor formato soportado", async () => {
    const b = montar();
    await b.c.iniciar(op({ cuentaAtras: 0 }));
    expect(b.c.obtener().fase).toBe("grabando");
    expect(grabador().opciones).toMatchObject({ mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 2_500_000 });
    expect(grabador().opciones.audioBitsPerSecond).toBeUndefined(); // sin audio no se pide
    expect(b.c.obtener().mimeType).toBe("video/webm;codecs=vp9");
  });

  it("en Safari (solo MP4) el archivo sale como mp4", async () => {
    GrabadorFalso.reiniciar(["video/mp4;codecs=avc1.42E01E", "video/mp4"]);
    const b = montar();
    await b.c.iniciar(op());
    await b.c.parar();
    await vaciar();
    expect(b.c.obtener().resultado).toMatchObject({ extension: "mp4", mimeType: "video/mp4" });
  });

  it("cancelar durante la cuenta atrás suelta la pantalla y no graba nada", async () => {
    const b = montar();
    await b.c.iniciar(op({ cuentaAtras: 5 }));
    b.deps.reloj.avanzar(2000);
    b.c.cancelar();
    expect(b.c.obtener().fase).toBe("inactiva");
    expect(b.pantalla.pistas.every((p) => p.detenida)).toBe(true);
    b.deps.reloj.avanzar(10_000);
    expect(b.c.obtener().fase).toBe("inactiva");
    expect(grabador().llamadas).not.toContain("start:1000");
    expect(b.deps.reloj.pendientes).toBe(0);
  });

  it("cancelar mientras el navegador enseña el selector descarta la pantalla cuando llegue", async () => {
    const b = montar();
    let soltar: (f: FlujoFalso) => void = () => {};
    (b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<FlujoFalso> }).getDisplayMedia = () => new Promise((r) => (soltar = r));
    const promesa = b.c.iniciar(op());
    expect(b.c.obtener().fase).toBe("preparando");
    b.c.cancelar();
    expect(b.c.obtener().fase).toBe("inactiva");
    soltar(b.pantalla);
    await promesa;
    expect(b.c.obtener().fase).toBe("inactiva");
    expect(b.pantalla.pistas.every((p) => p.detenida)).toBe(true);
    expect(GrabadorFalso.instancias).toHaveLength(0);
  });

  it("«Dejar de compartir» del navegador cierra la grabación con lo grabado", async () => {
    const b = montar();
    await b.c.iniciar(op());
    grabador().trozo(10_000);
    b.deps.reloj.avanzar(3000);
    b.pantalla.getVideoTracks()[0].emitir("ended");
    await vaciar();
    expect(b.c.obtener()).toMatchObject({ fase: "lista" });
    expect(b.c.obtener().resultado!.duracionMs).toBe(3000);
  });

  it("«Dejar de compartir» durante la cuenta atrás la cancela", async () => {
    const b = montar();
    await b.c.iniciar(op({ cuentaAtras: 3 }));
    b.pantalla.getVideoTracks()[0].emitir("ended");
    expect(b.c.obtener().fase).toBe("inactiva");
  });

  it("si el navegador para solo la grabadora (onstop sin pedirlo) también termina en «lista»", async () => {
    const b = montar();
    await b.c.iniciar(op());
    b.deps.reloj.avanzar(2000);
    const g = grabador();
    g.state = "inactive";
    g.trozo(5000);
    g.onstop?.();
    expect(b.c.obtener().fase).toBe("lista");
  });

  it("una salida vacía es un error, no un archivo de 0 bytes", async () => {
    const b = montar();
    await b.c.iniciar(op());
    grabador().bytesAlParar = 0;
    await b.c.parar();
    await vaciar();
    expect(b.c.obtener()).toMatchObject({ fase: "error" });
    expect(b.c.obtener().error).toMatch(/vacía/);
    expect(b.c.obtener().resultado).toBeNull();
  });

  it("se detiene sola a los 400 MB y lo avisa", async () => {
    const b = montar();
    b.deps.limiteAutoparadaBytes = 10_000;
    await b.c.iniciar(op());
    grabador().trozo(4000);
    expect(b.c.obtener().fase).toBe("grabando");
    grabador().trozo(7000);
    await vaciar();
    const s = b.c.obtener();
    expect(s.fase).toBe("lista");
    expect(s.avisos.join(" ")).toMatch(/400 MB/);
    expect(LIMITE_AUTOPARADA_BYTES).toBe(400 * 1024 * 1024);
  });

  it("iniciar mientras ya se graba se ignora", async () => {
    const b = montar();
    await b.c.iniciar(op());
    await b.c.iniciar(op());
    expect(b.pedidos.display).toBe(1);
    expect(GrabadorFalso.instancias).toHaveLength(1);
  });

  it("si el constructor rechaza las opciones, reintenta sin ellas", async () => {
    const b = montar();
    let intentos = 0;
    class Picky extends GrabadorFalso {
      constructor(f: FlujoFalso, o?: { mimeType?: string }) {
        intentos += 1;
        if (o && Object.keys(o).length) throw new Error("NotSupportedError");
        super(f, o);
      }
    }
    b.deps.entorno.MediaRecorder = Picky as never;
    await b.c.iniciar(op());
    expect(intentos).toBe(2);
    expect(b.c.obtener().fase).toBe("grabando");
  });

  it("un error de la grabadora a mitad de grabación lo para todo y lo cuenta", async () => {
    const b = montar();
    await b.c.iniciar(op());
    grabador().onerror?.();
    expect(b.c.obtener()).toMatchObject({ fase: "error" });
    expect(b.pantalla.pistas.every((p) => p.detenida)).toBe(true);
  });

  it("pedir de nuevo tras una grabación lista revoca la URL anterior", async () => {
    const b = montar();
    await b.c.iniciar(op());
    await b.c.parar();
    await vaciar();
    const url = b.c.obtener().resultado!.url;
    await b.c.iniciar(op());
    expect(b.deps.revocadas).toContain(url);
    expect(b.c.obtener().resultado).toBeNull();
  });

  it("los suscriptores se avisan y se pueden contar", async () => {
    const b = montar();
    let avisos = 0;
    const baja = b.c.suscribir(() => avisos++);
    expect(b.c.observadores()).toBe(1);
    await b.c.iniciar(op());
    expect(avisos).toBeGreaterThan(1);
    baja();
    expect(b.c.observadores()).toBe(0);
  });
});

describe("grabadora · cámara, micrófono y sonido del sistema", () => {
  it("cámara superpuesta: se compone en un lienzo, la grabadora recibe SU pista y el latido se para al acabar", async () => {
    const b = montar();
    await b.c.iniciar(op({ camaraSuperpuesta: true, calidad: "alta" }));
    expect(b.c.obtener().conCamara).toBe(true);
    expect(b.deps.latidos).toHaveLength(1);
    expect(b.deps.latidos[0].fps).toBe(30);
    const pistasGrabadas = grabador().flujo.getVideoTracks();
    expect(pistasGrabadas).toHaveLength(1);
    expect(pistasGrabadas[0]).not.toBe(b.pantalla.getVideoTracks()[0]); // la del lienzo, no la directa
    expect(b.deps.elementos.some((e) => e.tag === "canvas")).toBe(true);
    await b.c.parar();
    await vaciar();
    expect(b.deps.latidos[0].parado).toBe(true);
  });

  it("sin cámara superpuesta la pantalla va DIRECTA a la grabadora (sin lienzo ni latido)", async () => {
    const b = montar();
    await b.c.iniciar(op());
    expect(grabador().flujo.getVideoTracks()[0]).toBe(b.pantalla.getVideoTracks()[0]);
    expect(b.deps.latidos).toHaveLength(0);
    expect(b.deps.elementos).toHaveLength(0);
  });

  it("si la cámara falla se graba la pantalla y se avisa (no se cancela)", async () => {
    const b = montar();
    const md = b.deps.entorno.mediaDevices as { getUserMedia: (c: { video?: unknown }) => Promise<FlujoFalso> };
    md.getUserMedia = async () => {
      throw Object.assign(new Error("x"), { name: "NotAllowedError" });
    };
    await b.c.iniciar(op({ camaraSuperpuesta: true }));
    const s = b.c.obtener();
    expect(s.fase).toBe("grabando");
    expect(s.conCamara).toBe(false);
    expect(s.avisos.join(" ")).toMatch(/Se graba sin la cámara/);
  });

  it("solo cámara: sin permiso de cámara es un error (no hay nada que grabar)", async () => {
    const b = montar();
    const md = b.deps.entorno.mediaDevices as { getUserMedia: (c: { video?: unknown }) => Promise<FlujoFalso> };
    md.getUserMedia = async () => {
      throw Object.assign(new Error("x"), { name: "NotFoundError" });
    };
    await b.c.iniciar(op({ fuente: "camara" }));
    expect(b.c.obtener()).toMatchObject({ fase: "error" });
    expect(b.c.obtener().error).toMatch(/ninguna cámara/);
    expect(b.pedidos.display).toBe(0);
  });

  it("solo cámara + micrófono graba la cámara con el micro, sin pedir pantalla", async () => {
    const b = montar();
    await b.c.iniciar(op({ fuente: "camara", microfono: true }));
    const s = b.c.obtener();
    expect(s).toMatchObject({ fase: "grabando", superficie: "camara", conCamara: true, conMicrofono: true });
    expect(b.pedidos.display).toBe(0);
    expect(grabador().opciones).toMatchObject({ audioBitsPerSecond: 128_000, mimeType: "video/webm;codecs=vp9,opus" });
  });

  it("micrófono + sonido del sistema se mezclan en una sola pista de audio", async () => {
    const b = montar({ audioPantalla: true });
    await b.c.iniciar(op({ microfono: true, sonidoSistema: true }));
    const s = b.c.obtener();
    expect(s).toMatchObject({ conMicrofono: true, conSonidoSistema: true });
    expect(ContextoAudioFalso.creados).toBe(1);
    expect(grabador().flujo.getAudioTracks()).toHaveLength(1);
    await b.c.parar();
    await vaciar();
    expect(b.c.obtener().resultado!.conAudio).toBe(true);
  });

  it("pidió sonido del sistema y el navegador no lo dio: se dice y NO se cuenta como grabado", async () => {
    const b = montar({ audioPantalla: false });
    await b.c.iniciar(op({ sonidoSistema: true }));
    const s = b.c.obtener();
    expect(s.conSonidoSistema).toBe(false);
    expect(s.avisos.join(" ")).toMatch(/Compartir audio/);
  });

  it("sin AudioContext, sistema + micro no caben: queda el del sistema y se avisa", async () => {
    const b = montar({ audioPantalla: true, entorno: undefined });
    b.deps.entorno.AudioContext = null;
    await b.c.iniciar(op({ microfono: true, sonidoSistema: true }));
    const s = b.c.obtener();
    expect(s.conSonidoSistema).toBe(true);
    expect(s.conMicrofono).toBe(false);
    expect(s.avisos.join(" ")).toMatch(/no puede mezclar/);
  });

  it("el micrófono denegado no cancela la grabación", async () => {
    const b = montar();
    const md = b.deps.entorno.mediaDevices as { getUserMedia: (c: { video?: unknown }) => Promise<FlujoFalso> };
    md.getUserMedia = async () => {
      throw Object.assign(new Error("x"), { name: "NotAllowedError" });
    };
    await b.c.iniciar(op({ microfono: true }));
    expect(b.c.obtener()).toMatchObject({ fase: "grabando", conMicrofono: false });
    expect(b.c.obtener().avisos.join(" ")).toMatch(/Se graba sin micrófono/);
  });

  it("la superficie elegida (ventana, pestaña) se lee de la pista", async () => {
    const b = montar();
    (b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<FlujoFalso> }).getDisplayMedia = async () => flujoDePantalla({ superficie: "browser" });
    await b.c.iniciar(op());
    expect(b.c.obtener().superficie).toBe("browser");
  });
});

describe("grabadora · captura de pantalla (un fotograma a PNG)", () => {
  it("pide la pantalla, dibuja un fotograma, suelta la pantalla y deja un PNG", async () => {
    const b = montar();
    const r = await b.c.capturarImagen();
    expect(r).toEqual({ ok: true });
    expect(b.pedidos.display).toBe(1);
    const cap = b.c.obtener().captura!;
    expect(cap).toMatchObject({ tipo: "imagen", mimeType: "image/png", extension: "png", nombre: "starseed-captura-2026-10-26-1530.png", ancho: 1920, alto: 1080 });
    expect(b.pantalla.pistas.every((p) => p.detenida)).toBe(true);
    expect(b.c.obtener().fase).toBe("inactiva");
  });

  it("mientras se graba usa la pantalla que ya está compartida (no vuelve a preguntar)", async () => {
    const b = montar();
    await b.c.iniciar(op());
    const r = await b.c.capturarImagen();
    expect(r).toEqual({ ok: true });
    expect(b.pedidos.display).toBe(1);
    expect(b.pantalla.pistas.some((p) => p.detenida)).toBe(false); // la grabación sigue
    expect(b.c.obtener().fase).toBe("grabando");
  });

  it("si cierran el selector, devuelve el motivo y no deja captura", async () => {
    const b = montar();
    (b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<never> }).getDisplayMedia = async () => {
      throw Object.assign(new Error("x"), { name: "NotAllowedError" });
    };
    const r = await b.c.capturarImagen();
    expect(r.ok).toBe(false);
    expect(b.c.obtener().captura).toBeNull();
  });

  it("en iPhone explica por qué no se puede", async () => {
    const b = montar({ entorno: { userAgent: UA_SAFARI_IPHONE, plataforma: "iPhone", puntosTactiles: 5, mediaDevices: { getUserMedia: async () => new FlujoFalso() } } });
    const r = await b.c.capturarImagen();
    expect(r).toMatchObject({ ok: false });
    expect((r as { mensaje: string }).mensaje).toMatch(/iPhone y iPad/);
  });

  it("una captura nueva revoca la URL de la anterior y se puede descartar", async () => {
    const b = montar();
    await b.c.capturarImagen();
    const primera = b.c.obtener().captura!.url;
    await b.c.capturarImagen();
    expect(b.deps.revocadas).toContain(primera);
    const segunda = b.c.obtener().captura!.url;
    b.c.descartarCaptura();
    expect(b.c.obtener().captura).toBeNull();
    expect(b.deps.revocadas).toContain(segunda);
  });

  it("no captura en mitad de la cuenta atrás de otra sesión sin pantalla propia", async () => {
    const b = montar();
    let soltar: (f: FlujoFalso) => void = () => {};
    (b.deps.entorno.mediaDevices as { getDisplayMedia: () => Promise<FlujoFalso> }).getDisplayMedia = () => new Promise((r) => (soltar = r));
    const grabar = b.c.iniciar(op());
    const r = await b.c.capturarImagen();
    expect(r).toMatchObject({ ok: false });
    soltar(new FlujoFalso([new PistaFalsa("video", { width: 100, height: 100 })]));
    await grabar;
  });
});
