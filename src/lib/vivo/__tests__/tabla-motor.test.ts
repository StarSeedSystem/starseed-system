/**
 * Motor de edición colaborativa: guardado con retardo, compare-and-swap con fusión, cambios en
 * vivo de otras personas, reintentos sin bucles, borrador local, solo lectura y —sobre todo— un
 * snapshot ESTABLE (la referencia solo cambia cuando cambia algo; si no, React #185).
 */
import { describe, expect, test } from "vitest";
import {
    MotorColab,
    SNAPSHOT_INICIAL,
    type CambioRemoto,
    type DepsMotor,
    type EspacioLeido,
    type ResultadoGuardar,
    type ResultadoLeer,
    type RelojMotor,
} from "@/lib/vivo/tabla/motor-colab";
import { PresenciaViva, colorDeUsuario, iniciales, type CanalRealtime, type ClienteRealtime } from "@/lib/vivo/tabla/presencia";
import { fusionarTablas } from "@/lib/vivo/tabla/fusion";
import { invertirPaso } from "@/lib/vivo/tabla/historial";
import { maxTiempo, tablaVacia, valorCelda, type Tabla } from "@/lib/vivo/tabla/modelo";
import { anadirColumna, anadirFilasAlFinal, establecerCelda } from "@/lib/vivo/tabla/operaciones";

// ───────────── utilidades de prueba ─────────────

