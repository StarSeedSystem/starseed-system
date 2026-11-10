import { describe, expect, it } from "vitest";
import {
  AlmacenCanales,
  AlmacenMemoria,
  AlmacenOPFS,
  FuenteEspejo,
  crearFetchEspejoSeguro,
  crearFirmante,
  crearVerificador,
  firmarCanal,
  generarParFirma,
  idCanal,
  leerRegistroCanal,
  type ArchivoOPFS,
  type DirOPFS,
  type FetchEspejo,
  type RegistroCanal,
  type RespuestaEspejo,
} from "../index";

const RAIZ_A = "aa".repeat(32);
const RAIZ_B = "bb".repeat(32);
const RAIZ_C = "cc".repeat(32);
const P = 64 * 1024;
const trozo = (n: number, v: number) => new Uint8Array(n).fill(v);

describe("almacén de trozos", () => {
  it("registra, guarda, lee, cuenta duplicados y rechaza tamaños o índices que no cuadran", async () => {
    const a = new AlmacenMemoria();
    expect(await a.registrar({ raiz: RAIZ_A, ambito: "publico", tamano: 2 * P + 10, tamanoPieza: P })).toBe(true);
    expect(await a.registrar({ raiz: "mala", ambito: "publico", tamano: 10, tamanoPieza: P })).toBe(false);
    expect(await a.guardar(RAIZ_A, 0, trozo(P, 1))).toBe("ok");
    expect(await a.guardar(RAIZ_A, 0, trozo(P, 1))).toBe("duplicado");
    expect(await a.guardar(RAIZ_A, 1, trozo(P - 1, 1))).toBe("invalido");
    expect(await a.guardar(RAIZ_A, 3, trozo(P, 1))).toBe("invalido");
    expect(await a.guardar(RAIZ_B, 0, trozo(P, 1))).toBe("desconocido");
    expect(await a.guardar(RAIZ_A, 2, trozo(10, 3))).toBe("ok");
    expect(await a.piezas(RAIZ_A)).toEqual([0, 2]);
    expect((await a.leer(RAIZ_A, 2))![0]).toBe(3);
    expect(await a.leer(RAIZ_A, 1)).toBeNull();
    const info = (await a.info(RAIZ_A))!;
    expect(info).toMatchObject({ piezas: 2, nPiezas: 3, bytes: P + 10, completo: false });
    await a.guardar(RAIZ_A, 1, trozo(P, 2));
    expect((await a.info(RAIZ_A))!.completo).toBe(true);
  });

  it("cuota por ámbito: desaloja lo menos usado que no esté fijado ni retenido", async () => {
    const a = new AlmacenMemoria({ publico: 3 * P });
    for (const r of [RAIZ_A, RAIZ_B, RAIZ_C]) await a.registrar({ raiz: r, ambito: "publico", tamano: P, tamanoPieza: P });
    expect(await a.guardar(RAIZ_A, 0, trozo(P, 1))).toBe("ok");
    expect(await a.guardar(RAIZ_B, 0, trozo(P, 2))).toBe("ok");
    await a.leer(RAIZ_A, 0); // A es la más reciente; B la menos usada
    await a.registrar({ raiz: "dd".repeat(32), ambito: "publico", tamano: 2 * P, tamanoPieza: P });
    expect(await a.guardar("dd".repeat(32), 0, trozo(P, 4))).toBe("ok"); // 3 trozos: justo la cuota
    expect(await a.guardar("dd".repeat(32), 1, trozo(P, 4))).toBe("ok"); // exige desalojar: cae B (la menos usada)
    expect(await a.info(RAIZ_B)).toBeNull();
    expect(await a.info(RAIZ_A)).not.toBeNull();
    // A fijada y D retenida: no se pueden desalojar, el nuevo trozo no cabe
    await a.fijar(RAIZ_A, true);
    await a.retener("dd".repeat(32));
    await a.registrar({ raiz: RAIZ_C, ambito: "publico", tamano: P, tamanoPieza: P });
    expect(await a.guardar(RAIZ_C, 0, trozo(P, 5))).toBe("cuota");
    // soltar permite desalojar de nuevo
    await a.soltar("dd".repeat(32));
    expect(await a.guardar(RAIZ_C, 0, trozo(P, 5))).toBe("ok");
    expect(await a.info(RAIZ_A)).not.toBeNull();
    expect(await a.info("dd".repeat(32))).toBeNull();
  });

  it("las cuotas son por ámbito: llenar el público no desaloja lo privado", async () => {
    const a = new AlmacenMemoria({ publico: P, privado: 10 * P });
    await a.registrar({ raiz: RAIZ_A, ambito: "privado", tamano: P, tamanoPieza: P });
    await a.guardar(RAIZ_A, 0, trozo(P, 1));
    await a.registrar({ raiz: RAIZ_B, ambito: "publico", tamano: P, tamanoPieza: P });
    await a.guardar(RAIZ_B, 0, trozo(P, 2));
    await a.registrar({ raiz: RAIZ_C, ambito: "publico", tamano: P, tamanoPieza: P });
    expect(await a.guardar(RAIZ_C, 0, trozo(P, 3))).toBe("ok");
    expect(await a.info(RAIZ_A)).not.toBeNull();
    expect(await a.bytesPorAmbito()).toEqual({ privado: P, grupo: 0, comunidad: 0, publico: P });
  });

  it("quitar no borra lo retenido", async () => {
    const a = new AlmacenMemoria();
    await a.registrar({ raiz: RAIZ_A, ambito: "grupo", tamano: P, tamanoPieza: P });
    await a.retener(RAIZ_A);
    expect(await a.quitar(RAIZ_A)).toBe(false);
    await a.soltar(RAIZ_A);
    expect(await a.quitar(RAIZ_A)).toBe(true);
  });
});

