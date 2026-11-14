/**
 * LLA1114B · llamadas entre neuronas con builds distintas: el anuncio de capacidades (y la build) en el saludo de la voz,
 * lo que se acuerda y la línea del registro. La prueba entre árboles de verdad es `pruebas-reales/compat-versiones/`.
 */
import { describe, expect, it } from "vitest";
import { acordar, anuncioPropio, CAPACIDADES, CAPACIDADES_PROPIAS, lineaCapacidades, MAX_CAPACIDADES, puedoUsar, sanearCapacidades, sanearWeb } from "@/lib/llamadas/capacidades";
import { armarControl, leerControl } from "@/lib/llamadas/voz-datos/paquete";
import { SesionVozDatos, fabricaCodecsSimples, type AudioVoz, type RelojVoz, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";

const ID = "3f1c2a90-5b7e-4c1d-9a8e-2b6f0c4d7e11";

describe("capacidades: lista, acuerdo y regla", () => {
  it("cada id es corto, único y con su encargo", () => {
    const ids = CAPACIDADES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CAPACIDADES) {
      expect(c.id).toMatch(/^[a-z0-9-]{1,24}$/);
      expect(c.desde).toMatch(/^[A-Z]{3}\d{4}[A-Z]$/);
    }
    expect(ids.length).toBeLessThanOrEqual(MAX_CAPACIDADES);
  });

  it("un otro que no anuncia es la base: nada en común y las que cooperan no se usan", () => {
    const a = acordar(null, null);
    expect(a.suyas).toBeNull();
    expect(a.comunes).toEqual([]);
    expect(lineaCapacidades(a)).toContain("otro=- web-otro=? comunes=ninguna (otro sin anuncio: base)");
    // Las de un solo lado se usan siempre; una que coopera, solo si las anunciaron los dos.
    expect(puedoUsar(a, "ciclo-reparto")).toBe(true);
    expect(puedoUsar(a, "no-existe")).toBe(false);
    const lista = [...CAPACIDADES, { id: "coopera-x", desde: "LLA1114B", coopera: true, que: "de mentira" }];
    const mias = [...CAPACIDADES_PROPIAS, "coopera-x"];
    expect(puedoUsar(acordar(null, null, mias), "coopera-x", lista)).toBe(false);
    expect(puedoUsar(null, "coopera-x", lista)).toBe(false);
    const ambos = { ...acordar(["coopera-x"], null, mias), comunes: ["coopera-x"] };
    expect(puedoUsar(ambos, "coopera-x", lista)).toBe(true);
  });

  it("lo común es la intersección de lo conocido; un id desconocido del otro no cuenta", () => {
    const a = acordar(["anuncio", "ciclo-reparto", "algo-del-futuro"], "mwg79bmx-ts76na/580b0157a6", CAPACIDADES_PROPIAS, "x/1234567890");
    expect(a.comunes).toEqual(["ciclo-reparto", "anuncio"]);
    const l = lineaCapacidades(a);
    expect(l).toContain("web-otro=mwg79bmx-ts76na/580b0157a6");
    expect(l).toContain("otro-sin=colgar-reintento");
    // Con la build más larga en los dos lados y todo en común, la línea (con «voz-datos ») cabe en los 200 del registro.
    const w = "w".repeat(26);
    const larga = `voz-datos ${lineaCapacidades(acordar([...CAPACIDADES_PROPIAS], w, CAPACIDADES_PROPIAS, w))}`;
    expect(larga).toContain("otro== ");
    expect(larga).toContain("comunes=todas");
    expect(larga.length).toBeLessThanOrEqual(200);
  });

  it("sanea lo que llega (nunca lanza, recorta)", () => {
    expect(sanearCapacidades("x")).toBeNull();
    expect(sanearCapacidades([1, "OK", "bien", "bien", "a b"])).toEqual(["bien"]);
    expect(sanearCapacidades(Array.from({ length: 40 }, (_, i) => `c${i}`))).toHaveLength(MAX_CAPACIDADES);
    expect(sanearWeb("mwg79bmx-ts76na/580b0157a6")).toBe("mwg79bmx-ts76na/580b0157a6");
    expect(sanearWeb("<script>")).toBeNull();
    expect(anuncioPropio("desconocida")).toEqual({ cap: [...CAPACIDADES_PROPIAS], web: "desconocida" });
  });
});

describe("el anuncio viaja en el saludo de la voz sin molestar a un aparato anterior", () => {
  it("leerControl conserva `cap` y `web` solo en el saludo", () => {
    const h = leerControl(armarControl({ s: ID, k: "hola", codecs: ["opus"], fmt: ["b1"], cap: ["anuncio", "ciclo-reparto"], web: "b/0123456789" }));
    expect(h).toMatchObject({ k: "hola", cap: ["anuncio", "ciclo-reparto"], web: "b/0123456789", fmt: ["b1"] });
    const p = leerControl(JSON.stringify({ t: "voz.c", s: ID, k: "ping", ts: 1, cap: ["anuncio"], web: "x" }));
    expect(p?.cap).toBeUndefined();
    expect(p?.web).toBeUndefined();
  });

  it("el saludo más largo posible cabe en los 600 caracteres que acepta CUALQUIER versión de `leerControl`", () => {
    const cap = Array.from({ length: MAX_CAPACIDADES }, (_, i) => `capacidad-larga-${String(i).padStart(2, "0")}xxxx`.slice(0, 24));
    const t = armarControl({ s: ID, k: "hola", codecs: ["opus", "adpcm", "mulaw"], fmt: ["b1"], cap, web: "w".repeat(64) });
    expect(t.length).toBeLessThanOrEqual(600);
    // Lo que lee un aparato anterior (sin `cap`/`web`): sus campos, intactos.
    expect(leerControl(t)).toMatchObject({ k: "hola", codecs: ["opus", "adpcm", "mulaw"], fmt: ["b1"] });
  });
});

