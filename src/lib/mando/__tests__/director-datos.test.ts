import { describe, expect, it } from "vitest";
import {
  aEpoch,
  clasificarAgente,
  dependeDeNota,
  esHoyLocal,
  idEnAsuntos,
  listaAgentes,
  proveedorDeModelo,
  resumenAgentes,
  resumenDirectores,
  resumenPendientes,
  resumenProveedores,
} from "../director-datos";

const AHORA = 1_800_000_000;

describe("clasificarAgente", () => {
  it("esperando aprobación no es colgado aunque lleve horas", () => {
    const t = { fase: "esperando aprobación", avance: AHORA - 9000 };
    expect(clasificarAgente(t, AHORA)).toBe("esperando_aprobacion");
  });

  it("colgado solo si fase activa y avance supera 300 s", () => {
    expect(clasificarAgente({ fase: "escribiendo", avance: AHORA - 301 }, AHORA)).toBe("colgado");
    expect(clasificarAgente({ fase: "tsc", avance: AHORA - 400 }, AHORA)).toBe("colgado");
    expect(clasificarAgente({ fase: "revision", avance: AHORA - 301 }, AHORA)).toBe("colgado");
    expect(clasificarAgente({ fase: "escribiendo", avance: AHORA - 299 }, AHORA)).toBe("escribiendo");
  });

  it("mapea tsc, revision y hecho", () => {
    expect(clasificarAgente({ fase: "tsc", avance: AHORA }, AHORA)).toBe("verificando");
    expect(clasificarAgente({ fase: "revision", avance: AHORA }, AHORA)).toBe("revisando");
    expect(clasificarAgente({ fase: "hecho", avance: AHORA - 99_999 }, AHORA)).toBe("hecho");
  });
});

describe("resumenAgentes", () => {
  it("3 esperando aprobación ⇒ vivos 0, colgados 0", () => {
    const latidos = [
      {
        tareas: {
          a: { fase: "esperando aprobación", avance: AHORA - 9000 },
          b: { fase: "esperando aprobación", avance: AHORA - 8000 },
          c: { fase: "esperando aprobación", avance: AHORA - 7000 },
        },
      },
    ];
    const r = resumenAgentes(latidos, AHORA);
    expect(r.vivos).toBe(0);
    expect(r.colgados).toBe(0);
    expect(r.esperandoAprobacion).toBe(3);
    expect(r.porFase.esperando_aprobacion).toBe(3);
  });

  it("cuenta vivos y colgados por fase", () => {
    const latidos = [
      {
        tareas: {
          a: { fase: "escribiendo", avance: AHORA - 10 },
          b: { fase: "escribiendo", avance: AHORA - 1000 },
          c: { fase: "hecho", avance: AHORA - 5000 },
        },
      },
    ];
    const r = resumenAgentes(latidos, AHORA);
    expect(r.vivos).toBe(1);
    expect(r.colgados).toBe(1);
    expect(r.esperandoAprobacion).toBe(0);
  });

  it("ignora latidos sin tareas", () => {
    expect(resumenAgentes([{}], AHORA).vivos).toBe(0);
  });
});

describe("idEnAsuntos", () => {
  it("reconoce el id como token entero", () => {
    expect(idEnAsuntos("p318A", ["ola 318: p318A director", "otra cosa"])).toBe(true);
  });

  it("no casa subcadenas dentro de otra palabra", () => {
    expect(idEnAsuntos("318", ["ola p318A director"])).toBe(false);
  });

  it("escapa caracteres de regexp", () => {
    expect(idEnAsuntos("a.b", ["xx a.b yy"])).toBe(true);
    expect(idEnAsuntos("a.b", ["xx aXb yy"])).toBe(false);
  });
});

describe("fechas y dependencias reales", () => {
  it("interpreta YYYY-MM-DD HH:MM:SS como hora local", () => {
    const esperado = new Date("2026-09-24T04:57:36").getTime() / 1000;
    expect(aEpoch("2026-09-24 04:57:36")).toBe(esperado);
    expect(esHoyLocal("2026-09-24 04:57:36", esperado + 3600)).toBe(true);
  });

  it("extrae la dependencia nombrada en la nota", () => {
    expect(dependeDeNota("dependencia no integrada: p318C2 (pendiente)")).toEqual(["p318C2"]);
  });
});

