/**
 * Protomolécula · Átomo texturas procedurales WebGL (F1D). Integración: iframe-aislado; control: total.
 * Contrato: architecture/protomolecula.md §8.1, §11.1. El documento dibuja un <canvas> WebGL con un
 * fragment shader GLSL escrito por el OS: ruido por valor con fBm de «octavas», cuadros y ondas,
 * rotación y escala, mezcla HSV entre los dos tonos y tiempo para la velocidad. Sin WebGL lo dice.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

export const TEXTURAS: DefinicionAtomo = {
  herramientaId: "texturas-webgl",
  nombre: "Texturas procedurales WebGL",
  categoria: "imagen",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "patron", nombre: "Patrón", tipo: "opcion", opciones: ["ruido", "cuadros", "ondas"], defecto: "ruido", sinonimos: ["patron", "trama"] },
    { id: "escala", nombre: "Escala", tipo: "numero", min: 0.5, max: 50, paso: 0.5, defecto: 8, sinonimos: ["zoom", "detalle"] },
    { id: "octavas", nombre: "Octavas", tipo: "entero", min: 1, max: 8, paso: 1, defecto: 4, sinonimos: ["capas de ruido"] },
    { id: "rotacion", nombre: "Rotación", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 0, sinonimos: ["giro"] },
    { id: "velocidad", nombre: "Velocidad", tipo: "numero", min: 0, max: 5, paso: 0.1, unidad: "x", defecto: 0.5, sinonimos: ["ritmo"] },
    { id: "contraste", nombre: "Contraste", tipo: "numero", min: 0, max: 2, paso: 0.05, defecto: 1, sinonimos: ["crudeza"] },
    { id: "tono-a", nombre: "Tono A", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 220, sinonimos: ["primer tono"] },
    { id: "tono-b", nombre: "Tono B", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 320, sinonimos: ["segundo tono"] },
    { id: "saturacion", nombre: "Saturación", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 70, sinonimos: ["fuerza del color"] },
    { id: "exportar", nombre: "Exportar", tipo: "disparo", defecto: false, sinonimos: ["exportar png", "descargar"] },
  ],
  entradas: [], salidas: ["png"],
  vista: { tipo: "documento", documento: documentoTexturas },
};

/** Las opciones de «patron», tal como las declara la definición (el documento no las repite a mano). */
const opcionesPatron = (): string[] => TEXTURAS.parametros.find((p) => p.id === "patron")?.opciones ?? [];
/** Un valor como literal dentro del <script>: JSON con «<» escapado, para que ningún texto pueda cerrar la etiqueta. */
const enScript = (valor: unknown): string => JSON.stringify(valor).replace(/</g, "\\u003c");
export function documentoTexturas(): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Texturas procedurales WebGL</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#e2e8f0;margin:0}canvas{width:100%;display:block}p{padding:1rem}</style>
</head><body>
<canvas id="c" width="512" height="512"></canvas>
${SCRIPT_IN}
</body></html>`;
}

const SCRIPT_IN = `<script>
(function(){
  var CANAL = "__PM_CANAL__", SIN_WEBGL = "Este navegador no ofrece WebGL: la textura no se puede dibujar.";
  var PARAMETROS = ${enScript(TEXTURAS.parametros)}, PATRONES = ${enScript(opcionesPatron())};
  var prm = { patron: "ruido", escala: 8, octavas: 4, rotacion: 0, velocidad: 0.5, contraste: 1, "tono-a": 220, "tono-b": 320, saturacion: 70 };
  function decir(m){ try{ parent.postMessage(Object.assign({ protomolecula:1, canal:CANAL }, m), "*"); }catch(e){} }
  function acotar(v, lo, hi, antes){ return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : antes; }
  var VERTEX = "attribute vec2 q; void main(){ gl_Position = vec4(q, 0.0, 1.0); }";
  var FRAG = [
    "precision highp float; uniform vec2 U; uniform float T,E,O,R,C,A,B,S; uniform int P;",
    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float ruido(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }",
    "vec3 hsv2rgb(vec3 c){ vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0)) - 3.0, 0.0, 1.0); return c.z * mix(vec3(1.0), k, c.y); }",
    "void main(){ vec2 u = (gl_FragCoord.xy - 0.5 * U) / min(U.x, U.y); float g = length(u) * E; float an = atan(u.y, u.x) + radians(R); vec2 p = vec2(cos(an), sin(an)) * g + vec2(T * 0.7, T * 0.41); float v;",
    "  if(P == 0){ v = 0.0; float am = 0.5, tot = 0.0; for(int i = 0; i < 8; i++){ if(float(i) >= O) break; v += am * ruido(p); tot += am; p = p * 2.0 + vec2(7.31, 4.17); am *= 0.5; } v = tot > 0.0 ? v / tot : 0.5; }", /* ruido: fBm de «octavas» */
    "  else if(P == 1){ vec2 q = floor(p * 0.5); v = abs(mod(q.x + q.y, 2.0)); } else { v = 0.5 + 0.5 * sin(g * 6.28318); }", /* cuadros / ondas */
    "  vec3 col = hsv2rgb(vec3(fract(mix(A / 360.0, B / 360.0, v)), S / 100.0, 0.35 + 0.65 * v)); gl_FragColor = vec4(clamp((col - 0.5) * C + 0.5, 0.0, 1.0), 1.0); }"
  ].join("\\n");
  var lienzo = document.getElementById("c"), gl = null, u = null, tPrev = 0, tAcum = 0;
  function crear(){
    try{ gl = lienzo.getContext("webgl", { preserveDrawingBuffer: true }); }catch(e){ gl = null; } if(!gl) throw new Error(SIN_WEBGL);
    function sombra(tipo, codigo){ var s = gl.createShader(tipo); gl.shaderSource(s, codigo); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
  var fs = sombra(gl.FRAGMENT_SHADER, FRAG), vs = sombra(gl.VERTEX_SHADER, VERTEX), pr = gl.createProgram(); if(!fs || !vs){ throw new Error(SIN_WEBGL); }
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); if(!gl.getProgramParameter(pr, gl.LINK_STATUS)){ throw new Error(SIN_WEBGL); }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, "q"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  u = {}; var ids = ["U", "T", "E", "O", "R", "C", "A", "B", "S", "P"]; for(var i = 0; i < ids.length; i++) u[ids[i]] = gl.getUniformLocation(pr, ids[i]);
}
  function pintar(){
    if(!gl || !u) return;
    gl.viewport(0, 0, lienzo.width, lienzo.height); gl.uniform2f(u.U, lienzo.width, lienzo.height);
    gl.uniform1f(u.T, tAcum); gl.uniform1f(u.E, prm.escala); gl.uniform1f(u.O, prm.octavas); gl.uniform1f(u.R, prm.rotacion); gl.uniform1f(u.C, prm.contraste);
    gl.uniform1f(u.A, prm["tono-a"]); gl.uniform1f(u.B, prm["tono-b"]); gl.uniform1f(u.S, prm.saturacion); gl.uniform1i(u.P, Math.max(0, PATRONES.indexOf(prm.patron)));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function paso(t){
    if(tPrev === 0) tPrev = t;
    tAcum = tAcum + (t - tPrev) * 0.001 * prm.velocidad; tPrev = t; /* velocidad ya multiplicada: el shader solo ve el tiempo */
    pintar(); if(typeof requestAnimationFrame === "function") requestAnimationFrame(paso);
  }
  var RANGOS = { escala: [0.5, 50], octavas: [1, 8], rotacion: [0, 360], velocidad: [0, 5], contraste: [0, 2], "tono-a": [0, 360], "tono-b": [0, 360], saturacion: [0, 100] };
  function establecer(p){
    var r = RANGOS[p.id];
    if(r) prm[p.id] = p.id === "octavas" ? Math.round(acotar(p.valor, r[0], r[1], prm[p.id])) : acotar(p.valor, r[0], r[1], prm[p.id]);
    else if(p.id === "patron" && PATRONES.indexOf(p.valor) >= 0) prm.patron = p.valor;
  }
  function exportar(){ /* manda el lienzo actual como PNG; si se pasa de 2 MB, baja la resolución a la mitad hasta caber */
    if(!gl || !u){ decir({ tipo: "error", mensaje: SIN_WEBGL }); return; } /* dibujado no: no manda un PNG vacío fingiendo exportar */
    pintar();
    var datos = lienzo.toDataURL("image/png"), ancho = lienzo.width, alto = lienzo.height, copia = null;
    while(datos.length > 2000000 && ancho > 64){
      ancho = Math.floor(ancho / 2); alto = Math.floor(alto / 2);
      copia = copia || document.createElement("canvas"); copia.width = ancho; copia.height = alto;
      copia.getContext("2d").drawImage(lienzo, 0, 0, ancho, alto); datos = copia.toDataURL("image/png");
    }
    decir({ tipo: "exportar", formato: "png", datos: datos });
  }
  window.addEventListener("message", function(e){
    if(e.source !== parent) return; try{
      var msg = e.data; if(!msg || msg.protomolecula !== 1 || msg.canal !== CANAL) return;
      if(msg.tipo === "establecer") establecer({ id: msg.parametroId, valor: msg.valor });
      else if(msg.tipo === "disparar"){ if(msg.parametroId === "exportar") exportar(); }
      else if(msg.tipo === "estado" && msg.valores){ for(var k in msg.valores) establecer({ id: k, valor: msg.valores[k] }); }
    }catch(err){}
  }, false);
  decir({ tipo: "hola", nombre: "Texturas procedurales WebGL", parametros: PARAMETROS }); try{
    crear(); decir({ tipo: "listo" });
    if(typeof requestAnimationFrame === "function") requestAnimationFrame(paso); else pintar();
  }catch(err){
    var aviso = document.createElement("p"); aviso.textContent = SIN_WEBGL; document.body.appendChild(aviso); decir({ tipo: "error", mensaje: SIN_WEBGL });
  }
})();
</script>`;