/** Sistema de archivos privado de mentira (misma forma que `FileSystemDirectoryHandle`). */
function dirFalso(): DirOPFS & { hijos: Map<string, DirOPFS | (ArchivoOPFS & { datos: Uint8Array })> } {
  const hijos = new Map<string, DirOPFS | (ArchivoOPFS & { datos: Uint8Array })>();
  const d = {
    hijos,
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      let h = hijos.get(n);
      if (!h) {
        if (!o?.create) throw new Error("NotFound");
        h = dirFalso();
        hijos.set(n, h);
      }
      return h as DirOPFS;
    },
    async getFileHandle(n: string, o?: { create?: boolean }) {
      let h = hijos.get(n) as (ArchivoOPFS & { datos: Uint8Array }) | undefined;
      if (!h) {
        if (!o?.create) throw new Error("NotFound");
        const f: ArchivoOPFS & { datos: Uint8Array } = {
          kind: "file",
          datos: new Uint8Array(0),
          async getFile() {
            return { arrayBuffer: async () => f.datos.buffer.slice(f.datos.byteOffset, f.datos.byteOffset + f.datos.byteLength) as ArrayBuffer };
          },
          async createWritable() {
            let buf = new Uint8Array(0);
            return {
              write: async (x: Uint8Array | string) => {
                buf = typeof x === "string" ? new TextEncoder().encode(x) : x.slice();
              },
              close: async () => {
                f.datos = buf;
              },
            };
          },
        };
        h = f;
        hijos.set(n, h);
      }
      return h;
    },
    async removeEntry(n: string) {
      hijos.delete(n);
    },
    async *entries() {
      for (const [k, v] of hijos) yield [k, v] as [string, DirOPFS | ArchivoOPFS];
    },
  };
  return d as DirOPFS & { hijos: Map<string, DirOPFS | (ArchivoOPFS & { datos: Uint8Array })> };
}

