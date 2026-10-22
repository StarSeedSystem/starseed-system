/**
 * Genesis × bots: «bot.crear» y «bot.configurar» (BOT1011J1). Pruebas en node,
 * sin red ni navegador: los puertos se falsifican con los contratos de `aplicar.ts`.
 * La fila es la de `astraura_bots` (migración 20261013). Contrato: architecture/astraura-bots.md §3.2.
 */
import { describe, it, expect } from "vitest";
import {
    aplicarOperacion,
    deshacerEntrada,
    type FilaDock,
    type PuertosGenesis,
    type TablaPerfil,
    type WidgetTablero,
} from "@/lib/genesis/aplicar";
import { describirOperacion, validarOperacion, type Ambito, type Operacion } from "@/lib/genesis/operaciones";

const PERSONA: Ambito = { tipo: "persona" };
const GRUPO: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "g1", slug: "circulo-sur", nombre: "Círculo Sur" } };
const op = (o: unknown) => o as Operacion;

/** Fila de `astraura_bots`: bot común jerárquico de la entidad del ámbito. */
const FILA: Record<string, unknown> = {
    id: "bot-1", nombre: "Bot común", cuenta_id: "c1", dueno_tipo: "grupo", dueno_id: "g1",
    gobierno: "jerarquico", activo: true, datos: {},
};
/** Idem, democrático (los cambios se votan). */
const FILA_DEM: Record<string, unknown> = { ...FILA, gobierno: "democratico" };
/** Bot personal: el del perfil de la propia cuenta. */
const FILA_PERSONAL: Record<string, unknown> = { ...FILA, dueno_tipo: "perfil", dueno_id: "u1", gobierno: "jerarquico", personalidad: null };

interface Estado {
    bots: Map<string, Record<string, unknown>>;
    llamadas: string[];
}

/** OS de mentira: puertos con los contratos de `PuertosGenesis`, bots en un Map. */
function osFalso(conFila: Record<string, unknown> = FILA): { p: PuertosGenesis; e: Estado } {
    let n = 0;
    const e: Estado = { bots: new Map([[String(conFila.id), { ...conFila }]]), llamadas: [] };
    const p: PuertosGenesis = {
        perfil: {
            async leer() { return { ok: true, tabla: "os_profiles" as TablaPerfil, clave: "user_id:u1", valores: { display_name: "Ana", bio: null, avatar_url: null, cover_url: null } }; },
            async escribir() { return { ok: true, filas: 1 }; },
        },
        entidad: {
            async crearPagina() { return { ok: true, slug: "p1" }; },
            async leer() { return { ok: true, valores: {} }; },
            async escribir() { return { ok: true, filas: 1 }; },
            async contarPublicaciones() { return 0; },
            async borrarPagina() { return { ok: true }; },
        },
        dock: { leer: () => [] as FilaDock[], guardar: () => {}, iconoValido: () => true },
        tableros: { listar: () => [], leerWidgets: () => [] as WidgetTablero[], guardarWidgets: () => {}, widgetConocido: () => null },
        agentes: { crear: () => ({ id: "ag-1" }), borrar: () => true, vincular: () => true, desvincular: () => {} },
        astrauraBots: {
            async leer(botId) {
                const v = e.bots.get(botId);
                return v ? { ok: true, valores: { ...v } } : { ok: false, motivo: "Ese bot no existe (o tu cuenta no puede verlo)." };
            },
            async upsert(botId, valores) {
                e.llamadas.push(botId);
                e.bots.set(botId, { ...(e.bots.get(botId) ?? {}), ...valores });
                return { ok: true, filas: 1 };
            },
            async borrar(botId) {
                e.llamadas.push(`borrar:${botId}`);
                return e.bots.delete(botId) ? { ok: true } : { ok: false, motivo: "Ese bot no existe." };
            },
        },
        ahora: () => 1_000,
        nuevoId: () => `id-${++n}`,
    };
    return { p, e };
}