async function vaciar(): Promise<void> {
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

/** Reloj manual: los temporizadores solo corren cuando el test avanza el tiempo. */
class RelojFalso implements RelojMotor {
    t = 1_000_000;
    private n = 0;
    private lista: { id: number; en: number; f: () => void }[] = [];
    ahora = () => this.t;
    poner = (f: () => void, ms: number) => {
        const id = ++this.n;
        this.lista.push({ id, en: this.t + Math.max(0, ms), f });
        return id;
    };
    quitar = (id: unknown) => {
        this.lista = this.lista.filter((x) => x.id !== id);
    };
    pendientes = () => this.lista.length;
    async avanzar(ms: number): Promise<void> {
        const fin = this.t + ms;
        for (;;) {
            this.lista.sort((a, b) => a.en - b.en || a.id - b.id);
            const sig = this.lista[0];
            if (!sig || sig.en > fin) break;
            this.lista.shift();
            this.t = Math.max(this.t, sig.en);
            sig.f();
            await vaciar();
        }
        this.t = fin;
        await vaciar();
    }
}

// Documento de prueba: un mapa clave → {v, t} donde gana el más reciente (como los registros de la tabla).
type Mapa = Record<string, { v: string; t: number }>;

function fusionMapa(a: Mapa, b: Mapa): Mapa {
    let salida: Mapa | null = null;
    for (const [k, x] of Object.entries(b)) {
        const y = (salida ?? a)[k];
        if (!y || x.t > y.t) {
            salida ??= { ...a };
            salida[k] = x;
        }
    }
    return salida ?? a;
}

class ServidorFalso {
    rev = 1;
    doc: Record<string, unknown> = { vivo: "prueba", datos: {} as Mapa, ajeno: "conservar" };
    titulo = "Prueba";
    guardados: { en: number; rev: number }[] = [];
    fallar: ResultadoGuardar["ok"] extends true ? never : "red" | "sin-permiso" | "desaparecido" | null = null;
    fallosRestantes = 0;
    cargas = 0;
    suscriptores = new Set<(c: CambioRemoto) => void>();
    altas = 0;
    bajas = 0;
    constructor(private reloj: RelojFalso) {}

    espacio(): EspacioLeido {
        return { id: "esp1", titulo: this.titulo, doc: this.doc, rev: this.rev, propietario: "owner", acceso: "invite" };
    }
    cargar = async (): Promise<ResultadoLeer> => {
        this.cargas += 1;
        return { ok: true, espacio: this.espacio() };
    };
    guardar = async (doc: Record<string, unknown>, revEsperada: number): Promise<ResultadoGuardar> => {
        if (this.fallosRestantes > 0 && this.fallar) {
            this.fallosRestantes -= 1;
            this.guardados.push({ en: this.reloj.t, rev: -1 });
            return { ok: false, motivo: this.fallar };
        }
        if (revEsperada !== this.rev) return { ok: false, motivo: "conflicto" };
        this.rev += 1;
        this.doc = doc;
        this.guardados.push({ en: this.reloj.t, rev: this.rev });
        // Realtime: el resto de pestañas se enteran (el eco al que escribe llega igual y se ignora)
        const aviso: CambioRemoto = { rev: this.rev, doc };
        void Promise.resolve().then(() => {
            for (const cb of [...this.suscriptores]) cb(aviso);
        });
        return { ok: true, espacio: this.espacio() };
    };
    /** Otra persona escribe directamente en el servidor. */
    escribirAjeno(clave: string, v: string, t: number, avisar = true, conDoc = true): void {
        const datos = fusionMapa(this.doc.datos as Mapa, { [clave]: { v, t } });
        this.doc = { ...this.doc, datos };
        this.rev += 1;
        if (avisar) for (const cb of [...this.suscriptores]) cb({ rev: this.rev, doc: conDoc ? this.doc : null });
    }
    suscribir = (cb: (c: CambioRemoto) => void) => {
        this.suscriptores.add(cb);
        this.altas += 1;
        return () => {
            this.suscriptores.delete(cb);
            this.bajas += 1;
        };
    };
}

function crear(opc: { editar?: boolean; borrador?: Mapa | null; validar?: string | null } = {}) {
    const reloj = new RelojFalso();
    const srv = new ServidorFalso(reloj);
    const escritos: (Mapa | null)[] = [];
    const deps: DepsMotor<Mapa> = {
        cargar: srv.cargar,
        guardar: srv.guardar,
        suscribir: srv.suscribir,
        puedeEditar: async () => opc.editar ?? true,
        autor: "yo0000000000",
        validar: () => opc.validar ?? null,
        extraer: (doc) => (doc.datos as Mapa) ?? {},
        fusionar: fusionMapa,
        incrustar: (base, d) => ({ ...base, datos: d }),
        maxTiempo: (d) => Math.max(0, ...Object.values(d).map((x) => x.t)),
        invertirPaso: (paso, actual, c) => {
            // deshacer simple: vuelve a poner el valor previo con una marca de tiempo nueva
            const previo = paso.antes;
            const nuevo: Mapa = { ...actual };
            for (const k of new Set([...Object.keys(paso.antes), ...Object.keys(paso.despues)])) {
                if (previo[k]?.v !== paso.despues[k]?.v) nuevo[k] = { v: previo[k]?.v ?? "", t: c.t };
            }
            return nuevo;
        },
        borrador: {
            leer: () => opc.borrador ?? null,
            escribir: (d) => void escritos.push(d),
        },
        reloj,
    };
    const motor = new MotorColab<Mapa>(deps);
    return { reloj, srv, motor, escritos, deps };
}

const poner = (k: string, v: string) => (d: Mapa, c: { t: number }): Mapa => ({ ...d, [k]: { v, t: c.t } });

async function abrir(opc?: Parameters<typeof crear>[0]) {
    const x = crear(opc);
    await x.motor.iniciar();
    await vaciar();
    return x;
}

// ───────────── pruebas ─────────────

describe("carga y snapshot estable", () => {
    test("antes de cargar: el snapshot inicial; getServerSnapshot es siempre el mismo", async () => {
        const { motor } = crear();
        expect(motor.getSnapshot()).toBe(SNAPSHOT_INICIAL);
        expect(motor.getServerSnapshot()).toBe(motor.getServerSnapshot());
        expect(motor.getSnapshot().fase).toBe("cargando");
    });

    test("la referencia solo cambia cuando cambia algo (y no notifica en balde)", async () => {
        const { motor, reloj } = await abrir();
        let avisos = 0;
        motor.subscribe(() => void avisos++);
        const a = motor.getSnapshot();
        expect(a.fase).toBe("listo");
        for (let i = 0; i < 50; i++) expect(motor.getSnapshot()).toBe(a); // lecturas repetidas: misma referencia
        // aplicar algo que no cambia nada: ni referencia nueva ni aviso
        expect(motor.aplicar((d) => d)).toBe(false);
        expect(motor.getSnapshot()).toBe(a);
        expect(avisos).toBe(0);
        // un cambio real: referencia nueva, un solo aviso por cambio
        expect(motor.aplicar(poner("a", "1"))).toBe(true);
        const b = motor.getSnapshot();
        expect(b).not.toBe(a);
        expect(b.version).toBe(a.version + 1);
        expect(b.guardado).toBe("pendiente");
        expect(avisos).toBe(1);
        for (let i = 0; i < 50; i++) expect(motor.getSnapshot()).toBe(b);
        // el paso del tiempo con el guardado en curso cambia el estado; después, otra vez estable
        await reloj.avanzar(2000);
        const c = motor.getSnapshot();
        expect(c.guardado).toBe("limpio");
        for (let i = 0; i < 50; i++) expect(motor.getSnapshot()).toBe(c);
    });

    test("un oyente que lanza no impide avisar a los demás", async () => {
        const { motor } = await abrir();
        let bien = 0;
        motor.subscribe(() => {
            throw new Error("roto");
        });
        motor.subscribe(() => void bien++);
        motor.aplicar(poner("a", "1"));
        expect(bien).toBe(1);
    });

    test("el reloj híbrido nunca repite ni retrocede", async () => {
        const { motor } = await abrir();
        const ts = Array.from({ length: 20 }, () => motor.ctx().t);
        for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    });
});

describe("guardado con retardo", () => {
    test("no guarda hasta que pasa el retardo y junta varias ediciones en un solo guardado", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(500);
        expect(srv.guardados).toHaveLength(0);
        motor.aplicar(poner("b", "2")); // reinicia la espera
        await reloj.avanzar(800);
        expect(srv.guardados).toHaveLength(0);
        await reloj.avanzar(200);
        expect(srv.guardados).toHaveLength(1);
        expect(Object.keys(srv.doc.datos as Mapa).sort()).toEqual(["a", "b"]);
        expect(srv.doc.ajeno).toBe("conservar"); // las claves ajenas del doc no se pierden
        expect(motor.getSnapshot().guardado).toBe("limpio");
    });

    test("escribiendo sin parar: primer guardado a los 5 s como mucho y nunca dos a menos de 600 ms", async () => {
        const { motor, srv, reloj } = await abrir();
        const inicio = reloj.t;
        for (let i = 0; i < 200; i++) {
            motor.aplicar(poner("k" + (i % 7), String(i)));
            await reloj.avanzar(100); // 20 segundos tecleando cada 100 ms
        }
        await reloj.avanzar(3000);
        expect(srv.guardados.length).toBeGreaterThanOrEqual(3);
        expect(srv.guardados[0].en - inicio).toBeLessThanOrEqual(5_100);
        for (let i = 1; i < srv.guardados.length; i++) expect(srv.guardados[i].en - srv.guardados[i - 1].en).toBeGreaterThanOrEqual(600);
        expect(srv.guardados.length).toBeLessThan(12); // y tampoco uno por pulsación
        expect(motor.getSnapshot().guardado).toBe("limpio");
        expect((srv.doc.datos as Mapa).k0.v).toBe("196");
    });

    test("guardarYa guarda sin esperar y varias llamadas seguidas no duplican", async () => {
        const { motor, srv } = await abrir();
        motor.aplicar(poner("a", "1"));
        await Promise.all([motor.guardarYa(), motor.guardarYa(), motor.guardarYa()]);
        await vaciar();
        expect(srv.guardados).toHaveLength(1);
    });

    test("una edición mientras se guarda se guarda después, sin perderse", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(900);
        motor.aplicar(poner("b", "2"));
        await reloj.avanzar(3000);
        expect(Object.keys(srv.doc.datos as Mapa).sort()).toEqual(["a", "b"]);
        expect(motor.getSnapshot().guardado).toBe("limpio");
    });
});