describe("resumenPendientes", () => {
  const colas = [
    {
      nombre: "cola-318.json",
      tareas: [{ id: "p1" }, { id: "p2", depende: ["p1"] }, { id: "p3" }, { id: "p4" }, { id: "p5" }, { id: "p6" }],
    },
    {
      nombre: "cola-auto-318.json",
      tareas: [{ id: "auto1" }],
    },
    { nombre: "otro.json", tareas: [{ id: "x" }] },
  ];
  const progreso = {
    p2: { estado: "bloqueada" },
    p3: { estado: "sin_cambios" },
    p4: { estado: "fallo_tsc" },
    p5: { estado: "esperando_aprobacion" },
    p6: { estado: "commit", t: AHORA },
  };

  it("clasifica pendientes, bloqueadas, fallos y descarta cola-auto-* y duplicados", () => {
    const r = resumenPendientes(colas, progreso, ["ola: p6 integrada"], [], AHORA);
    expect(r.listas).toBe(1);
    expect(r.bloqueadas).toEqual([{ id: "p2", dependeDe: ["p1"] }]);
    expect(r.sinCambios).toBe(1);
    expect(r.fallos).toBe(1);
    expect(r.esperandoAprobacion).toBe(1);
    expect(r.integradasHoy).toBe(1);
  });

  it("combina depende de la cola y la dependencia de la nota", () => {
    const r = resumenPendientes(
      [{ nombre: "cola-1.json", tareas: [{ id: "b1", depende: ["A"] }] }],
      { b1: { estado: "bloqueada", nota: "dependencia no integrada: B (pendiente)" } },
      [],
    );
    expect(r.bloqueadas).toEqual([{ id: "b1", dependeDe: ["A", "B"] }]);
  });
});

describe("resumenProveedores", () => {
  it("agrupa modelos por proveedor (nvidia/ ⇒ nim) y detecta check-in", () => {
    const salud = {
      nim: { estado: "vivo" },
      apinex: { estado: "caido", motivo: "necesita check-in", sin_cupo_hasta: 123 },
    };
    const modelos = ["nvidia/llama", "nvidia/qwen", "apinex/gpt"];
    const r = resumenProveedores(salud, modelos);
    const nim = r.find((p) => p.proveedor === "nim");
    const apinex = r.find((p) => p.proveedor === "apinex");
    expect(nim?.modelos).toBe(2);
    expect(nim?.vivo).toBe(true);
    expect(apinex?.vivo).toBe(false);
    expect(apinex?.necesitaCheckin).toBe(true);
    expect(apinex?.sinCupoHasta).toBe(123);
  });

  it("incluye proveedores de modelos sin entrada en salud", () => {
    const r = resumenProveedores({}, ["gemini/pro"]);
    expect(r).toEqual([
      { proveedor: "gemini", vivo: false, modelos: 1, necesitaCheckin: false },
    ]);
  });

  it("respeta caído y cupo futuro en texto, e ignora la entrada claves", () => {
    const ahora = new Date("2026-09-14T04:00:00").getTime() / 1000;
    const r = resumenProveedores({
      apinex: { estado: "caido", sin_cupo_hasta: "2026-09-14 04:57:36" },
      vivo: { estado: "vivo", sin_cupo_hasta: "2026-09-14 04:57:36" },
      claves: { motivo: "metadatos" },
    }, [], ahora);
    expect(r.map((p) => p.proveedor)).toEqual(["apinex", "vivo"]);
    expect(r.every((p) => p.vivo === false)).toBe(true);
    expect(r[0].sinCupoHasta).toBe(aEpoch("2026-09-14 04:57:36"));
  });
});

describe("proveedorDeModelo", () => {
  it("prefijo nvidia/ es nim", () => {
    expect(proveedorDeModelo("nvidia/meta/llama")).toBe("nim");
    expect(proveedorDeModelo("groq/llama")).toBe("groq");
  });
});

describe("listaAgentes", () => {
  it("ordena colgados primero, luego esperando aprobación, luego vivos; descarta hecho", () => {
    const latidos = [
      {
        tareas: {
          escr: { fase: "escribiendo", avance: AHORA - 10, modelo: "xkiro/qwen3-coder-plus", bytes: 2048, intento: 1 },
          cuelga: { fase: "escribiendo", avance: AHORA - 400 },
          espera: { fase: "esperando aprobación", avance: AHORA - 120 },
          fin: { fase: "hecho", avance: AHORA - 999 },
        },
      },
    ];
    const r = listaAgentes(latidos, AHORA);
    expect(r.map((a) => a.id)).toEqual(["cuelga", "espera", "escr"]);
    expect(r.map((a) => a.estado)).toEqual(["colgado", "esperando_aprobacion", "escribiendo"]);
    expect(r.find((a) => a.id === "fin")).toBeUndefined();
  });

  it("proveedor sale de la primera parte del modelo (nvidia/ ⇒ nim) y kb/minutos se redondean", () => {
    const latidos = [{ tareas: { a: { fase: "tsc", avance: AHORA - 90, modelo: "nvidia/moonshotai/kimi-k3", bytes: 1536 } } }];
    const [a] = listaAgentes(latidos, AHORA);
    expect(a.proveedor).toBe("nim");
    expect(a.modelo).toBe("nvidia/moonshotai/kimi-k3");
    expect(a.kb).toBe(2);
    expect(a.minutos).toBe(2);
    expect(a.fase).toBe("tsc");
  });

  it("sin modelo, el proveedor queda honesto («desconocido») y bytes ausentes dan 0 KB", () => {
    const latidos = [{ tareas: { a: { fase: "escribiendo", avance: AHORA } } }];
    const [a] = listaAgentes(latidos, AHORA);
    expect(a.proveedor).toBe("desconocido");
    expect(a.modelo).toBeUndefined();
    expect(a.kb).toBe(0);
    expect(a.intento).toBeUndefined();
  });

  it("ignora latidos sin tareas y devuelve lista vacía", () => {
    expect(listaAgentes([{}], AHORA)).toEqual([]);
  });
});

