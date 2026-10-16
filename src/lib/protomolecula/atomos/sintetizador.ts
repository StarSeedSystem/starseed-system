/**
 * Protomolécula · Átomo sintetizador Web Audio (F1C).
 * Integración: iframe-aislado; control: total.
 * Contrato: architecture/protomolecula.md §11.1
 */
import type { DefinicionAtomo, Parametro, VistaProps } from "@/lib/protomolecula/registro-atomos";

export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "onda", nombre: "Onda", tipo: "opcion", opciones: ["seno", "cuadrada", "sierra", "triangulo"], defecto: "seno", sinonimos: ["tipo de onda", "forma"] },
    { id: "frecuencia", nombre: "Frecuencia", tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 440, sinonimos: ["pitch", "tono"] },
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, paso: 0.5, unidad: "dB", defecto: -12, sinonimos: ["ganancia", "nivel"] },
    { id: "filtro", nombre: "Filtro", tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"], defecto: "paso bajo", sinonimos: ["tipo de filtro"] },
    { id: "corte", nombre: "Corte", tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 4000, sinonimos: ["frecuencia de corte"] },
    { id: "resonancia", nombre: "Resonancia", tipo: "numero", min: 0, max: 20, paso: 0.1, defecto: 1, sinonimos: ["Q", "res"] },
    { id: "ataque", nombre: "Ataque", tipo: "numero", min: 0, max: 2, paso: 0.01, unidad: "s", defecto: 0.01, sinonimos: ["attack"] },
    { id: "liberacion", nombre: "Liberación", tipo: "numero", min: 0, max: 5, paso: 0.01, unidad: "s", defecto: 0.5, sinonimos: ["release"] },
    { id: "eco", nombre: "Eco", tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 0, sinonimos: ["reverberacion", "delay"] },
    { id: "sonando", nombre: "Sonando", tipo: "booleano", defecto: false, sinonimos: ["sonar", "activo"] },
    { id: "nota", nombre: "Nota", tipo: "disparo", defecto: false, sinonimos: ["tocar nota", "disparar"] },
  ],
  entradas: [],
  salidas: ["wav"],
  ficha: {
    web: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
    licencia: "API del navegador",
  },
  vista: { tipo: "documento", documento: documentoSintetizador },
};

