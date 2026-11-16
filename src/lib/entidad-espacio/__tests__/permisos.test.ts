import { describe, it, expect } from "vitest";
import type { Pestana, Visibilidad } from "../modelo";
import {
    rangoDeRol,
    puedeVerPestana,
    puedeGestionarEspacio,
    cambioDeVisibilidad,
    type ContextoVisor,
    type AccesoSesion,
} from "../permisos";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

function pestana(visibilidad: Visibilidad, extra: Partial<Pestana> = {}): Pestana {
    return {
        id: "p1",
        titulo: "Pizarra",
        tipo: "pizarra",
        sesionId: UUID,
        visibilidad,
        accesoPublico: visibilidad === "publica" ? "ver" : "ninguno",
        ...extra,
    };
}

const observador: ContextoVisor = { rango: 1, roles: [], anonimo: false };
const editor: ContextoVisor = { rango: 2, roles: [], anonimo: false };
const gestor: ContextoVisor = { rango: 3, roles: [], anonimo: false };
const anonimo: ContextoVisor = { rango: 0, roles: [], anonimo: true };

describe("rangoDeRol", () => {
    it("misma tabla que access_role_rank", () => {
        expect(rangoDeRol("total")).toBe(4);
        expect(rangoDeRol("owner")).toBe(4);
        expect(rangoDeRol("gestor")).toBe(3);
        expect(rangoDeRol("admin")).toBe(3);
        expect(rangoDeRol("colaborador")).toBe(2);
        expect(rangoDeRol("editor")).toBe(2);
        expect(rangoDeRol("observador")).toBe(1);
        expect(rangoDeRol("viewer")).toBe(1);
    });

    it("rol desconocido, vacío o null = 0", () => {
        expect(rangoDeRol("desconocido")).toBe(0);
        expect(rangoDeRol("")).toBe(0);
        expect(rangoDeRol(null)).toBe(0);
        expect(rangoDeRol("  OWNER  ")).toBe(4);
        expect(rangoDeRol("ADMIN")).toBe(3);
    });
});

describe("puedeVerPestana", () => {
    it("un observador (1) ve 'entidad' y no 'privada'", () => {
        expect(puedeVerPestana(pestana("entidad"), observador, "entidad")).toBe(true);
        expect(puedeVerPestana(pestana("privada"), observador, "entidad")).toBe(false);
    });

    it("un observador no ve nada si la sesión es privada", () => {
        expect(puedeVerPestana(pestana("entidad"), observador, "privada")).toBe(false);
        expect(puedeVerPestana(pestana("publica"), observador, "privada")).toBe(false);
    });

    it("un anónimo ve solo 'publica' con accesoPublico 'ver'", () => {
        expect(puedeVerPestana(pestana("publica"), anonimo, "publica")).toBe(true);
        expect(
            puedeVerPestana(pestana("publica", { accesoPublico: "ninguno" }), anonimo, "publica"),
        ).toBe(false);
        expect(puedeVerPestana(pestana("entidad"), anonimo, "publica")).toBe(false);
        expect(puedeVerPestana(pestana("publica"), anonimo, "entidad")).toBe(false);
        expect(puedeVerPestana(pestana("privada"), anonimo, "publica")).toBe(false);
    });

    it("una pestaña 'publica' sobre una sesión 'privada' NO la ve nadie ajeno", () => {
        expect(puedeVerPestana(pestana("publica"), anonimo, "privada")).toBe(false);
        expect(puedeVerPestana(pestana("publica"), observador, "privada")).toBe(false);
        expect(puedeVerPestana(pestana("publica"), editor, "privada")).toBe(false);
        expect(puedeVerPestana(pestana("publica"), gestor, "privada")).toBe(true);
    });

    it("visibilidad 'roles': lo ve quien tiene el rol listado o rango ≥ 3", () => {
        const p = pestana("roles", { roles: ["tesorero"] });
        const conRol: ContextoVisor = { rango: 1, roles: ["tesorero"], anonimo: false };
        const otroRol: ContextoVisor = { rango: 1, roles: ["otro"], anonimo: false };
        expect(puedeVerPestana(p, conRol, "entidad")).toBe(true);
        expect(puedeVerPestana(p, otroRol, "entidad")).toBe(false);
        expect(puedeVerPestana(p, gestor, "entidad")).toBe(true);
    });

    it("una pestaña 'roles' no se abre por encima de una sesión privada", () => {
        const p = pestana("roles", { roles: ["tesorero"] });
        const conRol: ContextoVisor = { rango: 1, roles: ["tesorero"], anonimo: false };
        expect(puedeVerPestana(p, conRol, "privada")).toBe(false);
    });

    it("un gestor (3) ve todas las visibilidades con sesión 'entidad' o 'publica'", () => {
        for (const visibilidad of ["publica", "entidad", "roles", "privada"] as Visibilidad[]) {
            expect(puedeVerPestana(pestana(visibilidad), gestor, "entidad")).toBe(true);
            expect(puedeVerPestana(pestana(visibilidad), gestor, "publica")).toBe(true);
        }
    });
});

