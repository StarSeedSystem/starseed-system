/**
 * Presentación en vivo → HTML autónomo (Ola 1025R · DSN1025D).
 *
 * Escenario fijo de 1080 px de alto (1920×1080 en 16:9, 1440×1080 en 4:3) escalado ENTERO al
 * visor; el contenido nunca se recoloca. Un solo archivo, una hoja de estilo y un script en
 * línea, sin peticiones externas. Es estático: no se animan fondos ni textos (solo el cambio de
 * diapositiva, que se apaga con `prefers-reduced-motion`).
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, lienzoEfectivo, temaDe, type Diapositiva, type MetaPresentacion } from "./presentacion";
import { elementoAHtml, escaparHtml, hexValido } from "./presentacion-html-piezas";

export interface OpcionesHtmlPresentacion {
    fecha?: string;
    incluirNotas?: boolean;
}

/** Fondo del lienzo: hex válido, css de FONDOS_BURBUJA por id, o el del tema. */
function cssFondo(fondo: string | undefined, meta: MetaPresentacion): string {
    const hex = hexValido(fondo);
    if (hex) return hex;
    const preset = FONDOS_BURBUJA.find((p) => p.id === fondo);
    if (preset) return preset.css;
    const tema = temaDe(meta).fondo;
    const hexTema = hexValido(tema);
    if (hexTema) return hexTema;
    return FONDOS_BURBUJA.find((p) => p.id === tema)?.css ?? "#0b0d1a";
}

/** Nombre de archivo: minúsculas, sin acentos ni símbolos, con `.html`. */
export function nombreArchivoPresentacion(meta: string | Pick<MetaPresentacion, "titulo">): string {
    const titulo = typeof meta === "string" ? meta : meta.titulo;
    const limpio = String(titulo ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");
    return limpio ? `${limpio}.html` : "presentacion.html";
}

const CSS = `*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#000;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;color:#fff}
.stage{position:relative;transform-origin:center center}
.slide{position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .3s ease;overflow:hidden}
.slide.active{visibility:visible;opacity:1;pointer-events:auto}
.doc h1,.doc h2,.doc h3{margin:0 0 .5em;line-height:1.15}
.doc p{margin:0 0 .6em;line-height:1.4}
.doc ul,.doc ol{margin:0 0 .6em;padding-left:1.2em}
.doc blockquote{margin:0 0 .6em;padding-left:.8em;border-left:4px solid currentColor;opacity:.9}
.doc pre{margin:0 0 .6em;white-space:pre-wrap;font-family:ui-monospace,'JetBrains Mono',monospace}
.doc hr{border:0;border-top:2px solid currentColor;opacity:.35}
.aside-notas{position:absolute;left:16px;bottom:16px;right:16px;background:rgba(0,0,0,.82);color:#fff;padding:16px;font-size:22px;border-radius:8px}
@media (prefers-reduced-motion: reduce){.slide{transition:none}}`;

const SCRIPT = `(function(){
 var e=document.getElementById('escenario'),d=Array.prototype.slice.call(document.querySelectorAll('.slide'));
 var w=+e.getAttribute('data-ancho'),h=+e.getAttribute('data-alto'),a=0;
 function fit(){e.style.transform='scale('+Math.min(innerWidth/w,innerHeight/h)+')';}
 function go(i){a=Math.max(0,Math.min(d.length-1,i));d.forEach(function(s,j){s.classList.toggle('active',j===a);});if(history.replaceState)history.replaceState(null,'','#'+(a+1));}
 function notas(){var n=d[a].querySelector('.aside-notas');if(n)n.hidden=!n.hidden;}
 document.addEventListener('keydown',function(ev){var k=ev.key;
  if(k==='ArrowRight'||k===' '||k==='PageDown'){ev.preventDefault();go(a+1);}
  else if(k==='ArrowLeft'||k==='PageUp'){ev.preventDefault();go(a-1);}
  else if(k==='Home'){ev.preventDefault();go(0);}
  else if(k==='End'){ev.preventDefault();go(d.length-1);}
  else if(k==='n'||k==='N')notas();
 });
 var x=null;
 document.addEventListener('touchstart',function(ev){x=ev.touches[0].clientX;},{passive:true});
 document.addEventListener('touchend',function(ev){if(x===null)return;var dx=ev.changedTouches[0].clientX-x;if(Math.abs(dx)>50)go(a+(dx<0?1:-1));x=null;},{passive:true});
 addEventListener('resize',fit);fit();
 var m=/^#(\\d+)$/.exec(location.hash);go(m?+m[1]-1:0);
})();`;

/** Documento HTML completo con todas las diapositivas del mazo. */
export function presentacionAHtml(
    meta: MetaPresentacion,
    diapositivas: Diapositiva[],
    opciones: OpcionesHtmlPresentacion = {},
): string {
    const dims = dimensionesDe(meta.proporcion);
    const alto = 1080;
    const ancho = Math.round(alto * (dims.ancho / dims.alto));
    const fecha = opciones.fecha ?? new Date().toISOString().slice(0, 10);
    const conNotas = opciones.incluirNotas === true;
    const secciones = diapositivas.map((d, i) => {
        const lienzo = lienzoEfectivo(d, meta);
        const factor = alto / (lienzo.alto > 0 ? lienzo.alto : alto);
        const elementos = [...lienzo.elementos].sort((a, b) => a.z - b.z).map((el) => elementoAHtml(el, factor)).join("");
        const notas = conNotas && d.notas?.trim() ? `<aside class="aside-notas" hidden>${escaparHtml(d.notas)}</aside>` : "";
        return `<section class="slide${i === 0 ? " active" : ""}" style="background:${cssFondo(lienzo.fondo, meta)};width:${ancho}px;height:${alto}px">${elementos}${notas}</section>`;
    }).join("\n");
    const titulo = escaparHtml(meta.titulo?.trim() || "Presentación");
    const csp = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<meta http-equiv="Content-Security-Policy" content="${csp}">
<!-- Fecha: ${escaparHtml(fecha)}. Archivo estático: sin fondos ni textos animados y sin peticiones externas. -->
<style>${CSS}</style>
</head>
<body>
<div class="stage" id="escenario" data-ancho="${ancho}" data-alto="${alto}" style="width:${ancho}px;height:${alto}px">
${secciones}
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
