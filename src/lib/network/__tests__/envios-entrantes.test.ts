/**
 * ARC1108A — los archivos que llegan juntos forman UN envío (una ventana): agrupar por `lote` o, para
 * remitentes anteriores, por remitente y ventana de tiempo; árbol de carpetas por ruta relativa; y,
 * con los motores reales, que la oferta lleve el lote, la ruta, la vista y la verificación del origen.
 */
import { describe, expect, it } from "vitest";
import { agruparEnvios, arbolDeEnvio, carpetaDe, enviosPorDecidir, idsDeCarpeta, idsPendientes, textoMedioEnvio, VENTANA_ENVIO_MS } from "@/lib/network/envios-entrantes";
import { crearAlmacenEnMemoria, crearMotorArchivos, type CanalArchivos, type EstadoTransferencia, type MotorArchivos } from "@/lib/network/archivos-malla";

function e(p: Partial<EstadoTransferencia> & { id: string }): EstadoTransferencia {
  return {
    rol: "recibir",
    nombre: `${p.id}.txt`,
    tipo: "text/plain",
    tamano: 100,
    trozos: 1,
    progreso: 0,
    fase: "pendiente-aceptar",
    inicioMs: 1_000,
    actualizadoMs: 1_000,
    origen: "MaggaBook (red local · app nativa)",
    ...p,
  };
}

