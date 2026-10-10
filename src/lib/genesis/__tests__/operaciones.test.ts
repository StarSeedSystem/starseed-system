import { describe, expect, it } from "vitest";
import {
    camposEnConflicto,
    decidirAplicacion,
    describirOperacion,
    LIMITES,
    puedeDeshacer,
    rangoDeRol,
    validarLote,
    validarOperacion,
    type Ambito,
    type ContextoValidacion,
    type EntradaGenesis,
} from "../operaciones";

const PERSONA: Ambito = { tipo: "persona" };
const GRUPO: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "11111111-1111-1111-1111-111111111111", slug: "circulo-sur", nombre: "Círculo Sur" } };
const DOCK = [
    { id: "settings", ruta: "/settings", etiqueta: "Ajustes", activo: true },
    { id: "profile", ruta: "/profile", etiqueta: "Perfil", activo: true },
    { id: "mylib", ruta: "/library", etiqueta: "Biblioteca", activo: true },
    { id: "laboratorio", ruta: "/laboratorio", etiqueta: "Laboratorio", activo: true },
    { id: "decisiones", ruta: "/decisiones", etiqueta: "Decisiones", activo: false },
];
const CTX: ContextoValidacion = { ambito: PERSONA, dock: DOCK, paginasPropias: ["mi-huerto"] };

describe("vocabulario cerrado", () => {
    it("rechaza tipos desconocidos y lo que no es objeto", () => {
        expect(validarOperacion({ tipo: "codigo.ejecutar", motivo: "x" }, CTX).ok).toBe(false);
        expect(validarOperacion("perfil.editar", CTX).ok).toBe(false);
        expect(validarOperacion(null, CTX).ok).toBe(false);
    });

    it("descarta campos no declarados y avisa si piden cambiar el @", () => {
        const r = validarOperacion({ tipo: "perfil.editar", cambios: { nombre: "Ana", handle: "ana2", rol: "admin" }, motivo: "m" }, CTX);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.op).toEqual({ tipo: "perfil.editar", motivo: "m", cambios: { nombre: "Ana" } });
        expect(r.avisos.join(" ")).toMatch(/Ajustes › Cuenta/);
    });

    it("rechaza texto que parece código y enlaces peligrosos", () => {
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { bio: "<script>alert(1)</script>" } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { avatar: "javascript:alert(1)" } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { avatar: "data:image/png;base64,AAA" } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { avatar: "http://inseguro.org/a.png" } }, CTX).ok).toBe(false);
        const ok = validarOperacion({ tipo: "perfil.editar", cambios: { avatar: "https://img.starseed.net/a.png", portada: "" } }, CTX);
        expect(ok.ok && ok.op.tipo === "perfil.editar" && ok.op.cambios).toEqual({ avatar: "https://img.starseed.net/a.png", portada: "" });
    });

    it("aplica límites de longitud y exige algún cambio", () => {
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { nombre: "x".repeat(LIMITES.nombre + 1) } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: {} }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { nombre: "Ana" }, motivo: "m".repeat(LIMITES.motivo + 1) }, CTX).ok).toBe(false);
    });

    it("valida colores y etiquetas de páginas", () => {
        expect(validarOperacion({ tipo: "pagina.crear", datos: { nombre: "Huerto", acento: "rojo" } }, CTX).ok).toBe(false);
        const r = validarOperacion({ tipo: "pagina.crear", datos: { nombre: "Huerto", acento: "#10B981", etiquetas: ["Huerta", "huerta", "Agua"] } }, CTX);
        expect(r.ok).toBe(true);
        if (r.ok && r.op.tipo === "pagina.crear") expect(r.op.datos).toEqual({ nombre: "Huerto", acento: "#10b981", etiquetas: ["huerta", "agua"] });
    });
});

describe("invariantes del núcleo", () => {
    it("no deja quitar del dock Ajustes, Perfil ni la Biblioteca", () => {
        for (const id of ["settings", "profile", "mylib"]) {
            const r = validarOperacion({ tipo: "dock.quitar", id, motivo: "m" }, CTX);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.violaciones.length).toBeGreaterThan(0);
        }
    });

    it("protege el núcleo aunque no se conozca el dock de la persona", () => {
        for (const id of ["settings", "profile", "mylib", "hub", "decisiones"]) {
            expect(validarOperacion({ tipo: "dock.quitar", id, motivo: "m" }, { ambito: PERSONA }).ok).toBe(false);
        }
        expect(validarOperacion({ tipo: "dock.quitar", id: "laboratorio", motivo: "m" }, { ambito: PERSONA }).ok).toBe(true);
    });

    it("sí deja quitar un botón cualquiera y no inventa botones", () => {
        expect(validarOperacion({ tipo: "dock.quitar", id: "laboratorio", motivo: "m" }, CTX).ok).toBe(true);
        expect(validarOperacion({ tipo: "dock.quitar", id: "no-existe", motivo: "m" }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "dock.añadir", elemento: { id: "laboratorio" }, motivo: "m" }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "dock.añadir", elemento: { id: "decisiones" }, motivo: "m" }, CTX).ok).toBe(true);
    });

    it("un botón nuevo solo abre rutas del OS", () => {
        for (const ruta of ["https://fuera.com", "//fuera.com", "/api/mando/estado", "/../etc", "javascript:alert(1)"]) {
            expect(validarOperacion({ tipo: "dock.añadir", elemento: { etiqueta: "X", ruta }, motivo: "m" }, CTX).ok).toBe(false);
        }
        expect(validarOperacion({ tipo: "dock.añadir", elemento: { etiqueta: "Huerto", ruta: "/pagina/mi-huerto", icono: "Sprout" }, motivo: "m" }, CTX).ok).toBe(true);
    });

    it("no crea widgets con código propio", () => {
        expect(validarOperacion({ tipo: "dashboard.widget.añadir", widget: "AI_GENERATED" }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "dashboard.widget.añadir", widget: "agora_causal" }, CTX).ok).toBe(true);
    });

    it("la apariencia se recorta a lo permitido y rechaza código", () => {
        const r = validarOperacion({ tipo: "apariencia.aplicar", faja: "tipografia", parche: { typography: { scale: 1.1 }, layout: { menuStyle: "minimal" } } }, CTX);
        expect(r.ok).toBe(true);
        if (r.ok && r.op.tipo === "apariencia.aplicar") expect(r.op.parche).toEqual({ typography: { scale: 1.1 } });
        expect(validarOperacion({ tipo: "apariencia.aplicar", faja: "fondo", parche: { background: { value: "url(javascript:alert(1))" } } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "apariencia.aplicar", faja: "tipografia", parche: { layout: { menuStyle: "dock" } } }, CTX).ok).toBe(false);
    });
});

