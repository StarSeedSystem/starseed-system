/*
 * Avisos de mensajes nuevos (NOT1108A): qué aviso merece cada mensaje según dónde está la persona, la ruta
 * que abre cada chat (igual que Rust), el texto y la deduplicación.
 *   NODE_ENV=test npx vitest run src/lib/notifications/__tests__/avisos-mensajes-logica.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    Vistos,
    decidirAviso,
    describirNeurona,
    mismaRuta,
    rutaChat,
    rutaValida,
    textoAviso,
    type Situacion,
} from "../avisos-mensajes-logica";

const base: Situacion = {
    visible: true,
    enfocado: true,
    chatAbierto: null,
    silenciado: false,
    centroPermitido: true,
    popupsPermitidos: true,
    sistemaDisponible: true,
};

describe("decidirAviso", () => {
    it("leyendo ese chat con la app a la vista: nada", () => {
        expect(decidirAviso({ clave: "n:mac" }, { ...base, chatAbierto: "n:mac" })).toMatchObject({ toast: false, centro: false, sistema: false, motivo: "leyendo" });
    });

    it("en otra sección del OS (u otro chat): aviso dentro del OS y centro, sin el del sistema", () => {
        expect(decidirAviso({ clave: "n:mac" }, base)).toEqual({ toast: true, centro: true, sistema: false, motivo: "a-la-vista" });
        expect(decidirAviso({ clave: "n:mac" }, { ...base, chatAbierto: "n:tablet" }).motivo).toBe("a-la-vista");
    });

    it("con la app oculta, sin foco o en segundo plano: el del sistema (y el centro para verlo al volver)", () => {
        expect(decidirAviso({ clave: "n:mac" }, { ...base, visible: false, enfocado: false })).toEqual({ toast: false, centro: true, sistema: true, motivo: "en-segundo-plano" });
        // Visible pero sin foco (otra ventana delante): también el del sistema, aunque el chat esté abierto detrás.
        expect(decidirAviso({ clave: "n:mac" }, { ...base, enfocado: false, chatAbierto: "n:mac" })).toMatchObject({ sistema: true, toast: false });
    });

    it("silenciado: nada (el contador sí sube aparte)", () => {
        expect(decidirAviso({ clave: "dm:1" }, { ...base, silenciado: true, visible: false })).toMatchObject({ toast: false, centro: false, sistema: false, motivo: "silenciado" });
    });

    it("respeta los permisos de la app «Mensajes» y el del sistema", () => {
        expect(decidirAviso({ clave: "n:a" }, { ...base, popupsPermitidos: false })).toMatchObject({ toast: false, centro: true });
        expect(decidirAviso({ clave: "n:a" }, { ...base, centroPermitido: false, visible: false })).toMatchObject({ centro: false, sistema: true });
        expect(decidirAviso({ clave: "n:a" }, { ...base, visible: false, sistemaDisponible: false })).toMatchObject({ sistema: false, centro: true });
        expect(decidirAviso({ clave: "n:a" }, { ...base, visible: false, popupsPermitidos: false })).toMatchObject({ sistema: false });
    });
});

describe("rutas", () => {
    it("cada chat abre su sitio de Mensajes", () => {
        expect(rutaChat("dm:abc-1")).toBe("/messages?vista=mensajes&hilo=abc-1");
        expect(rutaChat("n:e0b9faf2-0000")).toBe("/messages?vista=neuronas&neurona=n%3Ae0b9faf2-0000");
        expect(rutaChat("c:u 1")).toBe("/messages?vista=neuronas&neurona=c%3Au%201");
    });

    it("la misma regla que Rust (ruta_chat de avisos_mensajes.rs)", () => {
        const rs = readFileSync(join(process.cwd(), "native/src-tauri/src/avisos_mensajes.rs"), "utf8");
        expect(rs).toContain('assert_eq!(ruta_chat("dm:abc-1"), "/messages?vista=mensajes&hilo=abc-1");');
        expect(rs).toContain('assert_eq!(ruta_chat("c:u 1"), "/messages?vista=neuronas&neurona=c%3Au%201");');
        expect(rs).toContain('format!("/messages?vista=neuronas&neurona={}", codificar(clave))');
    });

    it("solo rutas internas", () => {
        expect(rutaValida("/messages?vista=neuronas")).toBe(true);
        for (const r of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/a\\b", "/a\nb", "", 5, null]) expect(rutaValida(r)).toBe(false);
    });

    it("misma ruta (para no volver a navegar)", () => {
        expect(mismaRuta({ pathname: "/messages", search: "?vista=neuronas&neurona=n%3Aa&x=1" }, "/messages?vista=neuronas&neurona=n%3Aa")).toBe(true);
        expect(mismaRuta({ pathname: "/messages", search: "?vista=neuronas" }, "/messages?vista=neuronas&neurona=n%3Aa")).toBe(false);
        expect(mismaRuta({ pathname: "/escritorios", search: "" }, "/messages")).toBe(false);
    });
});

describe("texto del aviso", () => {
    it("título y cuerpo legibles, recortados", () => {
        expect(textoAviso({ titulo: "Mac de Alex", texto: "hola\n  qué tal", tipo: "neurona" })).toEqual({ titulo: "Mac de Alex", cuerpo: "hola qué tal" });
        expect(textoAviso({ titulo: "", texto: "", tipo: "neurona" })).toEqual({ titulo: "Una neurona", cuerpo: "Mensaje nuevo." });
        const largo = textoAviso({ titulo: "x", texto: "a".repeat(400), tipo: "dm" }).cuerpo;
        expect(largo.length).toBe(178);
        expect(largo.endsWith("…")).toBe(true);
    });

    it("archivos, llamadas y transmisiones se describen", () => {
        expect(describirNeurona({ txt: "", adj: { nombre: "foto.jpg" } })).toBe("Te manda «foto.jpg».");
        expect(describirNeurona({ txt: "mira", adj: { nombre: "a.pdf" } })).toBe("Te manda «a.pdf». mira");
        expect(describirNeurona({ txt: "", fd: { nombre: "cámara" } })).toBe("Empezó una transmisión en vivo («cámara»).");
        expect(describirNeurona({ txt: "", ll: { via: "x" } })).toBe("Te está llamando.");
        expect(describirNeurona({ txt: "hola" })).toBe("hola");
    });
});

describe("Vistos", () => {
    it("un id se avisa una vez, con tope", () => {
        const v = new Vistos(3);
        expect(v.apuntar("a")).toBe(true);
        expect(v.apuntar("a")).toBe(false);
        v.apuntar("b");
        v.apuntar("c");
        v.apuntar("d");
        expect(v.contiene("a")).toBe(false);
        expect(v.contiene("d")).toBe(true);
    });
});
