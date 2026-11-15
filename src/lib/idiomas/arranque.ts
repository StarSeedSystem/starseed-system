/**
 * IDI1115N · Guion mínimo del <head> que fija `lang` y `dir` ANTES del primer pintado, y oculta
 * el cuerpo hasta que la capa tenga el catálogo (con un tope de 2,5 s para no dejarlo nunca en
 * blanco). Es texto plano que el layout raíz incrusta; se prueba ejecutándolo en jsdom.
 * Solo actúa si hay catálogo de ese idioma (si no, el texto sigue en español y `lang`/`dir` no mienten). Lee solo la clave de esta neurona y, a falta de ella, el valor de la cuenta ya bajado.
 */
import { CLAVE_IDIOMA_NEURONA, PERFIL_CUENTA } from "./estado";
import { CLAVE_TRADUCCION } from "@/lib/traduccion/preferencias";

export const CSS_PENDIENTE = "html[data-idioma-pendiente] body{opacity:0}html{--idioma-t:.12s}body{transition:opacity var(--idioma-t)}";

export function guionArranque(conCatalogo: readonly string[], rtl: readonly string[]): string {
    return `(function(){try{var d=document.documentElement,s=localStorage,c=null;
try{var a=JSON.parse(s.getItem(${JSON.stringify(CLAVE_IDIOMA_NEURONA)})||"null");c=a&&a.codigo||null}catch(e){}
if(!c){try{var m=JSON.parse(s.getItem(${JSON.stringify(CLAVE_TRADUCCION)})||"null");c=m&&m[${JSON.stringify(PERFIL_CUENTA)}]&&m[${JSON.stringify(PERFIL_CUENTA)}].idioma||null}catch(e){}}
if(!c||c==="es")return;
if(${JSON.stringify(conCatalogo)}.indexOf(c)<0)return;
d.setAttribute("lang",c);
d.setAttribute("dir",${JSON.stringify(rtl)}.indexOf(c)>=0?"rtl":"ltr");
d.setAttribute("data-idioma-pendiente","");setTimeout(function(){d.removeAttribute("data-idioma-pendiente")},2500);
}catch(e){}})();`;
}