describe("agruparEnvios", () => {
  it("con lote: un envío por lote aunque lleguen separados en el tiempo; cuenta pendientes, en curso, hechos y fallos", () => {
    const envios = agruparEnvios([
      e({ id: "a", lote: "L1", loteTotal: 4, inicioMs: 1_000, mensaje: "Las fotos del viaje" }),
      e({ id: "b", lote: "L1", inicioMs: 90_000, fase: "transfiriendo" }),
      e({ id: "c", lote: "L1", inicioMs: 91_000, fase: "completada" }),
      e({ id: "d", lote: "L1", inicioMs: 92_000, fase: "error" }),
      e({ id: "x", lote: "L2", inicioMs: 2_000 }),
      e({ id: "propio", rol: "enviar", lote: "L1" }),
    ]);
    // El más reciente primero (por el instante de su primera oferta).
    expect(envios.map((v) => v.clave)).toEqual(["lote:L2", "lote:L1"]);
    const l1 = envios.find((v) => v.clave === "lote:L1") as (typeof envios)[number];
    expect(l1.archivos.map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
    expect(l1).toMatchObject({ pendientes: 1, enCurso: 1, completados: 1, fallidos: 1, anunciados: 4, mensaje: "Las fotos del viaje", bytes: 400 });
    expect(idsPendientes(l1)).toEqual(["a"]);
  });

  it("sin lote (remitentes anteriores): por remitente y ventana de tiempo", () => {
    const envios = agruparEnvios([
      e({ id: "1", inicioMs: 0 }),
      e({ id: "2", inicioMs: 5_000 }),
      e({ id: "3", inicioMs: 5_000 + VENTANA_ENVIO_MS }),
      e({ id: "4", inicioMs: 5_000 + 3 * VENTANA_ENVIO_MS }),
      e({ id: "otro", origen: "Maggaboard", inicioMs: 1_000 }),
    ]);
    const porClave = Object.fromEntries(envios.map((v) => [v.clave, v.archivos.map((a) => a.id)]));
    expect(Object.values(porClave)).toEqual(expect.arrayContaining([["1", "2", "3"], ["4"], ["otro"]]));
    expect(envios).toHaveLength(3);
  });

  it("los envíos por decidir se atienden del más antiguo al más nuevo", () => {
    const envios = agruparEnvios([e({ id: "n", lote: "NUEVO", inicioMs: 9_000 }), e({ id: "v", lote: "VIEJO", inicioMs: 1_000 }), e({ id: "h", lote: "HECHO", inicioMs: 500, fase: "completada" })]);
    expect(enviosPorDecidir(envios).map((v) => v.clave)).toEqual(["lote:VIEJO", "lote:NUEVO"]);
  });
});

describe("arbolDeEnvio", () => {
  it("arma las carpetas con las rutas relativas (carpetas primero, por nombre) y deja en la raíz lo suelto", () => {
    const arbol = arbolDeEnvio([
      e({ id: "suelto", nombre: "nota.md" }),
      e({ id: "f2", nombre: "b.jpg", ruta: "viaje/fotos/b.jpg" }),
      e({ id: "f1", nombre: "a.jpg", ruta: "viaje/fotos/a.jpg" }),
      e({ id: "v1", nombre: "clip.mp4", ruta: "viaje/videos/clip.mp4" }),
      e({ id: "r", nombre: "leeme.txt", ruta: "viaje/leeme.txt" }),
    ]);
    expect(arbol.archivos.map((a) => a.id)).toEqual(["suelto"]);
    expect(arbol.carpetas.map((c) => c.ruta)).toEqual(["viaje"]);
    const viaje = arbol.carpetas[0];
    expect(viaje.carpetas.map((c) => c.ruta)).toEqual(["viaje/fotos", "viaje/videos"]);
    expect(viaje.archivos.map((a) => a.id)).toEqual(["r"]);
    expect(viaje.carpetas[0].archivos.map((a) => a.id)).toEqual(["f1", "f2"]);
    expect(idsDeCarpeta(viaje).sort()).toEqual(["f1", "f2", "r", "v1"]);
    expect(carpetaDe({ ruta: "viaje/fotos/a.jpg" })).toBe("viaje/fotos");
    expect(carpetaDe({})).toBe("");
  });
});

describe("con los motores reales: la oferta trae su envío y quien recibe la ve agrupada", () => {
  function par(): { a: CanalArchivos; b: CanalArchivos } {
    const oyentes = { a: new Set<(d: string | ArrayBuffer) => void>(), b: new Set<(d: string | ArrayBuffer) => void>() };
    const ext = (yo: "a" | "b"): CanalArchivos => ({
      enviar: (t) => {
        setTimeout(() => oyentes[yo === "a" ? "b" : "a"].forEach((l) => l(t)), 0);
        return true;
      },
      alMensaje: (cb) => {
        oyentes[yo].add(cb);
        return () => oyentes[yo].delete(cb);
      },
    });
    return { a: ext("a"), b: ext("b") };
  }

  it("tres archivos de un envío (uno en una carpeta) llegan como UN envío por decidir, con su mensaje, su ruta y quién lo manda", async () => {
    const canal = par();
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const motorB: MotorArchivos = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    canal.a.alMensaje((d) => motorA.manejarMensaje(canal.a, d));
    canal.b.alMensaje((d) =>
      motorB.manejarMensaje(canal.b, d, {
        mismaCuenta: false,
        etiquetaOrigen: "MaggaBook (red local · app nativa)",
        verificarPermiso: () => true,
        via: "Red local (app nativa) · enlace directo WebRTC",
        verificacion: { tipo: "firma", texto: "Firmado por su identidad de malla", huella: "fp-mac" },
      }),
    );
    const lote = { id: "lote_prueba", total: 3, mensaje: "Te paso lo de ayer" };
    await motorA.enviarArchivo(canal.a, new Blob(["hola"]), "nota.txt", { tipo: "dispositivo" }, { lote, vista: { tipo: "texto", texto: "hola" } });
    await motorA.enviarArchivo(canal.a, new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])]), "a.png", { tipo: "dispositivo" }, { lote, ruta: "fotos/a.png", tipoMime: "image/png" });
    await motorA.enviarArchivo(canal.a, new Blob(["MZ…"]), "setup.exe", { tipo: "dispositivo" }, { lote });
    for (let i = 0; i < 50 && motorB.ofertasPendientes().length + motorB.listaTransferencias().filter((x) => x.fase === "rechazada").length < 3; i++) await new Promise((r) => setTimeout(r, 5));
    const envios = agruparEnvios(motorB.listaTransferencias());
    expect(envios).toHaveLength(1);
    const v = envios[0];
    expect(v.clave).toBe("lote:lote_prueba");
    expect(v.mensaje).toBe("Te paso lo de ayer");
    expect(v.anunciados).toBe(3);
    expect(v.via).toBe("Red local (app nativa) · enlace directo WebRTC");
    expect(v.verificacion).toMatchObject({ tipo: "firma", huella: "fp-mac" });
    expect(v.archivos.find((a) => a.nombre === "a.png")?.ruta).toBe("fotos/a.png");
    expect(v.archivos.find((a) => a.nombre === "nota.txt")?.vista).toEqual({ tipo: "texto", texto: "hola" });
    // El centinela de la malla ya rechaza solo un .exe (sin preguntar); los otros dos esperan a la persona.
    expect(v.archivos.find((a) => a.nombre === "setup.exe")?.fase).toBe("rechazada");
    expect(v.pendientes).toBe(2);
  });
});

describe("textoMedioEnvio (BLE1108B)", () => {
  it("dice el medio y el tiempo estimado ANTES de decidir; con la velocidad medida, sin «sin medir»", () => {
    // 3 MB a 200 kbit/s ≈ 120 s ≈ 2 min
    expect(textoMedioEnvio({ via: "Bluetooth directo", bytes: 3_000_000, kbps: 200 })).toBe("por Bluetooth: ~2 min estimado");
    expect(textoMedioEnvio({ via: "Bluetooth directo", bytes: 20_000, kbps: 200 })).toBe("por Bluetooth: ~1 s estimado");
  });
  it("sin medir usa la media del aire típico y lo avisa; fuera de Bluetooth no dice nada", () => {
    const t = textoMedioEnvio({ via: "Bluetooth directo", bytes: 5 * 1024 * 1024 });
    expect(t).toMatch(/^por Bluetooth: ~\d+ min estimado \(sin medir\)$/);
    expect(textoMedioEnvio({ via: "Red local (app nativa)", bytes: 5_000_000, kbps: 100 })).toBeNull();
    expect(textoMedioEnvio({ bytes: 10 })).toBeNull();
  });
});
