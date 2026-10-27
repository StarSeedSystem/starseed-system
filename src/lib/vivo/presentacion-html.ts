/**
 * Exportador de la presentación en vivo a un HTML autónomo (DSN1025D). Núcleo puro: sin DOM, sin
 * red y sin `node:*`. Reglas de `frontend-slides`: un solo archivo, escenario fijo escalado entero
 * al visor, `prefers-reduced-motion` y contenido ajeno como texto, nunca ejecutado.
 */
import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, estiloBaseDe, lienzoEfectivo, temaDe, type Diapositiva, type MetaPresentacion, type TemaPresentacion } from "./presentacion";
import { FUENTES_HTML, elementoAHtml, escaparHtml, hexValido } from "./presentacion-html-piezas";

const ALTO_ESCENARIO = 1080;
const CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

function escenario(meta: MetaPresentacion): { ancho: number; alto: number; factor: number } {
    const base = dimensionesDe(meta.proporcion);
    const alto = ALTO_ESCENARIO;
    return { ancho: Math.round(alto * (base.ancho / base.alto)), alto, factor: alto / base.alto };
}

/** Fondo: hex válido, preset de `FONDOS_BURBUJA` o el del tema. */
function fondoDe(fondo: string | undefined, tema: TemaPresentacion): string {
    const hex = hexValido(fondo);
    if (hex) return hex;
    const preset = FONDOS_BURBUJA.find((f) => f.id === fondo);
    if (preset) return preset.css;
    return hexValido(tema.fondo) ?? FONDOS_BURBUJA.find((f) => f.id === tema.fondo)?.css ?? "#0A0F1D";
}

function diapositivaAHtml(d: Diapositiva, meta: MetaPresentacion, factor: number, indice: number): string {
    const lienzo = lienzoEfectivo(d, meta);
    const base = estiloBaseDe(meta);
    const estilo = [`background:${fondoDe(lienzo.fondo, temaDe(meta))}`, `color:${hexValido(base.color) ?? "#F8FAFC"}`, `font-family:${FUENTES_HTML[base.fuente ?? "inter"]}`].join(";");
    const elementos = [...lienzo.elementos].sort((a, b) => a.z - b.z).map((el) => elementoAHtml(el, factor)).join("");
    return `<section class="slide${indice === 0 ? " active" : ""}" data-indice="${indice}" style="${estilo}">${elementos}</section>`;
}

function notasAHtml(diapositivas: Diapositiva[]): string {
    const contenido = diapositivas.map((d, i) => `<section data-nota="${i}">${escaparHtml(d.notas ?? "")}</section>`).join("");
    return `<aside id="notas" hidden>${contenido}</aside>`;
}

const CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%;background:#05060a;overflow:hidden}
#escenario{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center;overflow:hidden}
.slide{position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .35s ease}
.slide.active{visibility:visible;opacity:1;pointer-events:auto}
.slide h1,.slide h2,.slide h3,.slide p,.slide ul,.slide ol,.slide blockquote,.slide pre{margin:0 0 .5em}
.slide ul,.slide ol{padding-left:1.4em}
.slide blockquote{border-left:4px solid currentColor;padding-left:1em;opacity:.9}
.slide pre{white-space:pre-wrap;font-family:ui-monospace,'JetBrains Mono',monospace}
.slide img{max-width:100%;max-height:100%}
#notas{position:fixed;left:0;right:0;bottom:0;max-height:30vh;overflow:auto;z-index:9;padding:16px 24px;background:#0b0d1a;color:#f8fafc;font:16px/1.5 Inter,system-ui,sans-serif}
#notas[hidden]{visibility:hidden}
@media (prefers-reduced-motion: reduce){.slide{transition:none}}`;

function script(ancho: number, alto: number): string {
    return `<script>(function(){
var s=[].slice.call(document.querySelectorAll('.slide'));
var i=Math.max(0,Math.min(s.length-1,(parseInt(location.hash.slice(1),10)||1)-1));
function ve(n){i=Math.max(0,Math.min(s.length-1,n));for(var j=0;j<s.length;j++)s[j].classList.toggle('active',j===i);var ns=document.querySelectorAll('[data-nota]');for(var k=0;k<ns.length;k++)ns[k].hidden=k!==i;if(history.replaceState)history.replaceState(null,'','#'+(i+1));}
function escala(){var k=Math.min(innerWidth/${ancho},innerHeight/${alto});document.getElementById('escenario').style.transform='translate(-50%,-50%) scale('+k+')';}
document.addEventListener('keydown',function(e){
if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '||e.key==='PageDown')ve(i+1);
else if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp')ve(i-1);
else if(e.key==='Home')ve(0);
else if(e.key==='End')ve(s.length-1);
else if(e.key==='n'||e.key==='N'){var p=document.getElementById('notas');if(p)p.hidden=!p.hidden;}
});
var x0=0;
document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>60)ve(i+(dx<0?1:-1));});
addEventListener('hashchange',function(){ve((parseInt(location.hash.slice(1),10)||1)-1);});
addEventListener('resize',escala);
ve(i);escala();
})();</script>`;
}

/** HTML autónomo del mazo. Escenario fijo: 1920×1080 en 16:9 y 1440×1080 en 4:3. */
export function presentacionAHtml(meta: MetaPresentacion, diapositivas: Diapositiva[], opciones: { fecha?: string; incluirNotas?: boolean } = {}): string {
    const esc = escenario(meta);
    const lista = Array.isArray(diapositivas) ? diapositivas : [];
    const secciones = lista.map((d, i) => diapositivaAHtml(d, meta, esc.factor, i)).join("");
    const notas = opciones.incluirNotas ? notasAHtml(lista) : "";
    const fecha = escaparHtml(opciones.fecha ?? new Date().toISOString().slice(0, 10));
    const titulo = escaparHtml(meta.titulo || "Presentación");
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${titulo}</title>
<!-- Presentación exportada el ${fecha}. Archivo estático: sin animaciones de fondo ni de texto y sin peticiones externas. -->
<style>${CSS}</style>
</head>
<body>
<div id="escenario" style="width:${esc.ancho}px;height:${esc.alto}px">
${secciones}
</div>
${notas}
${script(esc.ancho, esc.alto)}
</body>
</html>`;
}

/** Nombre de archivo: minúsculas, sin acentos ni símbolos, con «.html»; vacío → «presentacion.html». */
export function nombreArchivoPresentacion(meta: MetaPresentacion): string {
    const base = (meta?.titulo ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${base || "presentacion"}.html`;
}
