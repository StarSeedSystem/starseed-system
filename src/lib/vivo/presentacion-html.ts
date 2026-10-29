/**
 * Exportador de una presentación en vivo a un HTML autónomo (2026-10-29 · Ola 1025R).
 *
 * Núcleo PURO: sin `node:*`, sin DOM y sin red. Sigue las reglas de `frontend-slides`: un solo
 * archivo sin dependencias, escenario fijo (1920×1080 en 16:9 y 1440×1080 en 4:3) escalado
 * entero al visor, visibilidad con `visibility/opacity/pointer-events` y movimiento reducido.
 * El archivo es estático: no reproduce animaciones de fondo ni de texto y no ejecuta nada ajeno.
 */

import { FONDOS_BURBUJA } from "@/lib/mensajeria/formato-tipos";
import { dimensionesDe, lienzoEfectivo, temaDe, type Diapositiva, type MetaPresentacion } from "./presentacion";
import { elementoAHtml, escaparHtml, hexValido } from "./presentacion-html-piezas";

export interface OpcionesExportacionHtml {
    fecha?: string;
    incluirNotas?: boolean;
}

function fondoDe(fondo: string | undefined, meta: MetaPresentacion): string {
    const hex = hexValido(fondo);
    if (hex) return hex;
    const burbuja = FONDOS_BURBUJA.find((b) => b.id === fondo);
    if (burbuja) return burbuja.css;
    const tema = temaDe(meta).fondo;
    return hexValido(tema) ?? FONDOS_BURBUJA.find((b) => b.id === tema)?.css ?? "#0B0D1A";
}

function seccionAHtml(d: Diapositiva, meta: MetaPresentacion, factor: number, activa: boolean): string {
    const lienzo = lienzoEfectivo(d, meta);
    const elementos = [...lienzo.elementos].sort((a, b) => a.z - b.z).map((el) => elementoAHtml(el, factor)).filter(Boolean).join("\n");
    return `<section class="slide${activa ? " active" : ""}" style="background:${fondoDe(lienzo.fondo, meta)}">${elementos}</section>`;
}

function asideNotas(diapositivas: Diapositiva[]): string {
    const items = diapositivas.map((d, i) => `<li><strong>Diapositiva ${i + 1}</strong><br>${escaparHtml(d.notas ?? "Sin notas.")}</li>`).join("\n");
    return `<aside id="notas" hidden><h2>Notas del orador</h2><ol>${items}</ol></aside>`;
}

function hojaEstilo(): string {
    return [
        "*{box-sizing:border-box}",
        "html,body{margin:0;height:100%;overflow:hidden;background:#07070b}",
        "#visor{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}",
        "#stage{position:relative;flex:none;transform-origin:center center;overflow:hidden;background:#000}",
        ".slide{position:absolute;inset:0;visibility:hidden;opacity:0;pointer-events:none;transition:opacity .35s ease;overflow:hidden}",
        ".slide.active{visibility:visible;opacity:1;pointer-events:auto}",
        ".el{position:absolute;box-sizing:border-box}",
        ".el img{width:100%;height:100%;object-fit:contain;display:block}",
        ".caja{display:flex;align-items:center;justify-content:center;padding:12px;border:2px dashed rgba(255,255,255,.45);background:rgba(0,0,0,.35);color:#fff;font:600 20px/1.3 system-ui,sans-serif;text-align:center;overflow:hidden}",
        ".texto{width:100%;height:100%;overflow:hidden}",
        ".texto h1,.texto h2,.texto h3,.texto p,.texto ul,.texto ol,.texto blockquote,.texto pre{margin:0 0 .6em}",
        ".texto blockquote{border-left:4px solid currentColor;padding-left:16px;opacity:.9}",
        ".texto pre{white-space:pre-wrap;font-family:ui-monospace,'JetBrains Mono',monospace}",
        ".tareas{list-style:none;padding-left:0}",
        "#notas{position:fixed;left:24px;right:24px;bottom:24px;max-height:40vh;overflow:auto;margin:0;padding:16px 24px;border-radius:16px;background:rgba(10,12,22,.94);color:#f8fafc;font:16px/1.5 system-ui,sans-serif;z-index:9}",
        "#notas h2{margin:0 0 8px;font-size:18px}",
        "@media (prefers-reduced-motion: reduce){.slide{transition:none}}",
    ].join("\n");
}

