/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { crearCatalogo } from "../catalogo";
import { iniciarCapa } from "../capa";
import { formatear } from "../formato";
import { guionArranque } from "../arranque";

const cat = crearCatalogo({
    codigo: "en", revisado: false,
    entradas: {
        "Guardar": "Save",
        "Escribe aquí": "Type here",
        "Hola, {0}": "Hello, {0}",
        "{0} neuronas": "{0, plural, one {# neuron} other {# neurons}}",
        "Tienes {0} mensajes sin leer": "You have {0, number} unread messages",
    },
});
const raiz = () => { document.body.innerHTML = ""; return document.body; };
afterEach(() => { document.body.innerHTML = ""; document.documentElement.removeAttribute("dir"); document.documentElement.setAttribute("lang", "es"); });

describe("capa de idioma", () => {
    it("traduce texto, atributos y patrones con valores, y conserva los espacios", () => {
        const b = raiz();
        b.innerHTML = `<button aria-label="Guardar"> Guardar </button><input placeholder="Escribe aquí"><p>Hola, Ana</p>`;
        iniciarCapa(b, document, "en", cat);
        expect(b.querySelector("button")!.textContent).toBe(" Save ");
        expect(b.querySelector("button")!.getAttribute("aria-label")).toBe("Save");
        expect(b.querySelector("input")!.getAttribute("placeholder")).toBe("Type here");
        expect(b.querySelector("p")!.textContent).toBe("Hello, Ana");
    });
    it("un patrón casi todo valores no casa con frases ajenas («{0} en {1}»)", () => {
        const c = crearCatalogo({ codigo: "en", revisado: false, entradas: { "{0} en {1}": "{0} in {1}", "Conectado a {0}": "Connected to {0}" } });
        expect(c.traducir("1 neurona en tu cuenta")).toBeNull();
        expect(c.traducir("Conectado a Wi-Fi")).toBe("Connected to Wi-Fi");
    });
    it("plurales y números según Intl", () => {
        const b = raiz();
        b.innerHTML = `<i>1 neuronas</i><i>3 neuronas</i><i>Tienes 12345 mensajes sin leer</i>`;
        iniciarCapa(b, document, "en", cat);
        const t = [...b.querySelectorAll("i")].map((x) => x.textContent);
        expect(t).toEqual(["1 neuron", "3 neurons", "You have 12,345 unread messages"]);
        expect(formatear("{0, plural, =0 {none} one {# book} other {# books}}", ["0"], "en")).toBe("none");
        expect(formatear("{0, plural, one {# libro} few {# libros} other {# libros}}", ["1"], "pl")).toBe("1 libro");
    });
    it("no toca lo que escriben las personas, ni zonas marcadas", () => {
        const b = raiz();
        b.innerHTML = `<p>Mensaje de Pedro: me gusta Guardar cosas</p><p translate="no">Guardar</p><div data-no-traducir=""><span>Guardar</span></div><code>Guardar</code><textarea>Guardar</textarea>`;
        iniciarCapa(b, document, "en", cat);
        expect(b.querySelector("p")!.textContent).toBe("Mensaje de Pedro: me gusta Guardar cosas");
        expect(b.textContent).not.toContain("Save");
    });
    it("sigue lo que React reescribe en el mismo nodo y lo nuevo que aparece", async () => {
        const b = raiz();
        b.innerHTML = `<p>1 neuronas</p>`;
        iniciarCapa(b, document, "en", cat);
        const nodo = b.querySelector("p")!.firstChild as Text;
        nodo.data = "5 neuronas"; // como hace React al cambiar el valor
        await Promise.resolve();
        expect(b.querySelector("p")!.textContent).toBe("5 neurons");
        b.appendChild(Object.assign(document.createElement("button"), { textContent: "Guardar" }));
        await Promise.resolve();
        expect(b.querySelector("button")!.textContent).toBe("Save");
    });
    it("cambiar de idioma restaura y vuelve a traducir; parar devuelve el español", () => {
        const b = raiz();
        b.innerHTML = `<button>Guardar</button>`;
        const fr = crearCatalogo({ codigo: "fr", revisado: false, entradas: { Guardar: "Enregistrer" } });
        const capa = iniciarCapa(b, document, "en", cat);
        expect(b.textContent).toBe("Save");
        capa.cambiar(fr, "fr");
        expect(b.textContent).toBe("Enregistrer");
        expect(document.documentElement.lang).toBe("fr");
        capa.parar();
        expect(b.textContent).toBe("Guardar");
        expect(document.documentElement.lang).toBe("es");
    });
    it("los idiomas de derecha a izquierda ponen dir=rtl en el documento", () => {
        const b = raiz();
        b.innerHTML = `<button>Guardar</button>`;
        iniciarCapa(b, document, "ar", crearCatalogo({ codigo: "ar", revisado: false, entradas: { Guardar: "حفظ" } }));
        expect(document.documentElement.dir).toBe("rtl");
        expect(b.textContent).toBe("حفظ");
    });
});

describe("sin parpadeo: el guion del <head> corre antes del primer pintado", () => {
    const correr = (guardado: Record<string, string>) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(guardado)) localStorage.setItem(k, v);
        document.documentElement.removeAttribute("data-idioma-pendiente");
        document.documentElement.setAttribute("lang", "es"); document.documentElement.setAttribute("dir", "ltr");
        new Function(guionArranque(["en", "ar"], ["ar"]))();
    };
    it("con idioma elegido y catálogo: fija lang/dir y vela el cuerpo hasta que la capa lo quita", () => {
        correr({ "starseed.idioma.neurona.v1": JSON.stringify({ codigo: "ar" }) });
        expect(document.documentElement.lang).toBe("ar");
        expect(document.documentElement.dir).toBe("rtl");
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(true);
        iniciarCapa(raiz(), document, "ar", crearCatalogo({ codigo: "ar", revisado: false, entradas: {} }));
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(false);
    });
    it("en español, o sin catálogo, no toca nada (ni miente en lang)", () => {
        correr({});
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(false);
        correr({ "starseed.idioma.neurona.v1": JSON.stringify({ codigo: "de" }) });
        expect(document.documentElement.lang).toBe("es");
        expect(document.documentElement.hasAttribute("data-idioma-pendiente")).toBe(false);
    });
    it("a falta de elección en esta neurona usa el valor de la cuenta", () => {
        correr({ "starseed.traduccion.v1": JSON.stringify({ _cuenta: { idioma: "en" } }) });
        expect(document.documentElement.lang).toBe("en");
    });
});