describe("edición simultánea: compare-and-swap y fusión", () => {
    test("si otra persona guardó antes, se fusiona y se reintenta: nadie pisa a nadie", async () => {
        const { motor, srv, reloj } = await abrir();
        // otra persona escribe otra celda sin que llegue el aviso en vivo
        srv.escribirAjeno("ajena", "de Bea", reloj.t + 10, false);
        motor.aplicar(poner("mia", "de Ana"));
        await reloj.avanzar(1000);
        const datos = srv.doc.datos as Mapa;
        expect(datos.mia.v).toBe("de Ana");
        expect(datos.ajena.v).toBe("de Bea");
        expect(motor.getSnapshot().doc).toEqual(datos);
        expect(motor.getSnapshot().guardado).toBe("limpio");
    });

    test("conflicto sobre la MISMA celda: gana la escritura más reciente y todos convergen", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.aplicar(poner("x", "Ana"));
        const tAna = (motor.getSnapshot().doc as Mapa).x.t;
        srv.escribirAjeno("x", "Bea", tAna + 5, false);
        await reloj.avanzar(1000);
        expect((srv.doc.datos as Mapa).x.v).toBe("Bea");
        expect((motor.getSnapshot().doc as Mapa).x.v).toBe("Bea");
    });

    test("cambios en vivo de otras personas se ven al momento y no provocan guardados", async () => {
        const { motor, srv, reloj } = await abrir();
        const antes = motor.getSnapshot();
        srv.escribirAjeno("b", "hola", reloj.t + 1);
        const despues = motor.getSnapshot();
        expect(despues).not.toBe(antes);
        expect((despues.doc as Mapa).b.v).toBe("hola");
        expect(despues.version).toBe(antes.version + 1);
        expect(despues.guardado).toBe("limpio");
        await reloj.avanzar(5000);
        expect(srv.guardados).toHaveLength(0); // solo leyó
    });

    test("un aviso viejo o repetido se ignora (misma referencia)", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.escribirAjeno("b", "hola", reloj.t + 1);
        const s = motor.getSnapshot();
        for (const cb of srv.suscriptores) {
            cb({ rev: srv.rev, doc: srv.doc });
            cb({ rev: 1, doc: { datos: {} } });
        }
        expect(motor.getSnapshot()).toBe(s);
    });

    test("si el aviso viene sin documento (fila enorme), se vuelve a leer", async () => {
        const { motor, srv, reloj } = await abrir();
        const cargasAntes = srv.cargas;
        srv.escribirAjeno("grande", "dato", reloj.t + 1, true, false);
        await vaciar();
        expect(srv.cargas).toBe(cargasAntes + 1);
        expect((motor.getSnapshot().doc as Mapa).grande.v).toBe("dato");
    });

    test("lo local que el servidor aún no tiene se vuelve a guardar tras recibir cambios ajenos", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.aplicar(poner("mia", "1"));
        srv.escribirAjeno("ajena", "2", reloj.t + 1);
        expect(motor.getSnapshot().guardado).toBe("pendiente");
        await reloj.avanzar(1500);
        expect(Object.keys(srv.doc.datos as Mapa).sort()).toEqual(["ajena", "mia"]);
    });
});