describe("almacén OPFS (con un sistema de archivos de mentira)", () => {
  it("guarda en carpetas por raíz, reconstruye el índice al reabrir y borra al desalojar", async () => {
    const raiz = dirFalso();
    const a = await AlmacenOPFS.abrir(raiz, { publico: 2 * P });
    await a.registrar({ raiz: RAIZ_A, ambito: "publico", tamano: 2 * P, tamanoPieza: P });
    await a.guardar(RAIZ_A, 0, trozo(P, 9));
    await a.guardar(RAIZ_A, 1, trozo(P, 8));
    await a.guardarCapa(RAIZ_A, trozo(64, 1));
    await a.fijar(RAIZ_A, true);
    expect(raiz.hijos.has(RAIZ_A)).toBe(true);
    // reabrir
    const b = await AlmacenOPFS.abrir(raiz, { publico: 2 * P });
    expect(await b.info(RAIZ_A)).toMatchObject({ piezas: 2, completo: true, fijado: true, bytes: 2 * P });
    expect((await b.leer(RAIZ_A, 1))![5]).toBe(8);
    expect((await b.leerCapa(RAIZ_A))!.length).toBe(64);
    // un contenido con índice ilegible se ignora
    const sucio = (await raiz.getDirectoryHandle(RAIZ_B, { create: true })) as DirOPFS;
    const f = await sucio.getFileHandle("meta.json", { create: true });
    const w = await f.createWritable();
    await w.write("{ no es json");
    await w.close();
    const c = await AlmacenOPFS.abrir(raiz);
    expect(await c.info(RAIZ_B)).toBeNull();
    // quitar borra la carpeta
    await c.fijar(RAIZ_A, false);
    expect(await c.quitar(RAIZ_A)).toBe(true);
    expect(raiz.hijos.has(RAIZ_A)).toBe(false);
  });
});

/* ───────────────────────────── Canales ───────────────────────────── */

describe("canales firmados", () => {
  async function editor() {
    const par = await generarParFirma();
    const firmar = crearFirmante(par);
    const fp = (await firmar(new Uint8Array(1)))!.fp;
    const reg = async (nombre: string, seq: number, raiz: string, ts = 1000): Promise<RegistroCanal> => (await firmarCanal(fp, { nombre, seq, raiz, tamano: 123, ts, ambito: "publico" }, firmar))!;
    return { fp, reg, firmar };
  }

  it("gana la secuencia más alta; una antigua repetida o igual se ignora", async () => {
    const e = await editor();
    const al = new AlmacenCanales(crearVerificador(), () => 2000);
    const r1 = await e.reg("android/ultima", 1, RAIZ_A);
    const r2 = await e.reg("android/ultima", 2, RAIZ_B);
    const r5 = await e.reg("android/ultima", 5, RAIZ_C);
    expect(await al.recibir(r1)).toBe("nuevo");
    expect(await al.recibir(r5)).toBe("actualizado");
    expect(await al.recibir(r2)).toBe("viejo");
    expect(await al.recibir(r1)).toBe("viejo");
    expect(await al.recibir(r5)).toBe("igual");
    expect(al.actual(e.fp, "android/ultima")!.raiz).toBe(RAIZ_C);
    expect(al.actual(e.fp, "otro")).toBeNull();
  });

  it("ignora firmas malas: raíz cambiada, firma de otro editor con la huella ajena, estructura rota", async () => {
    const e = await editor();
    const otro = await editor();
    const al = new AlmacenCanales(crearVerificador(), () => 2000);
    expect(await al.recibir(await e.reg("c", 1, RAIZ_A))).toBe("nuevo");
    const buena = await e.reg("c", 2, RAIZ_B);
    expect(await al.recibir({ ...buena, raiz: RAIZ_C })).toBe("firma-mala"); // cuerpo cambiado, firma de antes
    expect(await al.recibir({ ...buena, seq: 3 })).toBe("firma-mala");
    const falsa = await otro.reg("c", 9, RAIZ_C);
    expect(await al.recibir({ ...falsa, fp: e.fp, firma: { ...falsa.firma, fp: e.fp } })).toBe("firma-mala");
    expect(await al.recibir({ ...falsa, fp: e.fp })).toBe("invalido"); // fp del registro ≠ fp de la firma
    expect(await al.recibir({ ...buena, firma: { ...buena.firma, sig: falsa.firma.sig } })).toBe("firma-mala");
    expect(await al.recibir({ v: 1 })).toBe("invalido");
    expect(await al.recibir({ ...buena, nombre: "../../x" })).toBe("invalido");
    expect(await al.recibir({ ...buena, raiz: "zz" })).toBe("invalido");
    expect(al.actual(e.fp, "c")!.seq).toBe(1); // nada de lo malo cambió el estado
  });

  it("un editor que firma dos raíces con el mismo seq: todos convergen en la menor", async () => {
    const e = await editor();
    const x = await e.reg("c", 4, RAIZ_C);
    const y = await e.reg("c", 4, RAIZ_A);
    const a1 = new AlmacenCanales(crearVerificador(), () => 2000);
    const a2 = new AlmacenCanales(crearVerificador(), () => 2000);
    await a1.recibir(x);
    expect(await a1.recibir(y)).toBe("conflicto");
    await a2.recibir(y);
    expect(await a2.recibir(x)).toBe("conflicto");
    expect(a1.actual(e.fp, "c")!.raiz).toBe(RAIZ_A);
    expect(a2.actual(e.fp, "c")!.raiz).toBe(RAIZ_A);
  });

  it("rechaza registros del futuro y no crece sin límite", async () => {
    const e = await editor();
    const al = new AlmacenCanales(crearVerificador(), () => 1000, 2);
    expect(await al.recibir(await e.reg("c", 1, RAIZ_A, 1000 + 25 * 3600_000))).toBe("futuro");
    expect(await al.recibir(await e.reg("a", 1, RAIZ_A))).toBe("nuevo");
    expect(await al.recibir(await e.reg("b", 1, RAIZ_A))).toBe("nuevo");
    expect(await al.recibir(await e.reg("c", 1, RAIZ_A))).toBe("lleno");
    expect(await al.recibir(await e.reg("a", 2, RAIZ_B))).toBe("actualizado"); // actualizar uno existente sí
  });

  it("idCanal es estable y distinto por editor y nombre; leerRegistroCanal exige todo", async () => {
    const e = await editor();
    const r = await e.reg("x", 1, RAIZ_A);
    expect(leerRegistroCanal(r)).toEqual(r);
    expect(await idCanal(e.fp, "x")).toBe(await idCanal(e.fp, "x"));
    expect(await idCanal(e.fp, "x")).not.toBe(await idCanal(e.fp, "y"));
    expect(leerRegistroCanal({ ...r, ambito: "todos" })).toBeNull();
    expect(leerRegistroCanal({ ...r, tamano: -1 })).toBeNull();
  });
});