describe("ámbito", () => {
    it("PoliGenesis solo admite lo de la entidad", () => {
        const ctx: ContextoValidacion = { ambito: GRUPO };
        expect(validarOperacion({ tipo: "dock.quitar", id: "laboratorio" }, ctx).ok).toBe(false);
        expect(validarOperacion({ tipo: "perfil.editar", cambios: { nombre: "x" } }, ctx).ok).toBe(false);
    });

    it("en PoliGenesis el destino lo fija la entidad, no el agente", () => {
        const r = validarOperacion({ tipo: "pagina.editar", destino: { tipo: "pagina", slug: "otra-pagina" }, cambios: { descripcion: "Hola" } }, { ambito: GRUPO });
        expect(r.ok).toBe(true);
        if (r.ok && r.op.tipo === "pagina.editar") expect(r.op.destino).toEqual({ tipo: "grupo", slug: "circulo-sur" });
    });

    it("en Genesis personal solo se editan páginas propias", () => {
        expect(validarOperacion({ tipo: "pagina.editar", destino: { slug: "ajena" }, cambios: { nombre: "x" } }, CTX).ok).toBe(false);
        expect(validarOperacion({ tipo: "pagina.editar", destino: { slug: "mi-huerto" }, cambios: { nombre: "x" } }, CTX).ok).toBe(true);
        expect(validarOperacion({ tipo: "pagina.editar", destino: { tipo: "grupo", slug: "mi-huerto" }, cambios: { nombre: "x" } }, CTX).ok).toBe(false);
    });

    it("rol y modo deciden si se aplica, se propone o no se puede", () => {
        expect(decidirAplicacion(PERSONA, 0, false).modo).toBe("aplicar");
        expect(decidirAplicacion(GRUPO, 3, false).modo).toBe("aplicar");
        expect(decidirAplicacion(GRUPO, 2, false).modo).toBe("sin-permiso");
        expect(decidirAplicacion(GRUPO, 4, true).modo).toBe("proponer");
        expect(decidirAplicacion(GRUPO, 2, true).modo).toBe("proponer");
        expect(decidirAplicacion(GRUPO, 1, true).modo).toBe("sin-permiso");
        expect([rangoDeRol("owner"), rangoDeRol("gestor"), rangoDeRol("Editor"), rangoDeRol("viewer"), rangoDeRol("raro")]).toEqual([4, 3, 2, 1, 0]);
    });
});

describe("lote, vista previa y deshacer", () => {
    it("separa válidas de rechazadas y limita el tamaño del lote", () => {
        const lote = [
            { tipo: "dock.añadir", elemento: { id: "decisiones" } },
            { tipo: "eval", codigo: "x" },
            ...Array.from({ length: LIMITES.loteMaximo }, () => ({ tipo: "dashboard.widget.añadir", widget: "AGORA_CAUSAL" })),
        ];
        const r = validarLote(lote, CTX);
        expect(r.validas.length).toBe(LIMITES.loteMaximo - 1);
        expect(r.rechazadas.map((x) => x.indice)).toEqual([1, LIMITES.loteMaximo, LIMITES.loteMaximo + 1]);
        expect(validarLote("no", CTX).rechazadas.length).toBe(1);
    });

    it("cuenta la operación en palabras", () => {
        const r = validarOperacion({ tipo: "perfil.editar", cambios: { bio: "Tejedora" }, motivo: "Lo pediste" }, CTX);
        if (!r.ok) throw new Error("debería validar");
        const v = describirOperacion(r.op, PERSONA);
        expect(v.titulo).toBe("Editar tu perfil");
        expect(v.detalles).toEqual(["biografía: Tejedora"]);
        expect(v.deshacer).toMatch(/repone/);
    });

    it("detecta conflictos antes de deshacer y solo deshace lo aplicado", () => {
        expect(camposEnConflicto({ bio: "nueva", name: "x" }, { bio: "nueva" })).toEqual([]);
        expect(camposEnConflicto({ bio: "otra" }, { bio: "nueva" })).toEqual(["bio"]);
        expect(camposEnConflicto({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual([]);
        const base: EntradaGenesis = {
            id: "e1",
            at: 1,
            ambito: PERSONA,
            operacion: { tipo: "dock.quitar", id: "laboratorio", motivo: "m" },
            titulo: "t",
            estado: "aplicada",
            inverso: { tipo: "dock.restaurar", id: "laboratorio", existia: true, estabaActivo: true },
            resultado: "",
        };
        expect(puedeDeshacer(base)).toBe(true);
        expect(puedeDeshacer({ ...base, estado: "deshecha" })).toBe(false);
        expect(puedeDeshacer({ ...base, inverso: null })).toBe(false);
    });
});