describe("errores: sin bucles ni pérdidas", () => {
    test("sin red: reintentos con espera creciente (2, 5, 15, 30 s) y se recupera", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.fallar = "red";
        srv.fallosRestantes = 4;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(1000);
        expect(motor.getSnapshot().guardado).toBe("reintentando");
        expect(motor.getSnapshot().motivo).toMatch(/Sin conexión/);
        const intentos = () => srv.guardados.filter((g) => g.rev === -1).map((g) => g.en);
        await reloj.avanzar(2000);
        await reloj.avanzar(5000);
        await reloj.avanzar(15000);
        await reloj.avanzar(30000);
        const t = intentos();
        expect(t).toHaveLength(4);
        const gaps = t.slice(1).map((x, i) => x - t[i]);
        expect(gaps).toEqual([2000, 5000, 15000]);
        expect(srv.guardados.at(-1)!.rev).toBeGreaterThan(0); // el quinto intento sí guarda
        expect(motor.getSnapshot().guardado).toBe("limpio");
        expect(motor.getSnapshot().motivo).toBeNull();
    });

    test("la red sigue caída: nunca más de un intento por espera (no hay bucle)", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.fallar = "red";
        srv.fallosRestantes = 10_000;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(120_000);
        expect(srv.guardados.length).toBeLessThanOrEqual(8); // 0,9 s + 2 + 5 + 15 + 30 + 30 + 30...
        expect(motor.getSnapshot().guardado).toBe("reintentando");
        expect((motor.getSnapshot().doc as Mapa).a.v).toBe("1"); // lo escrito sigue ahí
    });

    test("al volver la red se guarda de inmediato", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.fallar = "red";
        srv.fallosRestantes = 1;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(1000);
        expect(motor.getSnapshot().guardado).toBe("reintentando");
        motor.alVolverRed();
        await vaciar();
        expect(motor.getSnapshot().guardado).toBe("limpio");
    });

    test("sin permiso: se pasa a solo lectura con aviso y no se insiste", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.fallar = "sin-permiso";
        srv.fallosRestantes = 99;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(60_000);
        const s = motor.getSnapshot();
        expect(s.guardado).toBe("sin-permiso");
        expect(s.puedeEditar).toBe(false);
        expect(s.motivo).toMatch(/permiso/);
        expect(srv.guardados).toHaveLength(1);
        expect(motor.aplicar(poner("b", "2"))).toBe(false);
    });

    test("el espacio desaparece: fase no disponible con mensaje", async () => {
        const { motor, srv, reloj } = await abrir();
        srv.fallar = "desaparecido";
        srv.fallosRestantes = 1;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(1000);
        expect(motor.getSnapshot().fase).toBe("no-disponible");
        expect(motor.getSnapshot().motivo).toMatch(/eliminado/);
    });

    test("no encontrado, sin red al cargar y doc de otro tipo: mensajes en español, sin lanzar", async () => {
        for (const [motivo, texto] of [
            ["no-encontrado", /No encontramos/],
            ["red", /No pudimos conectar/],
            ["sin-sesion", /Inicia sesión/],
        ] as const) {
            const x = crear();
            x.deps.cargar = async () => ({ ok: false, motivo });
            const m = new MotorColab<Mapa>(x.deps);
            await m.iniciar();
            expect(m.getSnapshot().fase).toBe("no-disponible");
            expect(m.getSnapshot().motivo).toMatch(texto);
        }
        const y = await abrir({ validar: "Este espacio no es una tabla de datos." });
        expect(y.motor.getSnapshot().fase).toBe("no-disponible");
        expect(y.motor.getSnapshot().motivo).toBe("Este espacio no es una tabla de datos.");
    });

    test("solo lectura desde el principio: aplicar se rechaza y no se guarda nada", async () => {
        const { motor, srv, reloj } = await abrir({ editar: false });
        expect(motor.getSnapshot().puedeEditar).toBe(false);
        expect(motor.aplicar(poner("a", "1"))).toBe(false);
        await reloj.avanzar(10_000);
        expect(srv.guardados).toHaveLength(0);
    });
});

