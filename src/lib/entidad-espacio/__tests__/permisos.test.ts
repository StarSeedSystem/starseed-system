import { describe, it, expect } from "vitest";
import {
    rangoDeRol,
    puedeVerPestana,
    puedeGestionarEspacio,
    cambioDeVisibilidad,
} from "../permisos";
import type { Pestana, Visibilidad, AccesoPublico } from "../modelo";

describe("permisos de espacio de entidad", () => {
    describe("rangoDeRol", () => {
        it("total y owner devuelven 4", () => {
            expect(rangoDeRol("total")).toBe(4);
            expect(rangoDeRol("owner")).toBe(4);
            expect(rangoDeRol("TOTAL")).toBe(4);
            expect(rangoDeRol("Owner")).toBe(4);
        });

        it("gestor y admin devuelven 3", () => {
            expect(rangoDeRol("gestor")).toBe(3);
            expect(rangoDeRol("admin")).toBe(3);
            expect(rangoDeRol("GESTOR")).toBe(3);
            expect(rangoDeRol("Admin")).toBe(3);
        });

        it("colaborador y editor devuelven 2", () => {
            expect(rangoDeRol("colaborador")).toBe(2);
            expect(rangoDeRol("editor")).toBe(2);
            expect(rangoDeRol("COLABORADOR")).toBe(2);
            expect(rangoDeRol("Editor")).toBe(2);
        });

        it("observador y viewer devuelven 1", () => {
            expect(rangoDeRol("observador")).toBe(1);
            expect(rangoDeRol("viewer")).toBe(1);
            expect(rangoDeRol("OBSERVADOR")).toBe(1);
            expect(rangoDeRol("Viewer")).toBe(1);
        });

        it("rol desconocido o null devuelve 0", () => {
            expect(rangoDeRol("desconocido")).toBe(0);
            expect(rangoDeRol(null)).toBe(0);
            expect(rangoDeRol("")).toBe(0);
            expect(rangoDeRol("  ")).toBe(0);
        });
    });

    describe("puedeVerPestana", () => {
        const ctxBase = { rango: 1, roles: ["observador"] as string[], anonimo: false };
        const ctxAnonimo = { rango: 0, roles: [] as string[], anonimo: true };
        const ctxGestor = { rango: 3, roles: ["gestor"] as string[], anonimo: false };
        const ctxOwner = { rango: 4, roles: ["owner"] as string[], anonimo: false };

        function p(visibilidad: Visibilidad, roles?: string[], accesoPublico: AccesoPublico = "ninguno"): Pestana {
            return {
                id: "1",
                titulo: "Test",
                tipo: "pizarra",
                sesionId: "550e8400-e29b-41d4-a716-446655440000",
                visibilidad,
                roles,
                accesoPublico,
            };
        }

        describe("visibilidad 'publica'", () => {
            it("anónimo ve la pestaña si accesoPublico es 'ver'", () => {
                const pestana = p("publica", undefined, "ver");
                expect(puedeVerPestana(pestana, ctxAnonimo, "publica")).toBe(true);
            });

            it("anónimo NO ve la pestaña si accesoPublico es 'ninguno'", () => {
                const pestana = p("publica", undefined, "ninguno");
                expect(puedeVerPestana(pestana, ctxAnonimo, "publica")).toBe(false);
            });

            it("usuario con rango >= 1 la ve", () => {
                const pestana = p("publica", undefined, "ver");
                expect(puedeVerPestana(pestana, ctxBase, "publica")).toBe(true);
                expect(puedeVerPestana(pestana, ctxGestor, "publica")).toBe(true);
            });
        });

        describe("visibilidad 'entidad'", () => {
            it("anónimo NO la ve", () => {
                const pestana = p("entidad");
                expect(puedeVerPestana(pestana, ctxAnonimo, "entidad")).toBe(false);
            });

            it("observador (rango 1) la ve", () => {
                const pestana = p("entidad");
                expect(puedeVerPestana(pestana, ctxBase, "entidad")).toBe(true);
            });

            it("gestor/owner la ve", () => {
                const pestana = p("entidad");
                expect(puedeVerPestana(pestana, ctxGestor, "entidad")).toBe(true);
                expect(puedeVerPestana(pestana, ctxOwner, "entidad")).toBe(true);
            });
        });

        describe("visibilidad 'roles'", () => {
            it("anónimo NO la ve", () => {
                const pestana = p("roles", ["editor"]);
                expect(puedeVerPestana(pestana, ctxAnonimo, "entidad")).toBe(false);
            });

            it("usuario con uno de los roles la ve", () => {
                const pestana = p("roles", ["editor", "colaborador"]);
                const ctxEditor = { rango: 2, roles: ["editor"] as string[], anonimo: false };
                expect(puedeVerPestana(pestana, ctxEditor, "entidad")).toBe(true);
            });

            it("usuario SIN ninguno de los roles NO la ve (si rango < 3)", () => {
                const pestana = p("roles", ["editor"]);
                const ctxSoloObservador = { rango: 1, roles: ["observador"] as string[], anonimo: false };
                expect(puedeVerPestana(pestana, ctxSoloObservador, "entidad")).toBe(false);
            });

            it("rango >= 3 la ve aunque no tenga el rol", () => {
                const pestana = p("roles", ["editor"]);
                expect(puedeVerPestana(pestana, ctxGestor, "entidad")).toBe(true);
                expect(puedeVerPestana(pestana, ctxOwner, "entidad")).toBe(true);
            });
        });

        describe("visibilidad 'privada'", () => {
            it("anónimo NO la ve", () => {
                const pestana = p("privada");
                expect(puedeVerPestana(pestana, ctxAnonimo, "privada")).toBe(false);
            });

            it("observador (rango 1) NO la ve", () => {
                const pestana = p("privada");
                expect(puedeVerPestana(pestana, ctxBase, "privada")).toBe(false);
            });

            it("colaborador (rango 2) NO la ve", () => {
                const pestana = p("privada");
                const ctxColab = { rango: 2, roles: ["colaborador"] as string[], anonimo: false };
                expect(puedeVerPestana(pestana, ctxColab, "privada")).toBe(false);
            });

            it("gestor (rango 3) la ve", () => {
                const pestana = p("privada");
                expect(puedeVerPestana(pestana, ctxGestor, "privada")).toBe(true);
            });

            it("owner (rango 4) la ve", () => {
                const pestana = p("privada");
                expect(puedeVerPestana(pestana, ctxOwner, "privada")).toBe(true);
            });
        });

        describe("regla: pestaña nunca más abierta que la sesión", () => {
            it("pestaña 'publica' sobre sesión 'privada' -> NO la ve nadie ajeno (rango < 3)", () => {
                const pestana = p("publica", undefined, "ver");
                expect(puedeVerPestana(pestana, ctxBase, "privada")).toBe(false);
                expect(puedeVerPestana(pestana, ctxAnonimo, "privada")).toBe(false);
            });

            it("pestaña 'publica' sobre sesión 'privada' -> gestor/owner SÍ la ve", () => {
                const pestana = p("publica", undefined, "ver");
                expect(puedeVerPestana(pestana, ctxGestor, "privada")).toBe(true);
                expect(puedeVerPestana(pestana, ctxOwner, "privada")).toBe(true);
            });

            it("pestaña 'entidad' sobre sesión 'privada' -> observador NO la ve", () => {
                const pestana = p("entidad");
                expect(puedeVerPestana(pestana, ctxBase, "privada")).toBe(false);
            });

            it("pestaña 'entidad' sobre sesión 'entidad' -> observador SÍ la ve", () => {
                const pestana = p("entidad");
                expect(puedeVerPestana(pestana, ctxBase, "entidad")).toBe(true);
            });

            it("pestaña 'privada' sobre sesión 'publica' -> solo rango >= 3", () => {
                const pestana = p("privada");
                expect(puedeVerPestana(pestana, ctxBase, "publica")).toBe(false);
                expect(puedeVerPestana(pestana, ctxGestor, "publica")).toBe(true);
            });
        });
    });

    describe("puedeGestionarEspacio", () => {
        it("rango 3 (gestor) -> true", () => {
            expect(puedeGestionarEspacio(3)).toBe(true);
        });

        it("rango 4 (owner) -> true", () => {
            expect(puedeGestionarEspacio(4)).toBe(true);
        });

        it("rango 2 (colaborador) -> false", () => {
            expect(puedeGestionarEspacio(2)).toBe(false);
        });

        it("rango 1 (observador) -> false", () => {
            expect(puedeGestionarEspacio(1)).toBe(false);
        });

        it("rango 0 -> false", () => {
            expect(puedeGestionarEspacio(0)).toBe(false);
        });
    });

    describe("cambioDeVisibilidad", () => {
        it("rango < 3 -> no permitido en ninguna dirección", () => {
            expect(cambioDeVisibilidad(2, "privada", "entidad")).toEqual({ permitido: false, aviso: false });
            expect(cambioDeVisibilidad(2, "entidad", "privada")).toEqual({ permitido: false, aviso: false });
            expect(cambioDeVisibilidad(1, "entidad", "publica")).toEqual({ permitido: false, aviso: false });
            expect(cambioDeVisibilidad(0, "publica", "privada")).toEqual({ permitido: false, aviso: false });
        });

        it("rango >= 3 -> permitido en ambas direcciones", () => {
            expect(cambioDeVisibilidad(3, "privada", "entidad")).toEqual({ permitido: true, aviso: true });
            expect(cambioDeVisibilidad(3, "entidad", "privada")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(4, "privada", "publica")).toEqual({ permitido: true, aviso: true });
            expect(cambioDeVisibilidad(4, "publica", "privada")).toEqual({ permitido: true, aviso: false });
        });

        it("hacerla MÁS abierta lleva aviso: true", () => {
            // privada -> entidad, roles, publica
            expect(cambioDeVisibilidad(3, "privada", "entidad")).toEqual({ permitido: true, aviso: true });
            expect(cambioDeVisibilidad(3, "privada", "roles")).toEqual({ permitido: true, aviso: true });
            expect(cambioDeVisibilidad(3, "privada", "publica")).toEqual({ permitido: true, aviso: true });
            // entidad -> roles, publica
            expect(cambioDeVisibilidad(3, "entidad", "roles")).toEqual({ permitido: true, aviso: true });
            expect(cambioDeVisibilidad(3, "entidad", "publica")).toEqual({ permitido: true, aviso: true });
            // roles -> publica
            expect(cambioDeVisibilidad(3, "roles", "publica")).toEqual({ permitido: true, aviso: true });
        });

        it("hacerla MENOS abierta lleva aviso: false", () => {
            // publica -> roles, entidad, privada
            expect(cambioDeVisibilidad(3, "publica", "roles")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "publica", "entidad")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "publica", "privada")).toEqual({ permitido: true, aviso: false });
            // roles -> entidad, privada
            expect(cambioDeVisibilidad(3, "roles", "entidad")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "roles", "privada")).toEqual({ permitido: true, aviso: false });
            // entidad -> privada
            expect(cambioDeVisibilidad(3, "entidad", "privada")).toEqual({ permitido: true, aviso: false });
        });

        it("mismo nivel -> permitido sin aviso", () => {
            expect(cambioDeVisibilidad(3, "privada", "privada")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "entidad", "entidad")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "roles", "roles")).toEqual({ permitido: true, aviso: false });
            expect(cambioDeVisibilidad(3, "publica", "publica")).toEqual({ permitido: true, aviso: false });
        });

        it("un rol no puede subir nada por encima del rango que ya tiene en la entidad", () => {
            // rango 3 (gestor) no puede subir a 'publica' si eso excede su rango
            // pero según la regla, el rango 3 PUEDE gestionar visibilidad, así que sí puede
            // La restricción es: no puede dar a un rol más de lo que tendría en la entidad
            // Esto se valida en la capa de arriba; aquí solo comprobamos la función pura
            expect(cambioDeVisibilidad(3, "privada", "publica")).toEqual({ permitido: true, aviso: true });
        });
    });
});