describe("puedeGestionarEspacio", () => {
    it("rango ≥ 3 gestiona; editor, observador y anónimo no", () => {
        expect(puedeGestionarEspacio(3)).toBe(true);
        expect(puedeGestionarEspacio(4)).toBe(true);
        expect(puedeGestionarEspacio(2)).toBe(false);
        expect(puedeGestionarEspacio(1)).toBe(false);
        expect(puedeGestionarEspacio(0)).toBe(false);
    });
});

describe("cambioDeVisibilidad", () => {
    it("un editor (2) no puede cambiar la visibilidad", () => {
        expect(cambioDeVisibilidad(2, "privada", "entidad").permitido).toBe(false);
        expect(cambioDeVisibilidad(2, "entidad", "privada").permitido).toBe(false);
        expect(cambioDeVisibilidad(1, "privada", "publica").permitido).toBe(false);
        expect(cambioDeVisibilidad(0, "publica", "privada").permitido).toBe(false);
    });

    it("un gestor (3) puede abrirla, con aviso de lo que se verá", () => {
        const abrir = cambioDeVisibilidad(3, "privada", "entidad");
        expect(abrir.permitido).toBe(true);
        expect(abrir.aviso).toBe(true);
        expect(cambioDeVisibilidad(3, "entidad", "publica").aviso).toBe(true);
        expect(cambioDeVisibilidad(4, "roles", "entidad").aviso).toBe(true);
    });

    it("cerrar la visibilidad es inmediato, sin aviso", () => {
        const cerrar = cambioDeVisibilidad(3, "publica", "entidad");
        expect(cerrar.permitido).toBe(true);
        expect(cerrar.aviso).toBe(false);
        expect(cambioDeVisibilidad(3, "entidad", "roles").aviso).toBe(false);
        expect(cambioDeVisibilidad(4, "entidad", "privada").aviso).toBe(false);
    });

    it("el mismo valor no es un cambio de apertura, sin aviso", () => {
        const igual = cambioDeVisibilidad(3, "entidad", "entidad");
        expect(igual.permitido).toBe(true);
        expect(igual.aviso).toBe(false);
    });
});

describe("combinación pestaña × sesión × visor (tabla completa)", () => {
    const visibilidades: Visibilidad[] = ["publica", "entidad", "roles", "privada"];
    const sesiones: AccesoSesion[] = ["publica", "entidad", "privada"];
    const visores: ContextoVisor[] = [anonimo, observador, editor, gestor];

    it("coherencia con las reglas del contrato §3.2", () => {
        for (const sesion of sesiones) {
            for (const visibilidad of visibilidades) {
                const p = pestana(visibilidad);
                // anónimo: solo publica × publica × accesoPublico "ver"
                const esperadoAnonimo = sesion === "publica" && visibilidad === "publica";
                expect(puedeVerPestana(p, anonimo, sesion)).toBe(esperadoAnonimo);
                // observador (1): efectiva publica o entidad
                const efectiva =
                    sesion === "privada" || visibilidad === "privada"
                        ? "privada"
                        : visibilidad === "roles"
                          ? "roles"
                          : sesion === "entidad" || visibilidad === "entidad"
                            ? "entidad"
                            : "publica";
                const esperadoObs = efectiva === "publica" || efectiva === "entidad";
                expect(puedeVerPestana(p, observador, sesion)).toBe(esperadoObs);
                // gestor (3): lo ve todo salvo cuando el visor lo impide (nunca)
                expect(puedeVerPestana(p, gestor, sesion)).toBe(true);
            }
        }
    });
});
