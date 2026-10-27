// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { aplicar, observar, recogerTextos, restaurar, type TextoPagina } from "../pagina";

function cuerpo(html: string): HTMLDivElement {
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    return raiz;
}

/** Cada exclusión del contrato: en `<p>Visible …</p>` solo «Visible» debe salir. */
const EXCLUIDOS: readonly [etiqueta: string, trozo: string][] = [
    ["script", "<script>texto de script</script>"],
    ["style", "<style>.a{color:red}</style>"],
    ["noscript", "<noscript>sin soporte</noscript>"],
    ["code", "<code>x = 1</code>"],
    ["pre", "<pre>sangrado</pre>"],
    ["textarea", "<textarea>borrador</textarea>"],
    ["input", "<input value='entrada'>"],
    ["select", "<select><option>opción</option></select>"],
    ["contenteditable", "<div contenteditable='true'>editable</div>"],
    ["translate=no", "<div translate='no'>registrado</div>"],
    ["data-no-traducir", "<div data-no-traducir=''>propio</div>"],
    ["hidden", "<div hidden>oculto</div>"],
];

describe("página entera de traducción", () => {
    it("salta cada exclusión y recoge solo «Visible»", () => {
        for (const [etiqueta, trozo] of EXCLUIDOS) {
            const textos = recogerTextos(cuerpo(`<p>Visible ${trozo}</p>`));
            expect(textos.map((t) => t.original.trim()).join(" | "), etiqueta).toBe("Visible");
        }
    });

    it("recoge los atributos title, alt, aria-label y placeholder", () => {
        const html = "<img alt='Logo' title='Imagen'><input placeholder='Busca…' aria-label='Campo'>";
        const recogidos = recogerTextos(cuerpo(html)).map((t) => `${t.atributo}=${t.original}`);
        expect(recogidos).toEqual(["title=Imagen", "alt=Logo", "aria-label=Campo", "placeholder=Busca…"]);
    });

    it("no recoge atributos vacíos ni en blanco", () => {
        const html = "<img alt='' title='  '><p aria-label='  '>Texto</p>";
        const textos = recogerTextos(cuerpo(html));
        expect(textos.filter((t) => t.atributo !== null)).toEqual([]);
        expect(textos.map((t) => t.original)).toEqual(["Texto"]);
    });

    it("aplica, marca el padre y devuelve el original exacto", () => {
        const raiz = cuerpo("<p>  Hola  </p><p lang='pt'>Dos</p>");
        const mapa = new Map([["Hola", "Hello"], ["Dos", "Two"]]);
        expect(aplicar(recogerTextos(raiz), mapa, "en")).toBe(2);
        const parrafo = raiz.querySelectorAll("p")[0] as HTMLParagraphElement;
        expect(parrafo.textContent).toBe("Hello");
        expect(parrafo.getAttribute("lang")).toBe("en");
        expect(parrafo.hasAttribute("data-traducido")).toBe(true);
        restaurar(raiz);
        expect(parrafo.textContent).toBe("  Hola  ");
        expect(parrafo.getAttribute("lang")).toBeNull();
        expect(parrafo.hasAttribute("data-traducido")).toBe(false);
        const segundo = raiz.querySelectorAll("p")[1] as HTMLParagraphElement;
        expect(segundo.textContent).toBe("Dos");
        expect(segundo.getAttribute("lang")).toBe("pt");
    });

    it("también aplica y restaura los atributos", () => {
        const raiz = cuerpo("<img alt='Logo'>");
        expect(aplicar(recogerTextos(raiz), new Map([["Logo", "Emblem"]]), "en")).toBe(1);
        const imagen = raiz.querySelector("img") as HTMLImageElement;
        expect(imagen.getAttribute("alt")).toBe("Emblem");
        expect(imagen.getAttribute("lang")).toBe("en");
        restaurar(raiz);
        expect(imagen.getAttribute("alt")).toBe("Logo");
        expect(imagen.getAttribute("lang")).toBeNull();
        expect(imagen.hasAttribute("data-traducido")).toBe(false);
    });

    it("no vuelve a traducir lo ya traducido", () => {
        const raiz = cuerpo("<p>Hola</p><img alt='Logo'>");
        const mapa = new Map([["Hola", "Hello"], ["Logo", "Emblem"]]);
        expect(aplicar(recogerTextos(raiz), mapa, "en")).toBe(2);
        expect(aplicar(recogerTextos(raiz), mapa, "en")).toBe(0);
    });

    it("observa los textos nuevos, salta lo ya traducido y para al pedirlo", async () => {
        const raiz = cuerpo("<p>Primero</p>");
        aplicar(recogerTextos(raiz), new Map([["Primero", "First"]]), "en");
        const recibidos: TextoPagina[][] = [];
        const parar = observar(raiz, (nuevos) => recibidos.push(nuevos));
        const extra = document.createElement("p");
        extra.textContent = " Segundo ";
        raiz.append(extra);
        await new Promise<void>((listo) => setTimeout(listo, 20));
        expect(recibidos.length).toBe(1);
        expect(recibidos[0].map((t) => t.original)).toEqual([" Segundo "]);
        parar();
        const tercero = document.createElement("p");
        tercero.textContent = "Tercero";
        raiz.append(tercero);
        await new Promise<void>((listo) => setTimeout(listo, 20));
        expect(recibidos.length).toBe(1);
    });
});

