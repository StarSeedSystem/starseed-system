import { describe, expect, test } from "vitest";

import {
    agruparContactos,
    aplicarCambios,
    buscarDuplicados,
    crearContacto,
    filtrarContactos,
    fusionarContactos,
    fusionarDocs,
    iniciales,
    limpiarReferencias,
    normalizarTelefono,
    ordenarContactos,
    proximosCumpleanos,
    vivos,
} from "@/lib/contactos/modelo";
import { DOC_VACIO, type CategoriaContactos, type Contacto, type ContactosDoc } from "@/lib/contactos/tipos";

function doc(parcial: Partial<ContactosDoc>): ContactosDoc {
    return { ...DOC_VACIO, ...parcial };
}

function contactoBase(parcial: Partial<Contacto> = {}): Contacto {
    return {
        ...crearContacto({ nombre: "Ana Pérez" }, "2026-01-01T00:00:00.000Z"),
        ...parcial,
    };
}

describe("crearContacto", () => {
    test("aplica defaults del contrato", () => {
        const c = crearContacto({ nombre: "  Juan  " }, "2026-01-01T00:00:00.000Z");
        expect(c.nombre).toBe("Juan");
        expect(c.relacion).toBe("amistad");
        expect(c.visibilidad).toBe("privada");
        expect(c.origen).toBe("manual");
        expect(c.favorito).toBe(false);
        expect(c.telefonos).toEqual([]);
        expect(c.categorias).toEqual([]);
        expect(c.borrado).toBeNull();
        expect(c.id).toBeTruthy();
    });

    test("origen 'starseed' cuando hay userId", () => {
        const c = crearContacto({ nombre: "Ada", userId: "u1" });
        expect(c.origen).toBe("starseed");
    });

    test("respeta un origen explícito (vcard/seguido)", () => {
        expect(crearContacto({ nombre: "X", origen: "vcard" }).origen).toBe("vcard");
        expect(crearContacto({ nombre: "X", userId: "u1", origen: "seguido" }).origen).toBe("seguido");
    });

    test("descarta teléfonos/correos vacíos y da id a los que no lo traen", () => {
        const c = crearContacto({
            nombre: "Rita",
            telefonos: [
                { id: "", etiqueta: "móvil", valor: "  600111222  " },
                { id: "x", etiqueta: "casa", valor: "   " },
            ],
        });
        expect(c.telefonos).toHaveLength(1);
        expect(c.telefonos[0].valor).toBe("600111222");
        expect(c.telefonos[0].id).toBeTruthy();
    });
});

describe("aplicarCambios", () => {
    test("toca actualizado y solo cambia los campos presentes", () => {
        const c = contactoBase();
        const editado = aplicarCambios(c, { apodo: "Anita" }, "2026-02-01T00:00:00.000Z");
        expect(editado.apodo).toBe("Anita");
        expect(editado.nombre).toBe(c.nombre);
        expect(editado.actualizado).toBe("2026-02-01T00:00:00.000Z");
    });
});

describe("vivos", () => {
    test("filtra los que tienen lápida", () => {
        const xs = [{ id: "1", borrado: null }, { id: "2", borrado: "2026-01-01" }];
        expect(vivos(xs).map((x) => x.id)).toEqual(["1"]);
    });
});

