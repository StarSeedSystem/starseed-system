import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  crearCanalPosicion, posicionesDeEstado, temaPermitido, temaPosicion, type CanalRealtimeMin, type ClienteRealtimeMin,
} from "../canal-posicion";
import { construirMarcas } from "../marcas";

const UID_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const UID_B = "22222222-bbbb-4bbb-8bbb-222222222222";
const ZOCALO = { lat: 19.4326, lon: -99.1332, precisionM: 6, t: 1_700_000_000_000 };

/** Un servidor Realtime falso: aplica la MISMA regla que las políticas SQL (`temaPermitido`) y reparte la presencia por tema. */
function servidor() {
  const temas = new Map<string, Map<string, unknown[]>>();
  const abiertos: { tema: string; privado: boolean; uid: string | null }[] = [];
  const envios: { tema: string; carga: unknown }[] = [];
  const syncs = new Map<string, Set<() => void>>();
  function cliente(uid: string | null, { migracion = true }: { migracion?: boolean } = {}): ClienteRealtimeMin {
    return {
      channel(tema, opciones) {
        abiertos.push({ tema, privado: opciones.config.private, uid });
        const clave = opciones.config.presence.key;
        const c: CanalRealtimeMin = {
          on(_t, _f, cb) { if (!syncs.has(tema)) syncs.set(tema, new Set()); syncs.get(tema)!.add(cb); return c; },
          subscribe(cb) {
            const permitido = migracion && opciones.config.private && temaPermitido(tema, uid);
            setTimeout(() => cb(permitido ? "SUBSCRIBED" : "CHANNEL_ERROR", permitido ? undefined : new Error("Unauthorized")), 0);
            return c;
          },
          async track(carga) {
            envios.push({ tema, carga });
            if (!temas.has(tema)) temas.set(tema, new Map());
            temas.get(tema)!.set(clave, [carga]);
            syncs.get(tema)?.forEach((f) => f());
          },
          async untrack() { temas.get(tema)?.delete(clave); syncs.get(tema)?.forEach((f) => f()); },
          presenceState() { return Object.fromEntries(temas.get(tema) ?? []); },
        };
        return c;
      },
      removeChannel() { /* */ },
    };
  }
  return { cliente, abiertos, envios };
}
const esperar = () => new Promise((r) => setTimeout(r, 5));