/* ───────────────────────────── Espejos ───────────────────────────── */

function respuesta(status: number, cuerpo: Uint8Array, h: Record<string, string> = {}): RespuestaEspejo {
  const headers: Record<string, string> = { "content-length": String(cuerpo.length), ...h };
  return { status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => cuerpo.buffer.slice(cuerpo.byteOffset, cuerpo.byteOffset + cuerpo.byteLength) as ArrayBuffer };
}

describe("espejo HTTP con Range", () => {
  const DATOS = new Uint8Array(1000).map((_, i) => i % 251);
  const URL_ESP = "https://cdn.example.com/f.bin";

  it("pide el rango justo y comprueba 206, Content-Range y largo", async () => {
    const vistos: string[] = [];
    const f: FetchEspejo = async (_u, init) => {
      vistos.push(init.headers.Range);
      const m = /bytes=(\d+)-(\d+)/.exec(init.headers.Range)!;
      return respuesta(206, DATOS.slice(Number(m[1]), Number(m[2]) + 1), { "content-range": `bytes ${m[1]}-${m[2]}/1000` });
    };
    const e = new FuenteEspejo(URL_ESP, f, 1000);
    const r = (await e.leerRango(100, 300))!;
    expect(vistos).toEqual(["bytes=100-299"]);
    expect(Buffer.from(r).equals(Buffer.from(DATOS.slice(100, 300)))).toBe(true);
    expect(e.estado).toMatchObject({ aciertos: 1, fallos: 0, bytes: 200, vivo: true });
    expect(await e.leerRango(900, 1001)).toBeNull(); // fuera de tamaño
    expect(await e.leerRango(5, 5)).toBeNull();
  });

  it("descarta respuestas incoherentes y da por muerto al espejo tras fallos seguidos", async () => {
    const casos: Array<[string, FetchEspejo]> = [
      ["Content-Range de otro rango", async () => respuesta(206, DATOS.slice(0, 100), { "content-range": "bytes 5-104/1000" })],
      ["200 con parte del recurso", async () => respuesta(200, DATOS.slice(0, 100))],
      ["largo distinto", async () => respuesta(206, DATOS.slice(0, 99), { "content-range": "bytes 0-99/1000", "content-length": "100" })],
      ["comprimido", async () => respuesta(206, DATOS.slice(0, 100), { "content-range": "bytes 0-99/1000", "content-encoding": "gzip" })],
      ["404", async () => respuesta(404, new Uint8Array(0))],
      ["lanza", async () => Promise.reject(new Error("red"))],
    ];
    for (const [nombre, f] of casos) {
      const e = new FuenteEspejo(URL_ESP, f, 1000, 2);
      expect(await e.leerRango(0, 100), nombre).toBeNull();
      expect(e.estado.fallos).toBe(1);
      expect(await e.leerRango(0, 100)).toBeNull();
      expect(e.vivo).toBe(false);
      expect(await e.leerRango(0, 100)).toBeNull(); // ya ni lo intenta
    }
    // 200 con el recurso entero sí vale
    const e = new FuenteEspejo(URL_ESP, async () => respuesta(200, DATOS), 1000);
    expect((await e.leerRango(0, 1000))!.length).toBe(1000);
  });

  it("marcarMalo (trozo que no casa) lo mata", async () => {
    const e = new FuenteEspejo(URL_ESP, async () => respuesta(200, DATOS), 1000);
    e.marcarMalo();
    expect(e.vivo).toBe(false);
  });

  it("capa de piezas por sidecar: largo exacto o nada", async () => {
    const vistas: string[] = [];
    const f: FetchEspejo = async (u) => {
      vistas.push(u);
      return respuesta(200, new Uint8Array(3 * 32).fill(1));
    };
    const e = new FuenteEspejo(URL_ESP + "?v=2", f, 1000);
    expect((await e.leerCapa(3))!.length).toBe(3);
    expect(vistas[0]).toBe("https://cdn.example.com/f.bin.enj-capa?v=2");
    expect(await e.leerCapa(4)).toBeNull();
  });

  it("fetch seguro: valida cada salto, no sigue redirecciones a la red interna y no se cuelga en bucles", async () => {
    const llamadas: string[] = [];
    const base: FetchEspejo = async (u, init) => {
      llamadas.push(u);
      expect(init.redirect).toBe("manual");
      if (u === "https://a.example.com/ok") return respuesta(200, new Uint8Array(1));
      if (u === "https://a.example.com/redir") return respuesta(302, new Uint8Array(0), { location: "https://b.example.com/ok2" });
      if (u === "https://b.example.com/ok2") return respuesta(200, new Uint8Array(2));
      if (u === "https://a.example.com/interna") return respuesta(302, new Uint8Array(0), { location: "http://169.254.169.254/latest/meta-data" });
      if (u === "https://a.example.com/loopback") return respuesta(301, new Uint8Array(0), { location: "https://127.0.0.1/admin" });
      if (u === "https://a.example.com/bucle") return respuesta(302, new Uint8Array(0), { location: "/bucle" });
      if (u === "https://a.example.com/sinloc") return respuesta(302, new Uint8Array(0));
      return respuesta(404, new Uint8Array(0));
    };
    const f = crearFetchEspejoSeguro(base);
    const h = { headers: {}, redirect: "manual" as const };
    expect((await f("https://a.example.com/ok", h)).status).toBe(200);
    expect((await (await f("https://a.example.com/redir", h)).arrayBuffer()).byteLength).toBe(2);
    await expect(f("https://a.example.com/interna", h)).rejects.toThrow(/no permitido/);
    await expect(f("https://a.example.com/loopback", h)).rejects.toThrow(/no permitido/);
    await expect(f("https://a.example.com/bucle", h)).rejects.toThrow(/demasiadas/);
    await expect(f("https://a.example.com/sinloc", h)).rejects.toThrow();
    for (const mala of ["http://a.example.com/ok", "https://10.0.0.5/x", "https://localhost/x", "https://nas.local/x", "ftp://a.example.com/x"]) await expect(f(mala, h)).rejects.toThrow(/no permitida/);
    expect(llamadas.some((u) => u.includes("169.254") || u.includes("127.0.0.1") || u.includes("10.0.0.5"))).toBe(false);
  });
});