describe("fusionarDocs", () => {
    test("es conmutativa (fusionar(a,b) === fusionar(b,a))", () => {
        const c1 = contactoBase({ id: "c1", nombre: "Ana", actualizado: "2026-01-01T00:00:00.000Z" });
        const c1Editado = { ...c1, nombre: "Ana María", actualizado: "2026-01-05T00:00:00.000Z" };
        const c2 = contactoBase({ id: "c2", nombre: "Beto", actualizado: "2026-01-02T00:00:00.000Z" });

        const a = doc({ contactos: [c1, c2], actualizado: "2026-01-02T00:00:00.000Z" });
        const b = doc({ contactos: [c1Editado], actualizado: "2026-01-05T00:00:00.000Z" });

        const ab = fusionarDocs(a, b);
        const ba = fusionarDocs(b, a);
        expect(ab).toEqual(ba);
        expect(ab.contactos.find((c) => c.id === "c1")?.nombre).toBe("Ana María");
        expect(ab.contactos.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    });

    test("los borrados (lápidas) no resucitan aunque el otro lado aún tenga el elemento vivo con reloj más antiguo", () => {
        const vivo = contactoBase({ id: "c1", actualizado: "2026-01-01T00:00:00.000Z", borrado: null });
        const borrado = { ...vivo, borrado: "2026-01-10T00:00:00.000Z", actualizado: "2026-01-10T00:00:00.000Z" };

        const a = doc({ contactos: [borrado] });
        const b = doc({ contactos: [vivo] });

        const fundido = fusionarDocs(a, b);
        expect(fundido.contactos[0].borrado).toBe("2026-01-10T00:00:00.000Z");
        expect(fusionarDocs(b, a)).toEqual(fundido);
    });

    test("migradoSeguidos se conserva true si cualquiera de los dos lo trae", () => {
        const a = doc({ migradoSeguidos: true });
        const b = doc({ migradoSeguidos: false });
        expect(fusionarDocs(a, b).migradoSeguidos).toBe(true);
        expect(fusionarDocs(b, a).migradoSeguidos).toBe(true);
    });

    test("unión de ids de categorías/listas", () => {
        const catA: CategoriaContactos = {
            id: "cat1",
            nombre: "Trabajo",
            color: "#000",
            creado: "2026-01-01T00:00:00.000Z",
            actualizado: "2026-01-01T00:00:00.000Z",
        };
        const catB: CategoriaContactos = {
            id: "cat2",
            nombre: "Huerto",
            color: "#111",
            creado: "2026-01-01T00:00:00.000Z",
            actualizado: "2026-01-01T00:00:00.000Z",
        };
        const a = doc({ categorias: [catA] });
        const b = doc({ categorias: [catB] });
        expect(fusionarDocs(a, b).categorias.map((c) => c.id).sort()).toEqual(["cat1", "cat2"]);
    });
});

describe("limpiarReferencias", () => {
    test("quita ids de categoría/lista muertas de los contactos", () => {
        const c = contactoBase({ categorias: ["viva", "muerta"], listas: ["listaViva", "listaMuerta"] });
        const d = doc({
            contactos: [c],
            categorias: [
                { id: "viva", nombre: "Viva", color: "#000", creado: "x", actualizado: "x" },
                { id: "muerta", nombre: "Muerta", color: "#000", creado: "x", actualizado: "x", borrado: "2026-01-01" },
            ],
            listas: [{ id: "listaViva", nombre: "L", color: "#000", creado: "x", actualizado: "x" }],
        });
        const limpio = limpiarReferencias(d);
        expect(limpio.contactos[0].categorias).toEqual(["viva"]);
        expect(limpio.contactos[0].listas).toEqual(["listaViva"]);
    });
});

describe("normalizarTelefono", () => {
    test("quita espacios/guiones y normaliza el prefijo internacional 00", () => {
        expect(normalizarTelefono("+34 600-111 222")).toBe("+34600111222");
        expect(normalizarTelefono("0034 600 111 222")).toBe("+34600111222");
    });
});

describe("filtrarContactos", () => {
    const cats: CategoriaContactos[] = [
        { id: "trab", nombre: "Trabajo", color: "#000", creado: "x", actualizado: "x" },
    ];
    const cs = [
        contactoBase({ id: "1", nombre: "María José", categorias: ["trab"] }),
        contactoBase({ id: "2", nombre: "Ramon", correos: [{ id: "e", etiqueta: "casa", valor: "ramon@x.com" }] }),
    ];

    test("busca por texto plegando acentos", () => {
        expect(filtrarContactos(cs, { texto: "maria jose" }).map((c) => c.id)).toEqual(["1"]);
    });

    test("busca por correo", () => {
        expect(filtrarContactos(cs, { texto: "ramon@x.com" }).map((c) => c.id)).toEqual(["2"]);
    });

    test("busca por nombre de categoría cuando se pasan las categorías", () => {
        expect(filtrarContactos(cs, { texto: "trabajo" }, cats).map((c) => c.id)).toEqual(["1"]);
    });

    test("filtra por soloStarseed", () => {
        const conCuenta = contactoBase({ id: "3", userId: "u1" });
        expect(filtrarContactos([...cs, conCuenta], { soloStarseed: true }).map((c) => c.id)).toEqual(["3"]);
    });
});

describe("ordenarContactos", () => {
    test("nombre usa localeCompare es/base (ignora mayúsculas y tildes en el orden esperado)", () => {
        const cs = [contactoBase({ id: "1", nombre: "Zoe" }), contactoBase({ id: "2", nombre: "ana" })];
        expect(ordenarContactos(cs, "nombre").map((c) => c.id)).toEqual(["2", "1"]);
    });

    test("no fuerza favoritos primero", () => {
        const cs = [
            contactoBase({ id: "1", nombre: "Bruno", favorito: false }),
            contactoBase({ id: "2", nombre: "Ana", favorito: true }),
        ];
        expect(ordenarContactos(cs, "nombre").map((c) => c.id)).toEqual(["2", "1"]);
    });
});

describe("agruparContactos", () => {
    test("letra: A-Z con Ñ propia y # para el resto", () => {
        const cs = [
            contactoBase({ id: "1", nombre: "Ñoño" }),
            contactoBase({ id: "2", nombre: "Álvaro" }),
            contactoBase({ id: "3", nombre: "123 Empresa" }),
        ];
        const grupos = agruparContactos(cs, "letra", []);
        const claves = grupos.map((g) => g.clave);
        expect(claves).toContain("Ñ");
        expect(claves).toContain("A");
        expect(claves).toContain("#");
        expect(grupos.find((g) => g.clave === "Ñ")?.contactos.map((c) => c.id)).toEqual(["1"]);
    });

    test("relacion: en el orden de RELACIONES", () => {
        const cs = [
            contactoBase({ id: "1", relacion: "trabajo" }),
            contactoBase({ id: "2", relacion: "familia" }),
        ];
        const grupos = agruparContactos(cs, "relacion", []);
        expect(grupos.map((g) => g.clave)).toEqual(["familia", "trabajo"]);
    });

    test("categoria: un contacto en 2 categorías aparece en las 2, y hay grupo Sin categoría", () => {
        const cs = [
            contactoBase({ id: "1", categorias: ["a", "b"] }),
            contactoBase({ id: "2", categorias: [] }),
        ];
        const cats: CategoriaContactos[] = [
            { id: "a", nombre: "A", color: "#000", creado: "x", actualizado: "x" },
            { id: "b", nombre: "B", color: "#000", creado: "x", actualizado: "x" },
        ];
        const grupos = agruparContactos(cs, "categoria", cats);
        expect(grupos.find((g) => g.clave === "a")?.contactos.map((c) => c.id)).toEqual(["1"]);
        expect(grupos.find((g) => g.clave === "b")?.contactos.map((c) => c.id)).toEqual(["1"]);
        expect(grupos.find((g) => g.titulo === "Sin categoría")?.contactos.map((c) => c.id)).toEqual(["2"]);
    });

    test("ninguna: un solo grupo con todos", () => {
        const cs = [contactoBase({ id: "1" }), contactoBase({ id: "2" })];
        expect(agruparContactos(cs, "ninguna", [])).toHaveLength(1);
    });
});

describe("buscarDuplicados", () => {
    test("agrupa por userId, teléfono, correo y nombre exacto (transitivo)", () => {
        const a = contactoBase({ id: "a", nombre: "Uno", telefonos: [{ id: "1", etiqueta: "móvil", valor: "600111222" }] });
        const b = contactoBase({ id: "b", nombre: "Dos", telefonos: [{ id: "2", etiqueta: "casa", valor: "600-111-222" }], correos: [{ id: "3", etiqueta: "casa", valor: "dos@x.com" }] });
        const c = contactoBase({ id: "c", nombre: "Tres", correos: [{ id: "4", etiqueta: "casa", valor: "DOS@X.COM" }] });
        const suelto = contactoBase({ id: "d", nombre: "Suelto" });

        const grupos = buscarDuplicados([a, b, c, suelto]);
        expect(grupos).toHaveLength(1);
        expect(grupos[0].map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    });

    test("nombre exacto plegado también cuenta como duplicado", () => {
        const a = contactoBase({ id: "a", nombre: "José García" });
        const b = contactoBase({ id: "b", nombre: "jose garcia" });
        expect(buscarDuplicados([a, b])).toHaveLength(1);
    });
});

describe("fusionarContactos", () => {
    test("une teléfonos/correos/enlaces sin duplicar, categorías/listas y favorito OR", () => {
        const base = contactoBase({
            id: "base",
            telefonos: [{ id: "1", etiqueta: "móvil", valor: "600111222" }],
            categorias: ["a"],
            favorito: false,
        });
        const otro = contactoBase({
            id: "otro",
            telefonos: [{ id: "2", etiqueta: "casa", valor: "600-111-222" }],
            correos: [{ id: "3", etiqueta: "casa", valor: "x@y.com" }],
            categorias: ["b"],
            favorito: true,
        });
        const fundido = fusionarContactos(base, otro, "2026-03-01T00:00:00.000Z");
        expect(fundido.id).toBe("base");
        expect(fundido.telefonos).toHaveLength(1); // deduplicado por teléfono normalizado
        expect(fundido.correos).toHaveLength(1);
        expect(fundido.categorias.sort()).toEqual(["a", "b"]);
        expect(fundido.favorito).toBe(true);
        expect(fundido.actualizado).toBe("2026-03-01T00:00:00.000Z");
    });

    test("mantiene el userId de base salvo que le falte", () => {
        const base = contactoBase({ id: "base", userId: null });
        const otro = contactoBase({ id: "otro", userId: "u1", username: "otro" });
        const fundido = fusionarContactos(base, otro);
        expect(fundido.userId).toBe("u1");
        expect(fundido.username).toBe("otro");
    });

    test("el campo escalar no vacío más reciente gana", () => {
        const base = contactoBase({ id: "base", descripcion: "vieja", actualizado: "2026-01-01T00:00:00.000Z" });
        const otro = contactoBase({ id: "otro", descripcion: "nueva", actualizado: "2026-02-01T00:00:00.000Z" });
        expect(fusionarContactos(base, otro).descripcion).toBe("nueva");
    });
});

describe("iniciales", () => {
    test("primera y última palabra", () => {
        expect(iniciales("Ana María Pérez")).toBe("AP");
        expect(iniciales("Cher")).toBe("C");
        expect(iniciales("")).toBe("?");
    });
});

describe("proximosCumpleanos", () => {
    test("cumpleaños con año conocido calcula la edad que cumple", () => {
        const c = contactoBase({ id: "1", cumpleanos: "1990-06-15" });
        const [prox] = proximosCumpleanos([c], new Date(2026, 5, 1), 30);
        expect(prox.cumple).toBe(36);
        expect(prox.fecha.getMonth()).toBe(5);
        expect(prox.fecha.getDate()).toBe(15);
    });

    test("--MM-DD sin año no da 'cumple'", () => {
        const c = contactoBase({ id: "1", cumpleanos: "--03-10" });
        const [prox] = proximosCumpleanos([c], new Date(2026, 2, 1), 30);
        expect(prox.cumple).toBeUndefined();
    });

    test("cruza fin de año (hoy en diciembre, cumple en enero)", () => {
        const c = contactoBase({ id: "1", cumpleanos: "--01-05" });
        const resultado = proximosCumpleanos([c], new Date(2026, 11, 20), 30);
        expect(resultado).toHaveLength(1);
        expect(resultado[0].fecha.getFullYear()).toBe(2027);
        expect(resultado[0].fecha.getMonth()).toBe(0);
        expect(resultado[0].fecha.getDate()).toBe(5);
    });

    test("29 de febrero cae en 28 en año no bisiesto", () => {
        const c = contactoBase({ id: "1", cumpleanos: "--02-29" });
        const resultado = proximosCumpleanos([c], new Date(2027, 1, 20), 30);
        expect(resultado[0].fecha.getFullYear()).toBe(2027);
        expect(resultado[0].fecha.getMonth()).toBe(1);
        expect(resultado[0].fecha.getDate()).toBe(28);
    });

    test("fuera de la ventana de días no aparece", () => {
        const c = contactoBase({ id: "1", cumpleanos: "--09-01" });
        expect(proximosCumpleanos([c], new Date(2026, 0, 1), 30)).toHaveLength(0);
    });
});
