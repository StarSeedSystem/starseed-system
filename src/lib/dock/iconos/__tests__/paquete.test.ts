import { describe, expect, it } from "vitest";
import {
    ETIQUETA_BIBLIOTECA,
    FORMATO_PAQUETE,
    MAX_PAQUETE_CARACTERES,
    empaquetarDiseno,
    empaquetarPlantilla,
    leerPaquete,
    nombreArchivo,
    paqueteATexto,
} from "../paquete";
import { disenoBase, normalizarPlantilla } from "../modelo";
import { plantillaDeSerie } from "../plantillas-serie";

describe("paquete de iconos", () => {
    it("un diseño sobrevive ida y vuelta por texto", () => {
        const d = { ...disenoBase("#10b77f"), nombre: "Verde" };
        const l = leerPaquete(paqueteATexto(empaquetarDiseno(d, new Date("2026-10-26T10:00:00Z"))));
        expect(l.ok).toBe(true);
        expect(l.tipo).toBe("diseno");
        expect(l.diseno).toEqual(d);
    });

    it("una plantilla sobrevive ida y vuelta, también las de serie", () => {
        for (const id of ["serie-trinity", "serie-monocromo"]) {
            const p = plantillaDeSerie(id)!;
            const l = leerPaquete(paqueteATexto(empaquetarPlantilla(p)));
            expect(l.ok, id).toBe(true);
            expect(l.plantilla).toEqual(p);
        }
    });

    it("el sobre lleva formato, versión, tipo y fecha", () => {
        const p = empaquetarPlantilla(plantillaDeSerie("serie-trinity")!, new Date("2026-10-26T10:00:00Z"));
        expect(p).toMatchObject({ formato: FORMATO_PAQUETE, version: 1, tipo: "plantilla", creado: "2026-10-26T10:00:00.000Z" });
        expect(ETIQUETA_BIBLIOTECA).toBe("starseed-iconos");
    });

    it("rechaza con motivo lo que no es un paquete", () => {
        const casos: unknown[] = ["", "{no json", "[]", "null", "3", JSON.stringify({ formato: "otro", version: 1 }), JSON.stringify({ formato: FORMATO_PAQUETE, version: 1 }), JSON.stringify({ formato: FORMATO_PAQUETE, version: 99, tipo: "diseno" })];
        for (const c of casos) {
            const l = leerPaquete(c);
            expect(l.ok, String(c)).toBe(false);
            expect(l.motivos.length, String(c)).toBeGreaterThan(0);
        }
    });

    it("rechaza un texto enorme sin intentar interpretarlo", () => {
        expect(leerPaquete("x".repeat(MAX_PAQUETE_CARACTERES + 1)).ok).toBe(false);
    });

    it("un diseño hostil dentro del paquete no se acepta", () => {
        const hostil = { formato: FORMATO_PAQUETE, version: 1, tipo: "diseno", diseno: { ...disenoBase(), glifo: { tipo: "imagen", src: "https://rastreo.example/p.gif" } } };
        const l = leerPaquete(JSON.stringify(hostil));
        expect(l.ok).toBe(false);
    });

    it("una plantilla con diseños rotos se acepta sin ellos y lo cuenta", () => {
        const p = plantillaDeSerie("serie-monocromo")!;
        const sucia = { ...p, disenos: { Bell: p.porDefecto, Mala: { glifo: { tipo: "svg", svg: "nada" } } } };
        const l = leerPaquete(JSON.stringify({ formato: FORMATO_PAQUETE, version: 1, tipo: "plantilla", plantilla: sucia }));
        expect(l.ok).toBe(true);
        expect(Object.keys(l.plantilla!.disenos)).toEqual(["Bell"]);
        expect(l.motivos.join(" ")).toMatch(/1 diseño/);
        expect(normalizarPlantilla(l.plantilla)).toEqual(l.plantilla);
    });

    it("un diseño suelto lleva su autoría y su licencia, y se leen al volver", () => {
        const l = leerPaquete(paqueteATexto(empaquetarDiseno(disenoBase(), new Date(), { autor: "Ana", licencia: "CC0 · dominio público" })));
        expect(l.autor).toBe("Ana");
        expect(l.licencia).toBe("CC0 · dominio público");
    });

    it("la autoría y la licencia se limpian: sin etiquetas, sin saltos y con tope", () => {
        const p = empaquetarDiseno(disenoBase(), new Date(), { autor: "<img src=x onerror=1>\nAna" + "a".repeat(500), licencia: "  " });
        expect(p.autor).not.toMatch(/[<>\n]/);
        expect(p.autor!.length).toBeLessThanOrEqual(60);
        expect(p.licencia).toBeUndefined();
        // y lo que viene de fuera también se limpia al leer
        const crudo = { ...p, autor: "<b>Eva</b>", licencia: "x".repeat(900) };
        const l = leerPaquete(crudo);
        expect(l.autor).not.toMatch(/[<>]/);
        expect(l.licencia!.length).toBeLessThan(200);
    });

    it("sin autoría ni licencia no escribe campos vacíos", () => {
        const p = empaquetarDiseno(disenoBase());
        expect("autor" in p).toBe(false);
        expect("licencia" in p).toBe(false);
    });

    it("también lee un objeto ya parseado", () => {
        expect(leerPaquete(empaquetarDiseno(disenoBase())).ok).toBe(true);
    });
});

describe("nombreArchivo", () => {
    it("es seguro y legible", () => {
        expect(nombreArchivo("Cristal líquido ✨", "json")).toBe("starseed-cristal-liquido.json");
        expect(nombreArchivo("../../etc/passwd", "svg")).toBe("starseed-etc-passwd.svg");
        expect(nombreArchivo("", "json")).toBe("starseed-iconos.json");
        expect(nombreArchivo("a".repeat(200), "json").length).toBeLessThan(70);
    });
});