describe("resumenDirectores", () => {
  const launchctl = [
    "123\t0\tcom.starseed.mando",
    "-\t-15\tcom.starseed.vigilante",
    "456\terr\tcom.starseed.telegram",
    "999\t0\tcom.otra.cosa",
    "línea rota",
  ].join("\n");
  const canal = [
    { quien: "mando", texto: "arrancado", hora: AHORA - 60 },
    { quien: "mando", texto: "último aviso", hora: AHORA - 30 },
  ];

  it("cruza launchctl con el canal por nombre", () => {
    const r = resumenDirectores(launchctl, canal, AHORA);
    const mando = r.find((d) => d.nombre === "mando");
    const vigilante = r.find((d) => d.nombre === "vigilante");
    const telegram = r.find((d) => d.nombre === "telegram");
    expect(mando).toMatchObject({
      vivo: true, pid: 123, ultimaSalida: 0, ultimoMensaje: "último aviso", hace: 30,
    });
    expect(vigilante).toMatchObject({ vivo: false, ultimaSalida: -15 });
    expect(telegram).toMatchObject({ vivo: true, pid: 456 });
    expect(telegram?.ultimaSalida).toBeUndefined();
    expect(r).toHaveLength(7);
  });

  it("acepta hora ISO y milisegundos", () => {
    const iso = new Date((AHORA - 10) * 1000).toISOString();
    const r = resumenDirectores("8\t0\tcom.starseed.eco", [
      { quien: "eco", texto: "iso", hora: iso },
    ], AHORA);
    const eco = r.find((d) => d.nombre === "eco");
    expect(eco?.hace).toBeCloseTo(10, 0);
    const r2 = resumenDirectores("", [
      { quien: "eco", texto: "ms", hora: (AHORA - 5) * 1000 },
    ], AHORA);
    expect(r2.find((d) => d.nombre === "eco")?.hace).toBe(5);
  });

  it("sin proceso ni mensajes: vivo false, sin opcionales", () => {
    const r = resumenDirectores("", [], AHORA);
    expect(r.every((d) => d.vivo === false)).toBe(true);
    expect(r[0].ultimoMensaje).toBeUndefined();
  });
});

describe("resumenPendientes: lo integrado no es trabajo pendiente (2026-09-14)", () => {
    const cola = (ids: string[]) => [{ nombre: "cola-320-x.json", tareas: ids.map((id) => ({ id })) }];

    it("una tarea en commit no cuenta como lista para trabajar", () => {
        const r = resumenPendientes(cola(["A"]), { A: { estado: "commit" } }, [], [], AHORA);
        expect(r.listas).toBe(0);
    });

    it("solo cuenta commits cuyo t es de hoy; sin t no suma", () => {
        const ayer = resumenPendientes(cola(["A"]), { A: { estado: "commit", t: AHORA - 86_400 } }, [], [], AHORA);
        expect(ayer.integradasHoy).toBe(0);
        const sinT = resumenPendientes(cola(["A"]), { A: { estado: "commit" } }, [], [], AHORA);
        expect(sinT.integradasHoy).toBe(0);
        const hoy = resumenPendientes(cola(["A"]), { A: { estado: "commit", t: AHORA } }, [], [], AHORA);
        expect(hoy.integradasHoy).toBe(1);
    });

    it("solo lo pendiente de verdad es «lista»", () => {
        const r = resumenPendientes(
            cola(["A", "B", "C", "D"]),
            { A: { estado: "pendiente" }, B: { estado: "bloqueada" }, C: { estado: "sin_cambios" }, D: { estado: "commit" } },
            [], [],
        );
        expect(r.listas).toBe(1);
        expect(r.bloqueadas.length).toBe(1);
        expect(r.sinCambios).toBe(1);
    });
});
