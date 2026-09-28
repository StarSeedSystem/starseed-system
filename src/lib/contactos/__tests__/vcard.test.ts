import { describe, expect, test } from "vitest";

import { crearContacto } from "@/lib/contactos/modelo";
import { exportarVCard, parseVCard } from "@/lib/contactos/vcard";

const CRLF = "\r\n";

describe("parseVCard", () => {
    test("tarjeta 3.0 básica: FN, N, TEL, EMAIL, URL, ORG, TITLE, BDAY, NOTE", () => {
        const texto = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "FN:Juan Pérez",
            "N:Pérez;Juan;;;",
            "TEL;TYPE=CELL:+34 600 123 456",
            "EMAIL;TYPE=HOME:juan@example.com",
            "URL:https://example.com",
            "ORG:Acme Corp",
            "TITLE:Ingeniero",
            "BDAY:1990-05-12",
            "NOTE:Amigo del trabajo",
            "END:VCARD",
        ].join(CRLF);

        const [entrada] = parseVCard(texto);
        expect(entrada.nombre).toBe("Juan Pérez");
        expect(entrada.telefonos).toEqual([expect.objectContaining({ etiqueta: "móvil", valor: "+34 600 123 456" })]);
        expect(entrada.correos).toEqual([expect.objectContaining({ etiqueta: "casa", valor: "juan@example.com" })]);
        expect(entrada.enlaces?.[0].url).toBe("https://example.com");
        expect(entrada.organizacion).toBe("Acme Corp");
        expect(entrada.cargo).toBe("Ingeniero");
        expect(entrada.cumpleanos).toBe("1990-05-12");
        expect(entrada.descripcion).toBe("Amigo del trabajo");
        expect(entrada.origen).toBe("vcard");
    });

    test("varias tarjetas en un mismo texto", () => {
        const texto = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "FN:Ana",
            "END:VCARD",
            "BEGIN:VCARD",
            "VERSION:3.0",
            "FN:Beto",
            "END:VCARD",
        ].join(CRLF);
        const entradas = parseVCard(texto);
        expect(entradas.map((e) => e.nombre)).toEqual(["Ana", "Beto"]);
    });

    test("desdoblado estándar (línea continuación con espacio inicial)", () => {
        const texto = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ana", "NOTE:Hola mun", " do largo", "END:VCARD"].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.descripcion).toBe("Hola mundo largo");
    });

    test("FN ausente cae a N (nombre + apellido)", () => {
        const texto = ["BEGIN:VCARD", "VERSION:3.0", "N:García;María;;;", "END:VCARD"].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.nombre).toBe("María García");
    });

    test("params TYPE=cell,home y TYPE=\"cell\" (con comillas)", () => {
        const texto = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "FN:X",
            'TEL;TYPE="cell":600111222',
            "TEL;TYPE=cell,home:600333444",
            "END:VCARD",
        ].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.telefonos?.every((t) => t.etiqueta === "móvil")).toBe(true);
    });

    test("vCard 2.1: parámetro-flag sin '=' (TYPE implícito)", () => {
        const texto = ["BEGIN:VCARD", "VERSION:2.1", "FN:X", "TEL;HOME:600111222", "END:VCARD"].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.telefonos?.[0].etiqueta).toBe("casa");
    });

    test("caracteres escapados \\, \\; \\n", () => {
        const texto = ["BEGIN:VCARD", "VERSION:3.0", "FN:X", "NOTE:Línea uno\\nLínea dos\\, con coma\\; y punto y coma", "END:VCARD"].join(
            CRLF,
        );
        const [entrada] = parseVCard(texto);
        expect(entrada.descripcion).toBe("Línea uno\nLínea dos, con coma; y punto y coma");
    });

    test("vCard 2.1 con QUOTED-PRINTABLE + CHARSET=UTF-8 decodifica acentos", () => {
        const texto = [
            "BEGIN:VCARD",
            "VERSION:2.1",
            "FN:José",
            "NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Caf=C3=A9 con leche y coraz=C3=B3n",
            "END:VCARD",
        ].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.descripcion).toBe("Café con leche y corazón");
    });

    test("X-STARSEED-USERNAME / X-STARSEED-ID", () => {
        const texto = [
            "BEGIN:VCARD",
            "VERSION:4.0",
            "FN:Ada",
            "X-STARSEED-USERNAME:ada99",
            "X-STARSEED-ID:11111111-1111-1111-1111-111111111111",
            "END:VCARD",
        ].join(CRLF);
        const [entrada] = parseVCard(texto);
        expect(entrada.username).toBe("ada99");
        expect(entrada.userId).toBe("11111111-1111-1111-1111-111111111111");
    });

    test("texto vacío o sin BEGIN/END no lanza y devuelve []", () => {
        expect(parseVCard("")).toEqual([]);
        expect(parseVCard("esto no es un vcard")).toEqual([]);
    });
});

