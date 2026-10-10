import { describe, expect, it } from "vitest";
import { aplicarOperacion, deshacerEntrada, type FilaDock, type PuertosGenesis, type TablaPerfil, type WidgetTablero } from "../aplicar";
import type { Ambito, Operacion } from "../operaciones";

const PERSONA: Ambito = { tipo: "persona" };
const GRUPO: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "g-1", slug: "circulo-sur", nombre: "Círculo Sur" } };

/** Un OS de mentira en memoria, con los mismos contratos que los puertos reales. */
function osFalso(opciones: { filasPerfil?: number; ambitoFondo?: "cuenta" | "perfil" | "pagina"; publicaciones?: number | null } = {}) {
    let n = 0;
    const estado = {
        perfil: { display_name: "Ana", bio: "antes", avatar_url: null as string | null, cover_url: null as string | null },
        entidades: new Map<string, Record<string, unknown>>([
            ["grupo:circulo-sur", { name: "Círculo Sur", description: "viejo", tags: ["a"], accent: "#000000" }],
            ["pagina:mi-huerto", { name: "Mi huerto", description: "", tags: [], accent: "#111111" }],
        ]),
        paginasCreadas: [] as string[],
        paginasBorradas: [] as string[],
        dock: [
            { id: "settings", label: "Ajustes", iconKey: "Settings", path: "/settings", color: "neutral", enabled: true, origin: "preset" },
            { id: "laboratorio", label: "Laboratorio", iconKey: "FlaskConical", path: "/laboratorio", color: "purple", enabled: true, origin: "preset" },
            { id: "decisiones", label: "Decisiones", iconKey: "Vote", path: "/decisiones", color: "amber", enabled: false, origin: "preset" },
        ] as FilaDock[],
        tableros: [{ id: "t1", nombre: "Inicio", principal: true }],
        widgets: { t1: [] as WidgetTablero[] } as Record<string, WidgetTablero[]>,
        agentes: new Map<string, { nombre: string }>(),
        vinculos: [] as string[],
        apariencia: { typography: { scale: 1, fontFamily: "Inter" }, background: { type: "color", value: "#000" } } as Record<string, unknown>,
        escriturasApariencia: [] as Record<string, unknown>[],
    };
    const fusionar = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
        const s = { ...a };
        for (const [k, v] of Object.entries(b)) s[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? fusionar(a[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
        return s;
    };
    const p: PuertosGenesis = {
        perfil: {
            async leer() {
                return { ok: true, tabla: "os_profiles" as TablaPerfil, clave: "user_id:u1", valores: { ...estado.perfil } };
            },
            async escribir(_t, _c, valores) {
                const filas = opciones.filasPerfil ?? 1;
                if (filas > 0) Object.assign(estado.perfil, valores);
                return { ok: true, filas };
            },
        },
        entidad: {
            async crearPagina(d) {
                const slug = d.nombre.toLowerCase().replace(/\s+/g, "-");
                estado.paginasCreadas.push(slug);
                return { ok: true, slug };
            },
            async leer(tipo, slug) {
                const v = estado.entidades.get(`${tipo}:${slug}`);
                return v ? { ok: true, valores: { ...v } } : { ok: false, motivo: "no existe" };
            },
            async escribir(tipo, slug, valores) {
                const v = estado.entidades.get(`${tipo}:${slug}`);
                if (!v) return { ok: true, filas: 0 };
                Object.assign(v, valores);
                return { ok: true, filas: 1 };
            },
            async contarPublicaciones() {
                return opciones.publicaciones === undefined ? 0 : opciones.publicaciones;
            },
            async borrarPagina(slug) {
                estado.paginasBorradas.push(slug);
                return { ok: true };
            },
        },
        apariencia: {
            leer: () => estado.apariencia as never,
            escribir(parche) {
                estado.escriturasApariencia.push(parche);
                estado.apariencia = fusionar(estado.apariencia, parche);
            },
            ambitoFondo: opciones.ambitoFondo ?? "cuenta",
        },
        dock: {
            leer: () => estado.dock.map((b) => ({ ...b })),
            guardar(items) {
                estado.dock = items;
            },
            iconoValido: (k) => ["Sprout", "Vote", "AppWindow"].includes(k),
        },
        tableros: {
            listar: () => estado.tableros,
            leerWidgets: (t) => [...(estado.widgets[t] ?? [])],
            guardarWidgets(t, w) {
                estado.widgets[t] = w;
            },
            widgetConocido: (tipo) => (tipo === "AGORA_CAUSAL" ? { w: 4, h: 5, minW: 3, minH: 4, nombre: "Ágora Causal" } : null),
        },
        agentes: {
            crear(d) {
                const id = `ag-${++n}`;
                estado.agentes.set(id, { nombre: d.nombre });
                return { id };
            },
            borrar: (id) => estado.agentes.delete(id),
            vincular(id, tipo, entidadId) {
                estado.vinculos.push(`${id}>${tipo}:${entidadId}`);
                return true;
            },
            desvincular(id, tipo, entidadId) {
                estado.vinculos = estado.vinculos.filter((v) => v !== `${id}>${tipo}:${entidadId}`);
            },
        },
        ahora: () => 1_000,
        nuevoId: () => `id-${++n}`,
    };
    return { p, estado };
}

const op = (o: unknown) => o as Operacion;

describe("aplicar y deshacer", () => {
    it("perfil: aplica, deshace y no pisa un cambio posterior", async () => {
        const { p, estado } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "perfil.editar", cambios: { bio: "después" }, motivo: "m" }), PERSONA, p);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(estado.perfil.bio).toBe("después");
        expect(r.entrada.inverso).toMatchObject({ tipo: "perfil.restaurar", antes: { bio: "antes" }, despues: { bio: "después" } });

        // Alguien la cambió después: deshacer no la pisa.
        estado.perfil.bio = "otra mano";
        const choque = await deshacerEntrada(r.entrada, p);
        expect(choque.ok).toBe(false);
        expect(estado.perfil.bio).toBe("otra mano");

        estado.perfil.bio = "después";
        const d = await deshacerEntrada(r.entrada, p);
        expect(d.ok).toBe(true);
        expect(estado.perfil.bio).toBe("antes");
    });

    it("0 filas no es un éxito (la RLS no dejó)", async () => {
        const { p } = osFalso({ filasPerfil: 0 });
        const r = await aplicarOperacion(op({ tipo: "perfil.editar", cambios: { nombre: "Otra" }, motivo: "m" }), PERSONA, p);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toMatch(/no dejó/);
    });

    it("vuelve a validar al aplicar: el núcleo manda aunque la propuesta venga hecha", async () => {
        const { p, estado } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "dock.quitar", id: "settings", motivo: "m" }), PERSONA, p);
        expect(r.ok).toBe(false);
        expect(estado.dock.find((b) => b.id === "settings")?.enabled).toBe(true);
    });

    it("dock: activar, crear botón propio y deshacer ambos", async () => {
        const { p, estado } = osFalso();
        const a = await aplicarOperacion(op({ tipo: "dock.añadir", elemento: { id: "decisiones" }, motivo: "m" }), PERSONA, p);
        const b = await aplicarOperacion(op({ tipo: "dock.añadir", elemento: { etiqueta: "Mi huerto", ruta: "/pagina/mi-huerto", icono: "NoExiste" }, motivo: "m" }), PERSONA, p);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(estado.dock.find((x) => x.id === "decisiones")?.enabled).toBe(true);
        const nuevo = estado.dock.find((x) => x.origin === "user");
        expect(nuevo).toMatchObject({ id: "genesis-mi-huerto", iconKey: "AppWindow", path: "/pagina/mi-huerto", enabled: true });
        expect((await deshacerEntrada(b.entrada, p)).ok).toBe(true);
        expect(estado.dock.some((x) => x.origin === "user")).toBe(false);
        expect((await deshacerEntrada(a.entrada, p)).ok).toBe(true);
        expect(estado.dock.find((x) => x.id === "decisiones")?.enabled).toBe(false);
    });

    it("tableros: añade el widget al principal y deshacer lo quita; quitar lo repone", async () => {
        const { p, estado } = osFalso();
        expect((await aplicarOperacion(op({ tipo: "dashboard.widget.añadir", widget: "NO_EXISTE", motivo: "m" }), PERSONA, p)).ok).toBe(false);
        const r = await aplicarOperacion(op({ tipo: "dashboard.widget.añadir", widget: "AGORA_CAUSAL", talla: "L", motivo: "m" }), PERSONA, p);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(estado.widgets.t1).toHaveLength(1);
        expect(estado.widgets.t1[0].layout).toMatchObject({ x: 0, y: 0, w: 6, h: 8 });
        const quitar = await aplicarOperacion(op({ tipo: "dashboard.widget.quitar", widget: "AGORA_CAUSAL", motivo: "m" }), PERSONA, p);
        expect(quitar.ok).toBe(true);
        expect(estado.widgets.t1).toHaveLength(0);
        if (quitar.ok) expect((await deshacerEntrada(quitar.entrada, p)).ok).toBe(true);
        expect(estado.widgets.t1).toHaveLength(1);
        expect((await deshacerEntrada(r.entrada, p)).ok).toBe(true);
        expect(estado.widgets.t1).toHaveLength(0);
    });

    it("página creada: deshacer la retira solo si sigue vacía", async () => {
        const vacia = osFalso();
        const r = await aplicarOperacion(op({ tipo: "pagina.crear", datos: { nombre: "Huerto Sur" }, motivo: "m" }), PERSONA, vacia.p);
        expect(r.ok).toBe(true);
        if (r.ok) expect((await deshacerEntrada(r.entrada, vacia.p)).ok).toBe(true);
        expect(vacia.estado.paginasBorradas).toEqual(["huerto-sur"]);

        for (const publicaciones of [3, null]) {
            const llena = osFalso({ publicaciones });
            const r2 = await aplicarOperacion(op({ tipo: "pagina.crear", datos: { nombre: "Huerto Sur" }, motivo: "m" }), PERSONA, llena.p);
            if (!r2.ok) throw new Error("debería crear");
            expect((await deshacerEntrada(r2.entrada, llena.p)).ok).toBe(false);
            expect(llena.estado.paginasBorradas).toEqual([]);
        }
    });

    it("PoliGenesis: edita la entidad del ámbito y crea agentes vinculados", async () => {
        const { p, estado } = osFalso();
        const e = await aplicarOperacion(op({ tipo: "pagina.editar", destino: { tipo: "pagina", slug: "mi-huerto" }, cambios: { descripcion: "nuevo", acento: "#10b981" }, motivo: "m" }), GRUPO, p);
        expect(e.ok).toBe(true);
        expect(estado.entidades.get("grupo:circulo-sur")).toMatchObject({ description: "nuevo", accent: "#10b981" });
        expect(estado.entidades.get("pagina:mi-huerto")?.description).toBe("");
        if (e.ok) expect((await deshacerEntrada(e.entrada, p)).ok).toBe(true);
        expect(estado.entidades.get("grupo:circulo-sur")).toMatchObject({ description: "viejo", accent: "#000000" });

        const a = await aplicarOperacion(op({ tipo: "agente.crear", agente: { nombre: "Bienvenida", visibilidad: "public" }, motivo: "m" }), GRUPO, p);
        expect(a.ok).toBe(true);
        expect(estado.vinculos).toHaveLength(1);
        expect(estado.vinculos[0]).toMatch(/^ag-\d+>group:g-1$/);
        if (a.ok) expect((await deshacerEntrada(a.entrada, p)).ok).toBe(true);
        expect(estado.vinculos).toEqual([]);
        expect(estado.agentes.size).toBe(0);
    });

    it("apariencia: aplica en la cuenta con su inverso exacto y no toca el fondo si el ámbito no es la cuenta", async () => {
        const { p, estado } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "apariencia.aplicar", faja: "tipografia", parche: { typography: { scale: 1.2 } }, motivo: "m" }), PERSONA, p);
        expect(r.ok).toBe(true);
        expect((estado.apariencia.typography as { scale: number }).scale).toBe(1.2);
        if (r.ok) expect((await deshacerEntrada(r.entrada, p)).ok).toBe(true);
        expect((estado.apariencia.typography as { scale: number }).scale).toBe(1);

        const otra = osFalso({ ambitoFondo: "perfil" });
        const f = await aplicarOperacion(op({ tipo: "apariencia.aplicar", faja: "fondo", parche: { background: { value: "#123456" } }, motivo: "m" }), PERSONA, otra.p);
        expect(f.ok).toBe(false);
        expect(otra.estado.escriturasApariencia).toEqual([]);
    });

    it("no se deshace lo que no está aplicado", async () => {
        const { p } = osFalso();
        const r = await aplicarOperacion(op({ tipo: "dock.quitar", id: "laboratorio", motivo: "m" }), PERSONA, p);
        if (!r.ok) throw new Error("debería aplicar");
        expect((await deshacerEntrada({ ...r.entrada, estado: "deshecha" }, p)).ok).toBe(false);
    });
});
