/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { elegirIdioma, idiomaEfectivo, CLAVE_IDIOMA_NEURONA, PERFIL_CUENTA, EVENTO_IDIOMA } from "../estado";
import { guionArranque, CSS_PENDIENTE } from "../arranque";
import { iniciarCapa, fijarDocumento } from "../capa";
import { crearCatalogo } from "../catalogo";
import { CLAVE_TRADUCCION } from "@/lib/traduccion/preferencias";

const catalogoEn = crearCatalogo({ codigo: "en", revisado: false, entradas: { Guardar: "Save" } });

afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("dir");
    document.documentElement.removeAttribute("data-idioma-pendiente");
    document.documentElement.setAttribute("lang", "es");
    document.body.innerHTML = "";
});

describe("recarga: el idioma elegido sobrevive y se aplica antes del primer pintado", () => {
    it("elegirIdioma con almacén real de jsdom devuelve true", () => {
        const ok = elegirIdioma("en");
        expect(ok).toBe(true);
    });

    it("recarga: guionArranque fija lang y data-idioma-pendiente SÍNCRONAMENTE", () => {
        elegirIdioma("en");
        document.documentElement.removeAttribute("lang");
        document.documentElement.removeAttribute("dir");
        document.documentElement.removeAttribute("data-idioma-pendiente");

        new Function(guionArranque(["en"], []))();

        expect(document.documentElement.lang).toBe("en");
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(true);
    });

    it("idiomaEfectivo sigue diciendo en tras la recarga", () => {
        elegirIdioma("en");
        const eff = idiomaEfectivo();
        expect(eff.codigo).toBe("en");
        expect(eff.origen).toBe("persona");
    });

    it("iniciarCapa quita data-idioma-pendiente y traduce el texto", () => {
        elegirIdioma("en");
        new Function(guionArranque(["en"], []))();

        document.body.innerHTML = `<button>Guardar</button>`;
        iniciarCapa(document.body, document, "en", catalogoEn);

        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(false);
        expect(document.body.textContent).toBe("Save");
    });

    it("idioma sin catálogo en la lista: el guion no toca nada y lang sigue en es", () => {
        elegirIdioma("de");
        document.documentElement.removeAttribute("lang");
        document.documentElement.removeAttribute("dir");
        document.documentElement.removeAttribute("data-idioma-pendiente");
        document.documentElement.setAttribute("lang", "es");

        new Function(guionArranque(["en"], []))();

        expect(document.documentElement.lang).toBe("es");
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(false);
    });

    it("la elección se guardó en la neurona Y como valor de la cuenta (PERFIL_CUENTA)", () => {
        elegirIdioma("en");

        const neurona = JSON.parse(localStorage.getItem(CLAVE_IDIOMA_NEURONA) ?? "null");
        expect(neurona).not.toBeNull();
        expect(neurona.codigo).toBe("en");

        const cuenta = JSON.parse(localStorage.getItem(CLAVE_TRADUCCION) ?? "null");
        expect(cuenta).not.toBeNull();
        expect(cuenta[PERFIL_CUENTA]?.idioma).toBe("en");
    });

    it("otra neurona de la cuenta arranca con ese idioma si no eligió el suyo", () => {
        elegirIdioma("en");
        localStorage.removeItem(CLAVE_IDIOMA_NEURONA);

        document.documentElement.removeAttribute("lang");
        document.documentElement.removeAttribute("dir");
        document.documentElement.removeAttribute("data-idioma-pendiente");
        document.documentElement.setAttribute("lang", "es");

        new Function(guionArranque(["en"], []))();

        expect(document.documentElement.lang).toBe("en");
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(true);

        const eff = idiomaEfectivo();
        expect(eff.codigo).toBe("en");
        expect(eff.origen).toBe("cuenta");
    });
});