/* ── Dos sesiones de voz en memoria ── */
class Reloj implements RelojVoz {
  t = 0;
  private tareas: Array<{ fn: () => void; ms: number; prox: number; viva: boolean }> = [];
  ahora = () => this.t;
  cada(fn: () => void, ms: number) {
    const x = { fn, ms, prox: this.t + ms, viva: true };
    this.tareas.push(x);
    return () => {
      x.viva = false;
    };
  }
  avanzar(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      this.tareas = this.tareas.filter((x) => x.viva);
      const sig = this.tareas.reduce<(typeof this.tareas)[number] | undefined>((m, x) => (!m || x.prox < m.prox ? x : m), undefined);
      if (!sig || sig.prox > fin) break;
      this.t = sig.prox;
      sig.prox += sig.ms;
      sig.fn();
    }
    this.t = fin;
  }
}

function enlace(reloj: Reloj) {
  const mk = () => {
    const oy = new Set<(t: string) => void>();
    const e = {
      enviados: [] as string[],
      otro: null as null | { recibir(t: string): void },
      enviar(t: string): "ok" {
        e.enviados.push(t);
        const o = e.otro;
        if (o) {
          const q = reloj.cada(() => {
            q();
            o.recibir(t);
          }, 1);
        }
        return "ok";
      },
      ocupado: () => false,
      alRecibir(cb: (t: string) => void) {
        oy.add(cb);
        return () => oy.delete(cb);
      },
      abierto: () => true,
      info: () => ({ tipo: "ble" as const, cifrada: true }),
      capacidadKbps: () => null,
      recibir(t: string) {
        for (const f of Array.from(oy)) f(t);
      },
    };
    return e;
  };
  const a = mk();
  const b = mk();
  a.otro = b;
  b.otro = a;
  return [a, b] as const;
}

function audio(reloj: Reloj): AudioVoz {
  return {
    iniciar: async (f) => {
      reloj.cada(() => f(new Int16Array(320).fill(1200)), 20);
      return true;
    },
    reproducir: () => undefined,
    detener: () => undefined,
  };
}

async function llamada(o: { anteriorB?: boolean } = {}) {
  const reloj = new Reloj();
  const [ea, eb] = enlace(reloj);
  const la: string[] = [];
  const lb: string[] = [];
  const sa = new SesionVozDatos({ idLlamada: ID, transporte: ea as unknown as TransporteVoz, audio: audio(reloj), codecs: fabricaCodecsSimples(), reloj, anotar: (h) => la.push(h) });
  const sb = new SesionVozDatos({ idLlamada: ID, transporte: eb as unknown as TransporteVoz, audio: audio(reloj), codecs: fabricaCodecsSimples(), reloj, anotar: (h) => lb.push(h), comoAnterior: o.anteriorB });
  await sa.iniciar();
  await sb.iniciar();
  reloj.avanzar(4000);
  return { ea, eb, la, lb, sa, sb };
}

describe("sesión de voz: cada lado anuncia y anota lo acordado (una línea por sesión)", () => {
  it("dos códigos nuevos: lo común son todas, una sola línea por lado aunque el saludo se repita", async () => {
    const x = await llamada();
    const hola = x.ea.enviados.find((t) => t.includes('"k":"hola"'))!;
    expect(JSON.parse(hola).cap).toEqual([...CAPACIDADES_PROPIAS]);
    for (const l of [x.la, x.lb]) {
      const c = l.filter((h) => h.startsWith("voz-datos capacidades "));
      expect(c).toHaveLength(1);
      expect(c[0]).toContain("otro== ");
      expect(c[0]).toContain("comunes=todas");
    }
    expect(x.sa.acuerdoCapacidades()?.comunes).toEqual([...CAPACIDADES_PROPIAS]);
    x.sa.detener();
    x.sb.detener();
  });

  it("con un aparato anterior (no anuncia): el nuevo lo trata como la base y lo dice; el anterior no manda nada nuevo", async () => {
    const x = await llamada({ anteriorB: true });
    const holaB = x.eb.enviados.filter((t) => t.includes('"k":"hola"'));
    expect(holaB.length).toBeGreaterThan(0);
    expect(holaB.every((t) => !("cap" in JSON.parse(t)) && !("web" in JSON.parse(t)))).toBe(true);
    const c = x.la.filter((h) => h.startsWith("voz-datos capacidades "));
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("otro=- web-otro=? comunes=ninguna (otro sin anuncio: base)");
    expect(x.sa.acuerdoCapacidades()?.suyas).toBeNull();
    // La voz sigue igual que antes (el anterior se entiende con `voz.p`).
    expect(x.ea.enviados.some((t) => t.startsWith('{"t":"voz.p"'))).toBe(true);
    expect(x.ea.enviados.some((t) => t.startsWith('{"t":"voz.b"'))).toBe(false);
    x.sa.detener();
    x.sb.detener();
  });
});
