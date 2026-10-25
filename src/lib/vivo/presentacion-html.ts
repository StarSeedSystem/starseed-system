/**
 * Exportación de la presentación en vivo a un HTML autónomo (2026-10-25 · DSN1025D).
 *
 * Un solo archivo, sin dependencias ni peticiones externas, con un escenario fijo de 1080 px de
 * alto escalado entero al visor. Núcleo PURO: no toca `node:*`, ni DOM, ni red. Es un archivo
 * ESTÁTICO: no hay animaciones de fondo ni de texto; solo cambia la diapositiva activa.
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, lienzoEfectivo } from "./presentacion";
import type { Diapositiva, MetaPresentacion } from "./presentacion";
import { elementoAHtml, escaparHtml, hexValido } from "./presentacion-html-piezas";

export interface OpcionesPresentacionHtml {
    fecha?: string;
    incluirNotas?: boolean;
}

function fondoCss(fondo: string | undefined): string {
    return hexValido(fondo) ?? FONDOS_BURBUJA.find((f) => f.id === fondo)?.css ?? "#0b0d1a";
}

function diapositivaAHtml(d: Diapositiva, meta: MetaPresentacion, i: number, conNotas: boolean): string {
    const l = lienzoEfectivo(d, meta);
    const factor = 1080 / (l.alto > 0 ? l.alto : 1080);
    const elementos = [...l.elementos].sort((a, b) => a.z - b.z).map((el) => elementoAHtml(el, factor)).filter(Boolean).join("");
    const notas = conNotas && d.notas?.trim() ? `<aside class="notas" hidden>${escaparHtml(d.notas)}</aside>` : "";
    return `<section class="slide${i === 0 ? " active" : ""}" style="background:${escaparHtml(fondoCss(l.fondo))}">${elementos}${notas}</section>`;
}

function hojaEstilo(ancho: number): string {
    return `*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;background:#05060a}
#visor{position:fixed;inset:0}
#escenario{position:absolute;left:50%;top:50%;width:${ancho}px;height:1080px;transform-origin:center center;overflow:hidden}
.slide{position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .25s ease,visibility .25s}
.slide.active{visibility:visible;opacity:1;pointer-events:auto}
.el{position:absolute;overflow:hidden}
.el.texto{line-height:1.35}
.el.texto h1,.el.texto h2,.el.texto h3{line-height:1.1;margin:0 0 .35em}
.el.texto p,.el.texto ul,.el.texto ol,.el.texto blockquote{margin:0 0 .5em}
.el.texto ul,.el.texto ol{padding-left:1.4em}
.el.texto blockquote{border-left:4px solid currentColor;padding-left:1em;opacity:.85}
.el.texto pre{white-space:pre-wrap;font-family:ui-monospace,'JetBrains Mono',monospace}
.el.texto a{color:inherit;text-decoration:underline}
.el.media img{width:100%;height:100%;object-fit:contain}
.el.caja{display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.35);border-radius:8px;color:#fff;font:600 20px Inter,system-ui,sans-serif}
aside.notas{position:fixed;left:12px;bottom:12px;max-width:42ch;background:rgba(0,0,0,.72);color:#f8fafc;padding:12px;border-radius:8px;font:14px Inter,system-ui,sans-serif}
@media (prefers-reduced-motion: reduce){.slide{transition:none}}`;
}

function guion(ancho: number): string {
    return `(function(){
var s=document.getElementById("escenario"),d=[].slice.call(document.querySelectorAll(".slide")),i=0;
function p(){d.forEach(function(x,n){x.className=n===i?"slide active":"slide";});try{history.replaceState(null,"","#"+(i+1));}catch(e){}}
function ir(n){i=Math.max(0,Math.min(d.length-1,n));p();}
function aj(){var k=Math.min(innerWidth/${ancho},innerHeight/1080);s.style.transform="translate(-50%,-50%) scale("+k+")";}
addEventListener("keydown",function(e){var k=e.key;
if(k==="ArrowRight"||k===" "||k==="PageDown"){e.preventDefault();ir(i+1);}
else if(k==="ArrowLeft"||k==="PageUp"){e.preventDefault();ir(i-1);}
else if(k==="Home"){ir(0);}else if(k==="End"){ir(d.length-1);}
else if(k==="n"||k==="N"){var a=document.querySelector(".slide.active aside.notas");if(a)a.hidden=!a.hidden;}});
var x=null;addEventListener("touchstart",function(e){x=e.touches[0].clientX;});
addEventListener("touchend",function(e){if(x===null)return;var dx=e.changedTouches[0].clientX-x;x=null;if(Math.abs(dx)>40)ir(i+(dx<0?1:-1));});
addEventListener("resize",aj);var h=parseInt((location.hash||"").replace("#",""),10);if(h>0)i=Math.min(d.length-1,h-1);
p();aj();})();`;
}

export function presentacionAHtml(meta: MetaPresentacion, diapositivas: Diapositiva[], opciones: OpcionesPresentacionHtml = {}): string {
    const base = dimensionesDe(meta.proporcion);
    const ancho = Math.round(1080 * (base.ancho / base.alto));
    const fecha = opciones.fecha ?? new Date().toISOString().slice(0, 10);
    const secciones = diapositivas.map((d, i) => diapositivaAHtml(d, meta, i, !!opciones.incluirNotas)).join("");
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(meta.titulo ?? "")}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<!-- Presentación estática generada el ${escaparHtml(fecha)}. Sin animaciones de fondo ni de texto. -->
<style>
${hojaEstilo(ancho)}
</style>
</head>
<body>
<div id="visor"><div id="escenario">${secciones}</div></div>
<script>
${guion(ancho)}
</script>
</body>
</html>
`;
}

/** Nombre de archivo del mazo: minúsculas, sin acentos ni símbolos; vacío → «presentacion.html». */
export function nombreArchivoPresentacion(meta: string | { titulo?: string | null } | null | undefined): string {
    const crudo = typeof meta === "string" ? meta : meta?.titulo ?? "";
    const limpio = crudo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
    return limpio ? `${limpio}.html` : "presentacion.html";
}