function scriptNavegacion(ancho: number, alto: number, notas: boolean): string {
    return [
        "var stage=document.getElementById('stage'),slides=document.querySelectorAll('.slide'),total=slides.length,actual=0;",
        "function ir(n){actual=Math.max(0,Math.min(total-1,n));for(var i=0;i<total;i++){slides[i].classList.toggle('active',i===actual);}if(history.replaceState){history.replaceState(null,'','#'+(actual+1));}}",
        `function ajustar(){stage.style.transform='scale('+Math.min(innerWidth/${ancho},innerHeight/${alto})+')';}`,
        "addEventListener('resize',ajustar);ajustar();",
        "function alternarNotas(){var a=document.getElementById('notas');if(a){a.hidden=!a.hidden;}}",
        "addEventListener('keydown',function(e){var k=e.key;if(k==='ArrowRight'||k===' '||k==='PageDown'){ir(actual+1);e.preventDefault();}else if(k==='ArrowLeft'||k==='PageUp'){ir(actual-1);e.preventDefault();}else if(k==='Home'){ir(0);e.preventDefault();}else if(k==='End'){ir(total-1);e.preventDefault();}" + (notas ? "else if(k==='n'||k==='N'){alternarNotas();}" : "") + "});",
        "var inicio=null;addEventListener('touchstart',function(e){inicio=e.touches[0].clientX;},{passive:true});addEventListener('touchend',function(e){if(inicio===null){return;}var d=e.changedTouches[0].clientX-inicio;if(Math.abs(d)>40){ir(actual+(d<0?1:-1));}inicio=null;},{passive:true});",
        "var m=location.hash.match(/^#(\\d+)$/);if(m){ir(parseInt(m[1],10)-1);}",
    ].join("\n");
}

export function presentacionAHtml(meta: MetaPresentacion, diapositivas: Diapositiva[], opciones?: OpcionesExportacionHtml): string {
    const { ancho: cw, alto: ch } = dimensionesDe(meta.proporcion);
    const ancho = Math.round((1080 * cw) / ch);
    const alto = 1080;
    const factor = alto / ch;
    const fecha = opciones?.fecha ?? new Date().toISOString().slice(0, 10);
    const incluirNotas = opciones?.incluirNotas === true;
    const secciones = diapositivas.map((d, i) => seccionAHtml(d, meta, factor, i === 0)).join("\n");
    return [
        "<!doctype html>",
        '<html lang="es">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escaparHtml(meta.titulo || "Presentación")}</title>`,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`,
        `<!-- Exportado el ${escaparHtml(fecha)}. Archivo estático: sin animaciones de fondo ni de texto y sin peticiones externas. -->`,
        "<style>",
        hojaEstilo(),
        "</style>",
        "</head>",
        "<body>",
        '<div id="visor">',
        `<div id="stage" style="width:${ancho}px;height:${alto}px">`,
        secciones,
        "</div>",
        "</div>",
        incluirNotas ? asideNotas(diapositivas) : "",
        "<script>",
        scriptNavegacion(ancho, alto, incluirNotas),
        "</script>",
        "</body>",
        "</html>",
    ].join("\n");
}

export function nombreArchivoPresentacion(meta: Pick<MetaPresentacion, "titulo"> | string): string {
    const titulo = typeof meta === "string" ? meta : meta.titulo ?? "";
    const base = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `${base || "presentacion"}.html`;
}