describe("borrador local", () => {
    test("un borrador sin guardar se recupera al abrir y se envía", async () => {
        const { motor, srv, reloj } = await abrir({ borrador: { rec: { v: "pendiente de subir", t: 1_000_500 } } });
        const s = motor.getSnapshot();
        expect((s.doc as Mapa).rec.v).toBe("pendiente de subir");
        expect(s.guardado).toBe("pendiente");
        await reloj.avanzar(1500);
        expect((srv.doc.datos as Mapa).rec.v).toBe("pendiente de subir");
        expect(motor.getSnapshot().guardado).toBe("limpio");
    });

    test("sin red el borrador guarda lo escrito; cuando por fin se guarda en el servidor, se vacía", async () => {
        const { motor, srv, reloj, escritos } = await abrir();
        srv.fallar = "red";
        srv.fallosRestantes = 1;
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(1100);
        expect(escritos.some((e) => e && e.a?.v === "1")).toBe(true);
        await reloj.avanzar(3000);
        expect(motor.getSnapshot().guardado).toBe("limpio");
        expect(escritos.at(-1)).toBeNull();
    });

    test("con red normal el borrador no llega a escribirse (se guarda antes) y no queda basura", async () => {
        const { motor, reloj, escritos } = await abrir();
        motor.aplicar(poner("a", "1"));
        await reloj.avanzar(3000);
        expect(escritos.filter((e) => e !== null)).toHaveLength(0);
        expect(escritos.at(-1)).toBeNull();
    });
});