describe("canal privado de posición (MAP1114D)", () => {
  it("el tema es pos:<uid>, se abre con private: true y nunca es el canal de presencia neur:", async () => {
    const s = servidor();
    const c = crearCanalPosicion({ cliente: s.cliente(UID_A), uid: UID_A, neuronaId: "n1" });
    await esperar();
    expect(temaPosicion(UID_A)).toBe(`pos:${UID_A}`);
    expect(s.abiertos).toEqual([{ tema: `pos:${UID_A}`, privado: true, uid: UID_A }]);
    expect(s.abiertos.some((a) => a.tema.startsWith("neur:"))).toBe(false);
    expect(c.estado().union).toBe("unido");
    c.cerrar();
  });

  it("dos neuronas de la misma cuenta se ven en su punto exacto, sin redondeo", async () => {
    const s = servidor();
    const a = crearCanalPosicion({ cliente: s.cliente(UID_A), uid: UID_A, neuronaId: "n1" });
    const b = crearCanalPosicion({ cliente: s.cliente(UID_A), uid: UID_A, neuronaId: "n2" });
    await esperar();
    await a.publicar(ZOCALO);
    await b.publicar({ lat: 19.43301234, lon: -99.13299876, precisionM: null, t: ZOCALO.t + 1 });
    for (const c of [a, b]) {
      expect(c.estado().posiciones.n1).toEqual({ lat: 19.4326, lon: -99.1332, precisionM: 6, t: ZOCALO.t });
      expect(c.estado().posiciones.n2).toMatchObject({ lat: 19.43301234, lon: -99.13299876 });
    }
    // y la vista de n1 pinta a n2 en su punto exacto
    const marcas = construirMarcas({
      filas: [{ neuronId: "n1", nombre: "A", plataforma: "macOS", tipo: "laptop", online: true, esEsteDispositivo: true, enlace: { estado: "conectado" } }, { neuronId: "n2", nombre: "B", plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" } }] as never,
      medios: [], ahora: ZOCALO.t, yo: { neuronaId: "n1", nombre: "A", senales: null, capas: null, posicion: ZOCALO },
      posiciones: a.estado().posiciones, canal: { unido: true, motivo: null },
    });
    expect(marcas.find((m) => m.neuronaId === "n2")!.posicion).toMatchObject({ tipo: "exacta", lat: 19.43301234, lon: -99.13299876 });
    a.cerrar(); b.cerrar();
  });

  it("una cuenta distinta no puede unirse al tema de otra: la unión se rechaza y no recibe nada", async () => {
    const s = servidor();
    const a = crearCanalPosicion({ cliente: s.cliente(UID_A), uid: UID_A, neuronaId: "n1" });
    await esperar();
    await a.publicar(ZOCALO);
    // B intenta entrar al tema de A a mano (lo que haría un cliente manipulado)
    const intruso = s.cliente(UID_B).channel(`pos:${UID_A}`, { config: { private: true, presence: { key: "x" } } });
    const estados: string[] = [];
    intruso.subscribe((e) => estados.push(e));
    await esperar();
    expect(estados).toEqual(["CHANNEL_ERROR"]);
    // y el cliente de B, por su cuenta, solo abre su propio tema
    const b = crearCanalPosicion({ cliente: s.cliente(UID_B), uid: UID_B, neuronaId: "m1" });
    await esperar();
    expect(b.estado().union).toBe("unido");
    expect(b.estado().posiciones).toEqual({});
    expect(temaPermitido(`pos:${UID_A}`, UID_B)).toBe(false);
    expect(temaPermitido(`pos:${UID_B}`, UID_B)).toBe(true);
    expect(temaPermitido("neur:abc", UID_B)).toBe(false);
    expect(temaPermitido(`pos:${UID_A}`, null)).toBe(false);
    a.cerrar(); b.cerrar();
  });

  it("unión rechazada (migración sin aplicar): no se manda nada por ningún canal y el estado dice por qué", async () => {
    const s = servidor();
    const c = crearCanalPosicion({ cliente: s.cliente(UID_A, { migracion: false }), uid: UID_A, neuronaId: "n1" });
    await esperar();
    expect(c.estado().union).toBe("rechazado");
    expect(c.estado().motivo).toMatch(/rechaz|migración/);
    expect(await c.publicar(ZOCALO)).toBe(false);
    expect(s.envios).toEqual([]);
    expect(s.abiertos.every((a) => a.tema.startsWith("pos:"))).toBe(true);
    c.cerrar();
  });

  it("sin sesión o sin cliente: rechazado desde el principio, sin abrir ningún canal", async () => {
    const s = servidor();
    const sinSesion = crearCanalPosicion({ cliente: s.cliente(null), uid: null, neuronaId: "n1" });
    const sinRed = crearCanalPosicion({ cliente: null, uid: UID_A, neuronaId: "n1" });
    expect(sinSesion.estado()).toMatchObject({ union: "rechazado" });
    expect(sinSesion.estado().motivo).toMatch(/sesión/);
    expect(sinRed.estado().union).toBe("rechazado");
    expect(await sinSesion.publicar(ZOCALO)).toBe(false);
    expect(s.abiertos).toEqual([]);
    expect(s.envios).toEqual([]);
  });

  it("retirar la posición (interruptor apagado) saca a la neurona del canal; la basura del estado se ignora", async () => {
    const s = servidor();
    const a = crearCanalPosicion({ cliente: s.cliente(UID_A), uid: UID_A, neuronaId: "n1" });
    await esperar();
    await a.publicar(ZOCALO);
    expect(a.estado().posiciones.n1).toBeDefined();
    await a.publicar(null);
    expect(a.estado().posiciones.n1).toBeUndefined();
    expect(posicionesDeEstado({ k: [{ n: "x", lat: 999, lon: 0, t: 1 }, { lat: 1, lon: 1, t: 1 }, null, "x"] as never })).toEqual({});
    a.cerrar();
  });
});

describe("migración de posición privada: la política SQL dice lo mismo que `temaPermitido`", () => {
  const dir = join(__dirname, "..", "..", "..", "..", "..", "supabase", "migrations");
  const archivo = readdirSync(dir).find((f) => f.endsWith("_senales_posicion_privada.sql"))!;
  const sql = readFileSync(join(dir, archivo), "utf8");
  it("solo authenticated, solo su propio uid, solo broadcast y presencia; se puede deshacer", () => {
    expect(archivo).toBeTruthy();
    expect(sql).toMatch(/FOR SELECT TO authenticated/);
    expect(sql).toMatch(/FOR INSERT TO authenticated/);
    expect(sql).not.toMatch(/TO anon|TO public/i);
    expect((sql.match(/'pos:' \|\| \(SELECT auth\.uid\(\)\)::text/g) ?? []).length).toBe(2);
    expect(sql).toMatch(/extension IN \('broadcast', 'presence'\)/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS senales_posicion_recibir ON realtime\.messages;/);
    expect(sql).not.toMatch(/neur:|DROP TABLE|DELETE FROM/);
  });
});