export function documentoSintetizador(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Sintetizador Web Audio</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#e2e8f0;padding:1.5rem;line-height:1.5}button{cursor:pointer;padding:.6rem 1rem;border-radius:.5rem;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font:inherit}</style>
</head>
<body>
<h1>Sintetizador Web Audio</h1>
<p>Cadena: oscilador → filtro → retardo (eco) → ganancia → destino.</p>
<button id="btn">Activar sonido</button>
<script>
(function(){
  const CANAL = "__PM_CANAL__";
  let ctx = null, osc = null, filt = null, ret = null, gan = null, ecoVal = 0;
  let param = { onda:"seno", frecuencia:440, volumen:-12, filtro:"paso bajo", corte:4000, resonancia:1, ataque:0.01, liberacion:0.5, eco:0, sonando:false };
  function dBtoGain(v){ return Math.max(0, Math.pow(10, v/20)); }
  function tipoOnda(t){ switch(t){ case "cuadrada":return "square"; case "sierra":return "sawtooth"; case "triangulo":return "triangle"; default:return "sine"; } }
  function tipoFiltro(t){ switch(t){ case "paso alto":return "highpass"; case "banda":return "bandpass"; default:return "lowpass"; } }
  function crearCadena(){
    if(ctx){ try{ ctx.close(); }catch(e){} }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    osc = ctx.createOscillator();
    filt = ctx.createBiquadFilter();
    ret = ctx.createDelay(3);
    gan = ctx.createGain();
    osc.type = tipoOnda(param.onda);
    osc.frequency.setValueAtTime(param.frecuencia, ctx.currentTime);
    osc.connect(filt);
    filt.type = tipoFiltro(param.filtro);
    filt.frequency.setValueAtTime(param.corte, ctx.currentTime);
    filt.Q.setValueAtTime(param.resonancia, ctx.currentTime);
    filt.connect(ret);
    ret.connect(gan);
    ret.connect(ret); // realimentación eco
    gan.connect(ctx.destination);
    gan.gain.setValueAtTime(dBtoGain(param.volumen), ctx.currentTime);
    ret.delayTime.setValueAtTime(0.15 + (param.eco/100)*0.3, ctx.currentTime);
  }
  function establecer(p){
    const val = p.valor !== undefined ? p.valor : (p.cantidad !== undefined ? p.cantidad : undefined);
    switch(p.id){
      case "onda": param.onda = String(val || param.onda); if(osc) osc.type = tipoOnda(param.onda); break;
      case "frecuencia": param.frecuencia = Math.max(20, Math.min(20000, Number(val))); if(osc) osc.frequency.setValueAtTime(param.frecuencia, ctx ? ctx.currentTime : 0); break;
      case "volumen": param.volumen = Math.max(-60, Math.min(6, Number(val))); if(gan) gan.gain.setValueAtTime(dBtoGain(param.volumen), ctx ? ctx.currentTime : 0); break;
      case "filtro": param.filtro = String(val || param.filtro); if(filt) filt.type = tipoFiltro(param.filtro); break;
      case "corte": param.corte = Math.max(20, Math.min(20000, Number(val))); if(filt) filt.frequency.setValueAtTime(param.corte, ctx ? ctx.currentTime : 0); break;
      case "resonancia": param.resonancia = Math.max(0, Math.min(20, Number(val))); if(filt) filt.Q.setValueAtTime(param.resonancia, ctx ? ctx.currentTime : 0); break;
      case "ataque": param.ataque = Math.max(0, Math.min(2, Number(val))); break;
      case "liberacion": param.liberacion = Math.max(0, Math.min(5, Number(val))); break;
      case "eco": param.eco = Math.max(0, Math.min(100, Number(val))); if(ret) ret.delayTime.setValueAtTime(0.15 + (param.eco/100)*0.3, ctx ? ctx.currentTime : 0); break;
      case "sonando": param.sonando = !!val; actualizarSonido(); break;
    }
  }
  function disparar(p){
    if(p.id === "nota"){
      if(!param.sonando){ param.sonando = true; actualizarSonido(); }
      if(osc && ctx){ const t = ctx.currentTime; osc.frequency.setValueAtTime(param.frecuencia, t); gan.gain.setValueAtTime(dBtoGain(param.volumen), t); gan.gain.exponentialRampToValueAtTime(0.001, t + param.liberacion); }
    }
  }
  function actualizarSonido(){
    if(!osc || !ctx) return;
    if(param.sonando){ if(osc && gan){ const t = ctx.currentTime; gan.gain.setValueAtTime(dBtoGain(param.volumen), t); gan.gain.exponentialRampToValueAtTime(0.001, t + param.liberacion); } try{ osc.start(); }catch(e){ osc.start(0); } }
    else{ try{ osc.stop(); }catch(e){} osc = ctx.createOscillator(); osc.type = tipoOnda(param.onda); osc.frequency.setValueAtTime(param.frecuencia, ctx.currentTime); osc.connect(filt); }
  }
  window.addEventListener("message", function(e){
    if(e.source !== parent) return;
    try{
      const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if(msg.protomolecula !== 1 || msg.canal !== CANAL) return;
      if(msg.tipo === "hola"){
        parent.postMessage({ tipo:"hola", parametros:Object.keys(param), canal:CANAL, protomolecula:1 }, "*"); return;
      }
      if(msg.tipo === "establecer" && msg.parametro){ establecer({ id: msg.parametro.id, valor: msg.parametro.valor, cantidad: msg.parametro.cantidad }); }
      if(msg.tipo === "disparar" && msg.parametro){ disparar({ id: msg.parametro.id }); }
    }catch(err){}
  }, false);
  document.getElementById("btn").addEventListener("click", function(){ crearCadena(); parent.postMessage({ tipo:"hola", parametros:Object.keys(param), canal:CANAL, protomolecula:1 }, "*"); });
})();
</script>
</body>
</html>`;
}