describe("deshacer y rehacer", () => {
    test("los indicadores y el efecto", async () => {
        const { motor } = await abrir();
        expect(motor.getSnapshot().puedeDeshacer).toBe(false);
        expect(motor.deshacer()).toBe(false);
        motor.aplicar(poner("a", "1"));
        motor.aplicar(poner("a", "2"));
        expect(motor.getSnapshot().puedeDeshacer).toBe(true);
        expect(motor.deshacer()).toBe(true);
        expect((motor.getSnapshot().doc as Mapa).a.v).toBe("1");
        expect(motor.getSnapshot().puedeRehacer).toBe(true);
        expect(motor.rehacer()).toBe(true);
        expect((motor.getSnapshot().doc as Mapa).a.v).toBe("2");
        motor.deshacer();
        motor.aplicar(poner("b", "x")); // una edición nueva borra el «rehacer»
        expect(motor.getSnapshot().puedeRehacer).toBe(false);
    });
});

describe("ciclo de vida de la pestaña", () => {
    test("oculta más de un minuto: suelta el canal; al volver se reengancha y lee", async () => {
        const { motor, srv, reloj } = await abrir();
        expect(srv.altas).toBe(1);
        motor.alOcultar();
        await reloj.avanzar(59_000);
        expect(srv.bajas).toBe(0);
        await reloj.avanzar(2_000);
        expect(srv.bajas).toBe(1);
        srv.escribirAjeno("mientras", "tanto", reloj.t + 1, false);
        const cargas = srv.cargas;
        motor.alMostrar();
        await vaciar();
        expect(srv.altas).toBe(2);
        expect(srv.cargas).toBe(cargas + 1);
        expect((motor.getSnapshot().doc as Mapa).mientras.v).toBe("tanto");
    });

    test("oculta menos de un minuto: no se toca el canal", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.alOcultar();
        await reloj.avanzar(30_000);
        motor.alMostrar();
        await vaciar();
        expect(srv.bajas).toBe(0);
        expect(srv.altas).toBe(1);
    });

    test("destruir: guarda lo pendiente, suelta el canal, no deja temporizadores y no acepta más cambios", async () => {
        const { motor, srv, reloj } = await abrir();
        motor.aplicar(poner("a", "1"));
        motor.destruir();
        await vaciar();
        expect((srv.doc.datos as Mapa).a.v).toBe("1");
        expect(srv.suscriptores.size).toBe(0);
        expect(reloj.pendientes()).toBe(0);
        expect(motor.aplicar(poner("b", "2"))).toBe(false);
        motor.destruir(); // idempotente
        let avisos = 0;
        motor.subscribe(() => void avisos++);
        srv.escribirAjeno("c", "3", reloj.t + 1);
        expect(avisos).toBe(0);
    });

    test("destruir antes de que termine la carga no deja nada colgado", async () => {
        const x = crear();
        const p = x.motor.iniciar();
        x.motor.destruir();
        await p;
        await vaciar();
        expect(x.srv.suscriptores.size).toBe(0);
        expect(x.motor.getSnapshot().fase).toBe("cargando");
    });
});

// ───────────── con la tabla de verdad ─────────────