describe("vocabulario de bots en Genesis", () => {
    it("valida bot.crear en la entidad y desecha campos sobrantes", () => {
        const r = validarOperacion(
            { tipo: "bot.crear", motivo: "El grupo lo pidió", datos: { nombre: "Facilitador", gobierno: "democratico", color: "rojo" } },
            { ambito: GRUPO },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.op).toEqual({ tipo: "bot.crear", motivo: "El grupo lo pidió", datos: { nombre: "Facilitador", gobierno: "democratico" } });
    });

    it("el ámbito persona no admite bot.crear (el bot común es de la entidad)", () => {
        const r = validarOperacion({ tipo: "bot.crear", motivo: "x", datos: { nombre: "B", gobierno: "jerarquico" } }, { ambito: PERSONA });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.problemas.join(" ")).toMatch(/no está disponible/);
    });

    it("valida bot.configurar en persona y en entidad", () => {
        const cambios = { botId: "bot-1", cambio: "personalidad", valor: { calidez: 0.8 } };
        expect(validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios }, { ambito: PERSONA }).ok).toBe(true);
        expect(validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios }, { ambito: GRUPO }).ok).toBe(true);
    });

    it("rechaza en bot.configurar código, valor largo, cambio raro y sin botId", () => {
        const res = validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "b", cambio: "personalidad", valor: "<script>alert(1)</script>" } }, { ambito: PERSONA });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.problemas.join(" ")).toMatch(/parece código/);
        const largo = validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "b", cambio: "personalidad", valor: "x".repeat(4200) } }, { ambito: PERSONA });
        expect(largo.ok).toBe(false);
        if (!largo.ok) expect(largo.problemas.join(" ")).toMatch(/supera los 4000/);
        const raro = validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "b", cambio: "red", valor: {} } }, { ambito: PERSONA });
        expect(raro.ok).toBe(false);
        if (!raro.ok) expect(raro.problemas.join(" ")).toMatch(/debe ser uno de/);
        const sinId = validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "", cambio: "modelo", valor: {} } }, { ambito: PERSONA });
        expect(sinId.ok).toBe(false);
    });

    it("rechaza en bot.crear un gobierno que no existe", () => {
        const r = validarOperacion({ tipo: "bot.crear", motivo: "m", datos: { nombre: "B", gobierno: "anarquia" } }, { ambito: GRUPO });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.problemas.join(" ")).toMatch(/gobierno/);
    });

    it("cuenta bot.crear y bot.configurar en palabras para la vista previa", () => {
        const c = validarOperacion({ tipo: "bot.crear", motivo: "m", datos: { nombre: "Facilitador", gobierno: "democratico" } }, { ambito: GRUPO });
        if (!c.ok) throw new Error("debería validar");
        const v = describirOperacion(c.op, GRUPO);
        expect(v.titulo).toContain("Facilitador");
        expect(v.detalles.join(" ")).toMatch(/democrático/);
        const f = validarOperacion({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "b1", cambio: "modelo", valor: { capa: "razon" } } }, { ambito: PERSONA });
        if (!f.ok) throw new Error("debería validar");
        expect(describirOperacion(f.op, PERSONA).deshacer).toMatch(/repone/);
    });
});

describe("aplicar bot.crear y bot.configurar por el puerto astrauraBots", () => {
    it("bot.crear en la entidad: escribe la fila y deshacer retira el bot", async () => {
        const { p, e } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "bot.crear", motivo: "m", datos: { nombre: "Facilitador", gobierno: "democratico" } }), GRUPO, p);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(e.llamadas).toEqual([r.entrada.inverso?.tipo === "bot.borrar" ? r.entrada.inverso.botId : null]);
        expect(e.bots.get(e.llamadas[0])).toMatchObject({ nombre: "Facilitador", gobierno: "democratico", dueno_tipo: "grupo", dueno_id: "g1", activo: true });
        const d = await deshacerEntrada(r.entrada, p);
        expect(d.ok).toBe(true);
        expect(e.bots.has(d ? String((r.entrada.inverso as { botId?: string }).botId) : "")).toBe(false);
        expect(e.bots.get("bot-1")?.nombre).toBe("Bot común");
    });

    it("bot.configurar en persona: aplica el valor nuevo y deshacer repone el anterior", async () => {
        const { p, e } = osFalso(FILA_PERSONAL);
        const r = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "personalidad", valor: { calidez: 0.9 } } }), PERSONA, p);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect((e.bots.get("bot-1")?.personalidad as { calidez: number }).calidez).toBe(0.9);
        expect(r.entrada.inverso).toMatchObject({ tipo: "bot.restaurar", campo: "personalidad", despues: { calidez: 0.9 } });
        expect((await deshacerEntrada(r.entrada, p)).ok).toBe(true);
        expect(e.bots.get("bot-1")?.personalidad).toBeNull();
    });

    it("bot.configurar en entidad sin permiso y sin propuesta aprobada: no aplica", async () => {
        const { p, e } = osFalso(FILA_DEM);
        const r = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "personalidad", valor: { calidez: 1 } } }), GRUPO, p);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toMatch(/vota|aprueba|papel|administra/);
        expect(e.llamadas).toEqual([]);
        expect(e.bots.get("bot-1")?.hasOwnProperty("personalidad")).toBe(false);
    });

    it("bot.configurar en entidad: aplica con rol que administra y con la propuesta ya votada", async () => {
        const jer = osFalso();
        const r = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "cuerpo", valor: { tono: 300 } } }), GRUPO, jer.p, { rol: "dueno" });
        expect(r.ok).toBe(true);
        expect(jer.e.bots.get("bot-1")?.cuerpo).toEqual({ tono: 300 });

        const dem = osFalso(FILA_DEM);
        const r2 = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "permisos", valor: { nivel: "aplicar" } } }), GRUPO, dem.p, { propuestaAprobada: true });
        expect(r2.ok).toBe(true);
        expect(dem.e.bots.get("bot-1")?.permisos).toEqual({ nivel: "aplicar" });
    });

    it("pausar el bot común: lo confirma el diálogo y deshacer vuelve a encenderlo", async () => {
        const { p, e } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "pausar", valor: { activo: false } } }), GRUPO, p, { rol: "dueno" });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(e.bots.get("bot-1")?.activo).toBe(false);
        expect((await deshacerEntrada(r.entrada, p)).ok).toBe(true);
        expect(e.bots.get("bot-1")?.activo).toBe(true);
    });

    it("sin permiso ni aprobación, una pausa pedida por un miembro tampoco aplica", async () => {
        const { p, e } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "bot.configurar", motivo: "m", cambios: { botId: "bot-1", cambio: "pausar", valor: { activo: false } } }), GRUPO, p, { rol: "miembro" });
        expect(r.ok).toBe(false);
        expect(e.bots.get("bot-1")?.activo).toBe(true);
    });
});
