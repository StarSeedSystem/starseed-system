// @vitest-environment jsdom
import { type TextoRecogido, aplicar, observar, recogerTextos, restaurar } from "../pagina";
import { afterEach, describe, expect, it, vi } from "vitest";

function montar(html: string): HTMLElement {
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    document.body.appendChild(raiz);
    return raiz;
}

const textos = (nodos: TextoRecogido[]): string[] => nodos.map((nodo) => nodo.texto);

afterEach(() => { document.body.innerHTML = ""; });

describe("recogerTextos", () => {
    it("nunca recoge dentro de script, style, noscript, code, pre, textarea, select ni contenteditable", () => {
        const raiz = montar(
            `<script>prohibido()</script><style>.a{content: "prohibido"}</style>` +
            `<noscript>prohibido</noscript><code>prohibido</code><pre> prohibido </pre>` +
            `<textarea>prohibido</textarea><select><option>prohibido</option></select>` +
            `<div contenteditable="true">prohibido</div><p>visible</p>`,
        );
        expect(textos(recogerTextos(raiz))).toEqual(["visible"]);
    });

    it("respeta translate=no, data-no-traducir y hidden, también en sus atributos", () => {
        const raiz = montar(
            `<p translate="no">prohibido</p><p data-no-traducir>prohibido dos</p>` +
            `<p hidden>prohibido tres</p>` +
            `<img alt="prohibido cuatro" data-no-traducir/>` +
            `<img hidden alt="prohibido cinco"/>` +
            `<img alt="imagen nueva" title="subida"/>`,
        );
        expect(textos(recogerTextos(raiz))).toEqual(["imagen nueva", "subida"]);
    });
});

describe("aplicar y restaurar", () => {
    it("traduce solo lo que tiene traducción, marca el padre e ida y vuelta exacta", () => {
        const raiz = montar(`<p>Hola</p><p>sin clave</p><img alt="imagen de la cumbre" title="señaliza"/>`);
        expect(aplicar(recogerTextos(raiz), { Hola: "Salut", señaliza: "seal" }, "ca")).toBe(2);
        const traducido = raiz.querySelectorAll("p")[0];
        const imagen = raiz.querySelector("img") as HTMLImageElement;

        expect(traducido.textContent).toBe("Salut");
        expect(traducido.getAttribute("lang")).toBe("ca");
        expect(traducido.getAttribute("data-traducido")).toBe("true");
        expect(imagen.getAttribute("title")).toBe("seal");

        restaurar(raiz);
        expect(traducido.textContent).toBe("Hola");
        expect(traducido.hasAttribute("lang")).toBe(false);
        expect(traducido.hasAttribute("data-traducido")).toBe(false);
        expect(imagen.getAttribute("alt")).toBe("imagen de la cumbre");
        expect(imagen.getAttribute("title")).toBe("señaliza");
    });
});

describe("observar", () => {
    it("avisa de los textos nuevos y no vuelve a traducir lo ya traducido", async () => {
        const raiz = montar("<p>viejo</p>");
        aplicar(recogerTextos(raiz), { viejo: "traducido" }, "es");
        const avisos = vi.fn((nodos: TextoRecogido[]) => aplicar(nodos, { nuevo: "entre nuevo" }, "es"));
        const detener = observar(raiz, avisos);

        raiz.insertAdjacentHTML("beforeend", "<p>nuevo</p>");
        await expect.poll(() => avisos.mock.calls.length).toBeGreaterThan(0);
        expect(avisos.mock.calls[0][0].map((nodo: TextoRecogido) => nodo.texto)).toEqual(["nuevo"]);
        await new Promise((hecho) => setTimeout(hecho, 30));
        expect(avisos.mock.calls.length).toBe(1);
        expect(raiz.querySelectorAll("p")[1].textContent).toBe("entre nuevo");

        detener();
        raiz.insertAdjacentHTML("beforeend", "<p>otro</p>");
        await new Promise((hecho) => setTimeout(hecho, 30));
        expect(avisos.mock.calls.length).toBe(1);
        expect(raiz.querySelectorAll("p")[2].textContent).toBe("otro");
    });

    it("recoge title, alt, aria-label y placeholder, no solo en imágenes", () => {
        const raiz = montar("<img alt='Logo' title='Imagen'><input placeholder='Busca…' aria-label='Campo'>");
        const recogidos = recogerTextos(raiz)
            .filter((item) => item.clase === "atributo")
            .map((item) => `${item.atributo}=${item.texto}`)
            .sort();
        expect(recogidos).toEqual(["alt=Logo", "aria-label=Campo", "placeholder=Busca…", "title=Imagen"]);
    });

    it("no recoge atributos vacíos ni en blanco", () => {
        const html = "<img alt='' title='  '><p aria-label='  '>Texto</p>";
        const textos = recogerTextos(montar(html));
        expect(textos.filter((t) => t.clase === "atributo")).toEqual([]);
        expect(textos.map((t) => t.texto)).toEqual(["Texto"]);
    });
});
