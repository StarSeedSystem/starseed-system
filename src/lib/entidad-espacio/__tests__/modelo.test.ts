import { describe, it, expect } from "vitest";
import {
    CLAVE_ESPACIO,
    type Visibilidad,
    type AccesoPublico,
    type Pestana,
    normalizarEspacio,
    anadirPestana,
    quitarPestana,
} from "../modelo";

describe("modelo de espacio de entidad", () => {
    describe("CLAVE_ESPACIO", () => {
        it("es 'espacio'", () => {
            expect(CLAVE_ESPACIO).toBe("espacio");
        });
    });

    describe("normalizarEspacio", () => {
        it("dato roto devuelve lista vacía sin lanzar", () => {
            expect(normalizarEspacio(null)).toEqual([]);
            expect(normalizarEspacio(undefined)).toEqual([]);
            expect(normalizarEspacio("string")).toEqual([]);
            expect(normalizarEspacio(123)).toEqual([]);
            expect(normalizarEspacio([])).toEqual([]);
        });

        it("descarta elementos que no son objetos", () => {
            const raw = [
                { id: "1", titulo: "Válida", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000" },
                "no es objeto",
                null,
                42,
                { id: "2", titulo: "También válida", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001" },
            ];
            const result = normalizarEspacio(raw);
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe("1");
            expect(result[1].id).toBe("2");
        });

        it("visibilidad inválida se convierte en 'privada'", () => {
            const raw = [
                { id: "1", titulo: "Test", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "invalida" },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].visibilidad).toBe("privada");
        });

        it("visibilidad desconocida se convierte en 'privada' (nunca más abierta)", () => {
            const raw = [
                { id: "1", titulo: "Test", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "publica" },
                { id: "2", titulo: "Test2", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001", visibilidad: "entidad" },
                { id: "3", titulo: "Test3", tipo: "tabla", sesionId: "550e8400-e29b-41d4-a716-446655440002", visibilidad: "roles" },
                { id: "4", titulo: "Test4", tipo: "documento", sesionId: "550e8400-e29b-41d4-a716-446655440003", visibilidad: "privada" },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].visibilidad).toBe("publica");
            expect(result[1].visibilidad).toBe("entidad");
            expect(result[2].visibilidad).toBe("roles");
            expect(result[3].visibilidad).toBe("privada");
        });

        it("pestañas duplicadas se quedan con la primera", () => {
            const raw = [
                { id: "1", titulo: "Primera", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000" },
                { id: "1", titulo: "Duplicada", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001" },
            ];
            const result = normalizarEspacio(raw);
            expect(result).toHaveLength(1);
            expect(result[0].titulo).toBe("Primera");
        });

        it("máximo 24 pestañas, la 25ª se rechaza", () => {
            const raw = Array.from({ length: 25 }, (_, i) => ({
                id: String(i + 1),
                titulo: `Pestaña ${i + 1}`,
                tipo: "pizarra",
                sesionId: "550e8400-e29b-41d4-a716-446655440000",
            }));
            const result = normalizarEspacio(raw);
            expect(result).toHaveLength(24);
        });

        it("título de 1-60 caracteres, se recorta si excede", () => {
            const raw = [
                { id: "1", titulo: "A".repeat(65), tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000" },
                { id: "2", titulo: "", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001" },
                { id: "3", titulo: "  ", tipo: "tabla", sesionId: "550e8400-e29b-41d4-a716-446655440002" },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].titulo).toHaveLength(60);
            expect(result[1].titulo).toBe("Sin título");
            expect(result[2].titulo).toBe("Sin título");
        });

        it("sesionId debe ser UUID válido, si no se descarta la pestaña", () => {
            const raw = [
                { id: "1", titulo: "Válida", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000" },
                { id: "2", titulo: "Inválida", tipo: "dashboard", sesionId: "no-uuid" },
                { id: "3", titulo: "También inválida", tipo: "tabla", sesionId: "123" },
            ];
            const result = normalizarEspacio(raw);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("accesoPublico por defecto 'ninguno', solo 'ver' si visibilidad es 'publica'", () => {
            const raw = [
                { id: "1", titulo: "Publica", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "publica" },
                { id: "2", titulo: "Entidad", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001", visibilidad: "entidad" },
                { id: "3", titulo: "Roles", tipo: "tabla", sesionId: "550e8400-e29b-41d4-a716-446655440002", visibilidad: "roles" },
                { id: "4", titulo: "Privada", tipo: "documento", sesionId: "550e8400-e29b-41d4-a716-446655440003", visibilidad: "privada" },
                { id: "5", titulo: "Sin visibilidad", tipo: "navegador", sesionId: "550e8400-e29b-41d4-a716-446655440004" },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].accesoPublico).toBe("ver");
            expect(result[1].accesoPublico).toBe("ninguno");
            expect(result[2].accesoPublico).toBe("ninguno");
            expect(result[3].accesoPublico).toBe("ninguno");
            expect(result[4].accesoPublico).toBe("ninguno");
        });

        it("accesoPublico 'ver' con visibilidad 'entidad' se corrige a 'ninguno'", () => {
            const raw = [
                { id: "1", titulo: "Test", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "entidad", accesoPublico: "ver" },
                { id: "2", titulo: "Test2", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001", visibilidad: "roles", accesoPublico: "ver" },
                { id: "3", titulo: "Test3", tipo: "tabla", sesionId: "550e8400-e29b-41d4-a716-446655440002", visibilidad: "privada", accesoPublico: "ver" },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].accesoPublico).toBe("ninguno");
            expect(result[1].accesoPublico).toBe("ninguno");
            expect(result[2].accesoPublico).toBe("ninguno");
        });

        it("roles solo con visibilidad 'roles', máximo 8 textos de 30 caracteres", () => {
            const raw = [
                {
                    id: "1",
                    titulo: "Con roles",
                    tipo: "pizarra",
                    sesionId: "550e8400-e29b-41d4-a716-446655440000",
                    visibilidad: "roles",
                    roles: ["admin", "editor", "viewer", "rol-muy-largo-que-excede-treinta-caracteres", "rol5", "rol6", "rol7", "rol8", "rol9"],
                },
                {
                    id: "2",
                    titulo: "Sin visibilidad roles",
                    tipo: "dashboard",
                    sesionId: "550e8400-e29b-41d4-a716-446655440001",
                    visibilidad: "entidad",
                    roles: ["admin", "editor"],
                },
            ];
            const result = normalizarEspacio(raw);
            expect(result[0].roles).toHaveLength(8);
            expect(result[0].roles?.[3]).toHaveLength(30);
            expect(result[1].roles).toBeUndefined();
        });

        it("faltan campos requeridos → se descarta la pestaña", () => {
            const raw = [
                { id: "1", titulo: "Válida", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000" },
                { titulo: "Sin id", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001" },
                { id: "2", tipo: "tabla", sesionId: "550e8400-e29b-41d4-a716-446655440002" },
                { id: "3", titulo: "Sin sesionId", tipo: "documento" },
            ];
            const result = normalizarEspacio(raw);
            expect(result).toHaveLength(1);
        });
    });

    describe("anadirPestana", () => {
        it("añade una pestaña válida a la lista", () => {
            const lista: Pestana[] = [];
            const nueva: Pestana = {
                id: "1",
                titulo: "Nueva",
                tipo: "pizarra",
                sesionId: "550e8400-e29b-41d4-a716-446655440000",
                visibilidad: "privada",
                accesoPublico: "ninguno",
            };
            const result = anadirPestana(lista, nueva);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(nueva);
        });

        it("no muta la lista original", () => {
            const lista: Pestana[] = [
                { id: "1", titulo: "Existente", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "privada", accesoPublico: "ninguno" },
            ];
            const nueva: Pestana = {
                id: "2",
                titulo: "Nueva",
                tipo: "dashboard",
                sesionId: "550e8400-e29b-41d4-a716-446655440001",
                visibilidad: "privada",
                accesoPublico: "ninguno",
            };
            const result = anadirPestana(lista, nueva);
            expect(lista).toHaveLength(1);
            expect(result).toHaveLength(2);
        });

        it("respeta el tope de 24 pestañas", () => {
            const lista: Pestana[] = Array.from({ length: 24 }, (_, i) => ({
                id: String(i + 1),
                titulo: `Pestaña ${i + 1}`,
                tipo: "pizarra",
                sesionId: "550e8400-e29b-41d4-a716-446655440000",
                visibilidad: "privada" as Visibilidad,
                accesoPublico: "ninguno" as AccesoPublico,
            }));
            const nueva: Pestana = {
                id: "25",
                titulo: "Nueva",
                tipo: "dashboard",
                sesionId: "550e8400-e29b-41d4-a716-446655440001",
                visibilidad: "privada",
                accesoPublico: "ninguno",
            };
            const result = anadirPestana(lista, nueva);
            expect(result).toHaveLength(24);
        });

        it("respeta la unicidad de id (no añade si ya existe)", () => {
            const lista: Pestana[] = [
                { id: "1", titulo: "Existente", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "privada", accesoPublico: "ninguno" },
            ];
            const nueva: Pestana = {
                id: "1",
                titulo: "Duplicada",
                tipo: "dashboard",
                sesionId: "550e8400-e29b-41d4-a716-446655440001",
                visibilidad: "privada",
                accesoPublico: "ninguno",
            };
            const result = anadirPestana(lista, nueva);
            expect(result).toHaveLength(1);
            expect(result[0].titulo).toBe("Existente");
        });
    });

    describe("quitarPestana", () => {
        it("quita una pestaña por id", () => {
            const lista: Pestana[] = [
                { id: "1", titulo: "Primera", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "privada", accesoPublico: "ninguno" },
                { id: "2", titulo: "Segunda", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001", visibilidad: "privada", accesoPublico: "ninguno" },
            ];
            const result = quitarPestana(lista, "1");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("2");
        });

        it("no muta la lista original", () => {
            const lista: Pestana[] = [
                { id: "1", titulo: "Primera", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "privada", accesoPublico: "ninguno" },
                { id: "2", titulo: "Segunda", tipo: "dashboard", sesionId: "550e8400-e29b-41d4-a716-446655440001", visibilidad: "privada", accesoPublico: "ninguno" },
            ];
            const result = quitarPestana(lista, "1");
            expect(lista).toHaveLength(2);
            expect(result).toHaveLength(1);
        });

        it("si el id no existe, devuelve la lista igual", () => {
            const lista: Pestana[] = [
                { id: "1", titulo: "Primera", tipo: "pizarra", sesionId: "550e8400-e29b-41d4-a716-446655440000", visibilidad: "privada", accesoPublico: "ninguno" },
            ];
            const result = quitarPestana(lista, "inexistente");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });
    });
});