describe("el motor con la tabla real", () => {
    test("dos personas editan celdas distintas a la vez y las dos ediciones sobreviven", async () => {
        const reloj = new RelojFalso();
        const srv = new ServidorFalso(reloj);
        // tabla compartida inicial
        let t = tablaVacia();
        const col = anadirColumna(t, { t: 10, a: "own000000000" }, { nombre: "Nombre", tipo: "texto" });
        const filas = anadirFilasAlFinal(col.tabla, 2, { t: 11, a: "own000000000" });
        t = filas.tabla;
        srv.doc = { vivo: "tabla", v: 1, tabla: t };
        const motorDe = (autor: string) =>
            new MotorColab<Tabla>({
                cargar: srv.cargar,
                guardar: srv.guardar,
                suscribir: srv.suscribir,
                puedeEditar: async () => true,
                autor,
                validar: () => null,
                extraer: (doc) => doc.tabla as Tabla,
                fusionar: fusionarTablas,
                incrustar: (base, tab) => ({ ...base, tabla: tab }),
                maxTiempo,
                invertirPaso,
                reloj,
            });
        const ana = motorDe("ana000000000");
        const bea = motorDe("bea000000000");
        await Promise.all([ana.iniciar(), bea.iniciar()]);
        await vaciar();
        const [f0, f1] = filas.filaIds;
        ana.aplicar((d, c) => establecerCelda(d, f0, col.colId!, "celda de Ana", c));
        bea.aplicar((d, c) => establecerCelda(d, f1, col.colId!, "celda de Bea", c));
        await reloj.avanzar(3000);
        for (const m of [ana, bea]) {
            const doc = m.getSnapshot().doc!;
            expect(valorCelda(doc, f0, col.colId!)).toBe("celda de Ana");
            expect(valorCelda(doc, f1, col.colId!)).toBe("celda de Bea");
            expect(m.getSnapshot().guardado).toBe("limpio");
        }
        expect(valorCelda((srv.doc.tabla as Tabla), f0, col.colId!)).toBe("celda de Ana");
        expect(valorCelda((srv.doc.tabla as Tabla), f1, col.colId!)).toBe("celda de Bea");
        ana.destruir();
        bea.destruir();
    });
});

// ───────────── presencia ─────────────

class CanalFalso implements CanalRealtime {
    estado: Record<string, unknown[]> = {};
    onSync: (() => void) | null = null;
    onEstado: ((e: string) => void) | null = null;
    tracks: Record<string, unknown>[] = [];
    untracks = 0;
    on(_t: "presence", _f: { event: "sync" }, cb: () => void) {
        this.onSync = cb;
        return this;
    }
    subscribe(cb: (e: string) => void) {
        this.onEstado = cb;
        return this;
    }
    track(p: Record<string, unknown>) {
        this.tracks.push(p);
        return Promise.resolve();
    }
    untrack() {
        this.untracks += 1;
        return Promise.resolve();
    }
    presenceState() {
        return this.estado;
    }
    poner(clave: string, meta: Record<string, unknown>) {
        this.estado = { ...this.estado, [clave]: [meta] };
        this.onSync?.();
    }
}

function crearPresencia() {
    const reloj = new RelojFalso();
    const canal = new CanalFalso();
    let quitados = 0;
    const cliente: ClienteRealtime = { channel: () => canal, removeChannel: () => void quitados++ };
    const p = new PresenciaViva("tabla:esp1", { uid: "yo", nombre: "Ana Pérez", color: "#7C5CFF" }, { cliente: () => cliente, reloj, clave: "miclave" });
    return { p, canal, reloj, quitados: () => quitados };
}