describe("exportarVCard", () => {
    test("nunca exporta notas privadas (no hay claves de notas en la salida)", () => {
        const c = crearContacto({ nombre: "X", descripcion: "solo esto" });
        const salida = exportarVCard([c]);
        expect(salida).toContain("NOTE:solo esto");
        expect(salida.toLowerCase()).not.toContain("timeline");
        expect(salida).not.toContain("X-STARSEED-NOTA");
    });

    test("pliega líneas largas a 75 octetos sin cortar caracteres multibyte", () => {
        const descripcion = "áéíóúñ ".repeat(20).trim();
        const c = crearContacto({ nombre: "Multibyte", descripcion });
        const salida = exportarVCard([c]);
        const lineaNote = salida.split(CRLF).find((l, i, arr) => l.startsWith("NOTE:") || (i > 0 && arr[i - 1].startsWith("NOTE") ));
        expect(lineaNote).toBeTruthy();
        // ninguna línea de la tarjeta (excepto la última, END:VCARD) debe superar 76 octetos brutos
        for (const linea of salida.split(CRLF)) {
            if (linea === "END:VCARD" || linea === "BEGIN:VCARD" || linea === "VERSION:4.0" || linea === "") continue;
            expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75);
        }
    });
});

describe("round trip 4.0 (exportar → parsear)", () => {
    test("conserva nombre, teléfonos, correos, enlaces, organización, cargo, cumpleaños, descripción e identidad StarSeed", () => {
        const original = crearContacto({
            nombre: "Grace Hopper",
            telefonos: [{ id: "1", etiqueta: "móvil", valor: "+1 555 0100" }],
            correos: [{ id: "2", etiqueta: "trabajo", valor: "grace@navy.mil" }],
            enlaces: [{ id: "3", titulo: "Web", url: "https://example.org" }],
            organizacion: "US Navy",
            cargo: "Almirante",
            direccion: "Washington D.C.",
            cumpleanos: "1906-12-09",
            descripcion: "Pionera de la computación",
            username: "ghopper",
            userId: "22222222-2222-2222-2222-222222222222",
        });

        const vcard = exportarVCard([original]);
        const [entrada] = parseVCard(vcard);

        expect(entrada.nombre).toBe("Grace Hopper");
        expect(entrada.telefonos).toEqual([expect.objectContaining({ etiqueta: "móvil", valor: "+1 555 0100" })]);
        expect(entrada.correos).toEqual([expect.objectContaining({ etiqueta: "trabajo", valor: "grace@navy.mil" })]);
        expect(entrada.enlaces?.[0].url).toBe("https://example.org");
        expect(entrada.organizacion).toBe("US Navy");
        expect(entrada.cargo).toBe("Almirante");
        expect(entrada.direccion).toBe("Washington D.C.");
        expect(entrada.cumpleanos).toBe("1906-12-09");
        expect(entrada.descripcion).toBe("Pionera de la computación");
        expect(entrada.username).toBe("ghopper");
        expect(entrada.userId).toBe("22222222-2222-2222-2222-222222222222");
    });

    test("round trip con texto largo (fuerza plegado) y caracteres especiales escapables", () => {
        const descripcion = `Nota larga con, comas; y puntos y coma, además de saltos${"\n"}de línea, repetida ${"varias veces ".repeat(10)}al final.`;
        const original = crearContacto({ nombre: "Larga", descripcion });
        const vcard = exportarVCard([original]);
        const [entrada] = parseVCard(vcard);
        expect(entrada.descripcion).toBe(descripcion);
    });

    test("round trip de varios contactos a la vez", () => {
        const a = crearContacto({ nombre: "Uno", correos: [{ id: "1", etiqueta: "casa", valor: "uno@x.com" }] });
        const b = crearContacto({ nombre: "Dos", correos: [{ id: "2", etiqueta: "casa", valor: "dos@x.com" }] });
        const entradas = parseVCard(exportarVCard([a, b]));
        expect(entradas.map((e) => e.nombre)).toEqual(["Uno", "Dos"]);
    });
});
