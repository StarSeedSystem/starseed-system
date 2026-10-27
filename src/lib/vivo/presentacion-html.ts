/**
 * Exporta una presentación en vivo a un HTML autónomo: un solo archivo, escenario fijo 1920×1080
 * (o 1440×1080 en 4:3) escalado entero al visor, sin dependencias, sin red y sin ejecutar nada
 * ajeno. Módulo PURO: sin `node:*`, sin DOM y sin red.
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, lienzoEfectivo, temaDe, type Diapositiva, type MetaPresentacion } from "./presentacion";
import { escaparHtml, elementoAHtml, hexValido } from "./presentacion-html-piezas";

const POLITICA = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function nombreArchivoPresentacion(meta: string | Pick<MetaPresentacion, "titulo">): string {
    const titulo = typeof meta === "string" ? meta : meta.titulo;
    const base = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `${base || "presentacion"}.html`;
}

export function presentacionAHtml(
    meta: MetaPresentacion,
    diapositivas: Diapositiva[],
    opciones: { fecha?: string; incluirNotas?: boolean } = {},
): string {
    const base = dimensionesDe(meta.proporcion);
    const alto = 1080;
    const ancho = Math.round(alto * (base.ancho / base.alto));
    const factor = alto / base.alto;
    const fecha = opciones.fecha ?? new Date().toISOString().slice(0, 10);
    const conNotas = opciones.incluirNotas === true;
    const secciones = diapositivas.map((d, i) => {
        const lienzo = lienzoEfectivo(d, meta);
        const elementos = [...lienzo.elementos].sort((a, b) => a.z - b.z).map((el) => elementoAHtml(el, factor)).join("");
        const notas = conNotas && d.notas ? `<aside hidden>${escaparHtml(d.notas)}</aside>` : "";
        return `<section class="slide${i === 0 ? " active" : ""}" style="background:${fondoDe(lienzo.fondo, meta)}">${elementos}${notas}</section>`;
    }).join("");
    const estilo = [
        "*{box-sizing:border-box}",
        "html,body{margin:0;height:100%;background:#0b0d1a;overflow:hidden}",
        "#visor{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}",
        `#escenario{position:relative;width:${ancho}px;height:${alto}px;flex:none;transform-origin:center center}`,
        ".slide{position:absolute;inset:0;overflow:hidden;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .25s ease,visibility .25s ease}",
        ".slide.active{visibility:visible;opacity:1;pointer-events:auto}",
        ".slide aside{position:absolute;left:0;right:0;bottom:0;max-height:40%;overflow:auto;padding:16px;background:rgba(0,0,0,.72);color:#fff;font:16px/1.4 Inter,system-ui,sans-serif;white-space:pre-wrap;z-index:9999}",
        "@media (prefers-reduced-motion: reduce){.slide{transition:none}}",
    ].join("\n");
    const guion = [
        "(function(){",
        `var e=document.getElementById("escenario"),s=[].slice.call(document.querySelectorAll(".slide")),i=0;`,
        `function fit(){var k=Math.min(window.innerWidth/${ancho},window.innerHeight/${alto});e.style.transform="scale("+k+")";}`,
        `function show(n){if(!s.length)return;i=(n+s.length)%s.length;s.forEach(function(x,k){x.classList.toggle("active",k===i);var a=x.querySelector("aside");if(a)a.hidden=true;});try{history.replaceState(null,"","#"+(i+1));}catch(err){}}`,
        `function hash(){var n=parseInt(location.hash.slice(1),10);return isNaN(n)?0:n-1;}`,
        `document.addEventListener("keydown",function(ev){var k=ev.key;if(k==="ArrowRight"||k===" "||k==="PageDown"){ev.preventDefault();show(i+1);}else if(k==="ArrowLeft"||k==="PageUp"){ev.preventDefault();show(i-1);}else if(k==="Home"){ev.preventDefault();show(0);}else if(k==="End"){ev.preventDefault();show(s.length-1);}else if(k==="n"||k==="N"){var a=s[i]&&s[i].querySelector("aside");if(a)a.hidden=!a.hidden;}});`,
        `var t=null;document.addEventListener("touchstart",function(ev){t=ev.touches[0].clientX;},{passive:true});document.addEventListener("touchend",function(ev){if(t===null)return;var d=ev.changedTouches[0].clientX-t;if(Math.abs(d)>40)show(i+(d<0?1:-1));t=null;},{passive:true});`,
        `window.addEventListener("resize",fit);window.addEventListener("hashchange",function(){show(hash());});`,
        "fit();show(hash());",
        "})();",
    ].join("\n");
    return [
        "<!doctype html>",
        `<html lang="es">`,
        "<head>",
        `<meta charset="utf-8">`,
        `<meta name="viewport" content="width=device-width, initial-scale=1">`,
        `<meta http-equiv="Content-Security-Policy" content="${POLITICA}">`,
        `<title>${escaparHtml(meta.titulo || "Presentación")}</title>`,
        `<style>\n${estilo}\n</style>`,
        "</head>",
        "<body>",
        `<!-- Presentación exportada el ${escaparHtml(fecha)}. Archivo estático: sin animaciones de fondo ni de texto, sin peticiones externas. -->`,
        `<div id="visor"><div id="escenario">${secciones}</div></div>`,
        `<script>\n${guion}\n</script>`,
        "</body>",
        "</html>",
    ].join("\n");
}

function fondoDe(fondo: string | undefined, meta: MetaPresentacion): string {
    const hex = hexValido(fondo);
    if (hex) return hex;
    const burbuja = FONDOS_BURBUJA.find((f) => f.id === fondo);
    if (burbuja) return burbuja.css;
    const tema = temaDe(meta).fondo;
    return hexValido(tema) ?? FONDOS_BURBUJA.find((f) => f.id === tema)?.css ?? "#0B0D1A";
}