describe("presencia", () => {
    test("snapshot estable: la lista es la misma mientras nadie cambia; nunca incluye a uno mismo", async () => {
        const { p, canal } = crearPresencia();
        let avisos = 0;
        p.subscribe(() => void avisos++);
        p.iniciar();
        canal.onEstado?.("SUBSCRIBED");
        const vacio = p.getSnapshot();
        expect(vacio).toEqual([]);
        canal.poner("miclave", { uid: "yo", nombre: "Ana", color: "#7C5CFF", fila: null, col: null, editando: false });
        expect(p.getSnapshot()).toBe(vacio); // yo no cuento
        canal.poner("otra", { uid: "u2", nombre: "Bea Ruiz", color: "#10B981", fila: "f_aa", col: "c_bb", editando: true });
        const a = p.getSnapshot();
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({ nombre: "Bea Ruiz", fila: "f_aa", col: "c_bb", editando: true });
        for (let i = 0; i < 20; i++) expect(p.getSnapshot()).toBe(a);
        canal.onSync?.(); // una sincronización sin cambios no crea otra lista ni avisa
        expect(p.getSnapshot()).toBe(a);
        expect(avisos).toBe(1);
        expect(p.getServerSnapshot()).toBe(p.getServerSnapshot());
    });

    test("datos hostiles de otros clientes se sanean (color, nombre, tipos)", () => {
        const { p, canal } = crearPresencia();
        p.iniciar();
        canal.onEstado?.("SUBSCRIBED");
        canal.poner("x1", { uid: "u3", nombre: "N".repeat(500), color: "url(javascript:alert(1))", fila: 5, col: {}, editando: "sí" });
        canal.poner("x2", { nombre: "sin uid" });
        canal.poner("x3", null as never);
        const l = p.getSnapshot();
        expect(l).toHaveLength(1);
        expect(l[0].nombre.length).toBeLessThanOrEqual(40);
        expect(l[0].color).toBe(colorDeUsuario("u3"));
        expect(l[0].fila).toBeNull();
        expect(l[0].col).toBeNull();
        expect(l[0].editando).toBe(false);
    });

    test("anuncia la posición como mucho cada 250 ms y agrupa el movimiento rápido", async () => {
        const { p, canal, reloj } = crearPresencia();
        p.iniciar();
        canal.onEstado?.("SUBSCRIBED");
        expect(canal.tracks).toHaveLength(1); // al entrar
        for (let i = 0; i < 30; i++) {
            p.anunciar({ fila: "f_aa", col: "c" + (i % 3), editando: false });
            await reloj.avanzar(10);
        }
        await reloj.avanzar(400);
        expect(canal.tracks.length).toBeLessThanOrEqual(4);
        expect(canal.tracks.at(-1)).toMatchObject({ fila: "f_aa", col: "c" + (29 % 3) });
        const n = canal.tracks.length;
        p.anunciar({ fila: "f_aa", col: "c" + (29 % 3), editando: false }); // misma posición: nada
        await reloj.avanzar(1000);
        expect(canal.tracks).toHaveLength(n);
    });

    test("pestaña oculta: deja de anunciarse y al minuto suelta el canal; al volver lo reabre", async () => {
        const { p, canal, reloj, quitados } = crearPresencia();
        p.iniciar();
        canal.onEstado?.("SUBSCRIBED");
        canal.poner("otra", { uid: "u2", nombre: "Bea", color: "#10B981", fila: null, col: null, editando: false });
        expect(p.getSnapshot()).toHaveLength(1);
        p.ocultar();
        expect(canal.untracks).toBe(1);
        const n = canal.tracks.length;
        p.anunciar({ fila: "f_aa", col: "c_bb", editando: false });
        await reloj.avanzar(1000);
        expect(canal.tracks).toHaveLength(n); // oculta: no anuncia
        await reloj.avanzar(60_000);
        expect(quitados()).toBe(1);
        expect(p.getSnapshot()).toEqual([]);
        p.mostrar();
        canal.onEstado?.("SUBSCRIBED");
        expect(canal.tracks.at(-1)).toMatchObject({ fila: "f_aa", col: "c_bb" });
    });

    test("destruir libera el canal y los temporizadores", async () => {
        const { p, canal, reloj, quitados } = crearPresencia();
        p.iniciar();
        canal.onEstado?.("SUBSCRIBED");
        p.anunciar({ fila: "a1", col: "b1", editando: false });
        p.anunciar({ fila: "a2", col: "b2", editando: false });
        p.destruir();
        expect(quitados()).toBe(1);
        expect(reloj.pendientes()).toBe(0);
        p.anunciar({ fila: "a3", col: "b3", editando: false }); // no hace nada ni lanza
        expect(colorDeUsuario("abc")).toBe(colorDeUsuario("abc"));
        expect(iniciales("Ana María Pérez")).toBe("AP");
        expect(iniciales("")).toBe("?");
    });
});
