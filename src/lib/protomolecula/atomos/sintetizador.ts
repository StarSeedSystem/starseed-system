/**
 * Protomolécula · ÁTOMO PROPIO: sintetizador Web Audio (iframe aislado, control total).
 * `documentoSintetizador()` devuelve el HTML completo y autocontenido que escribe el OS:
 * CSP, marcador `__PM_CANAL__`, listener saneado y la cadena oscilador → filtro → eco → ganancia.
 * Contrato: architecture/protomolecula.md §8.1 y §11.1.
 */
import type { Parametro } from "../tipos";
import type { DefinicionAtomo } from "../registro-atomos";

export const PARAMETROS_SINTETIZADOR: Parametro[] = [
  { id: "onda", nombre: "Onda", sinonimos: ["forma de onda", "oscilador"], tipo: "opcion", opciones: ["seno", "cuadrada", "sierra", "triángulo"], defecto: "seno" },
  { id: "frecuencia", nombre: "Frecuencia", sinonimos: ["tono", "altura"], tipo: "numero", min: 20, max: 20000, unidad: "Hz", defecto: 440 },
  { id: "volumen", nombre: "Volumen", sinonimos: ["ganancia", "nivel"], tipo: "numero", min: -60, max: 6, unidad: "dB", defecto: -12 },
  { id: "filtro", nombre: "Filtro", sinonimos: ["tipo de filtro"], tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"], defecto: "paso bajo" },
  { id: "corte", nombre: "Corte del filtro", sinonimos: ["corte", "frecuencia de corte"], tipo: "numero", min: 20, max: 20000, unidad: "Hz", defecto: 4000 },
  { id: "resonancia", nombre: "Resonancia", sinonimos: ["q"], tipo: "numero", min: 0, max: 20, unidad: "x", defecto: 1 },
  { id: "ataque", nombre: "Ataque", tipo: "numero", min: 0, max: 2, unidad: "s", defecto: 0.01 },
  { id: "liberacion", nombre: "Liberación", sinonimos: ["relajacion", "cola"], tipo: "numero", min: 0, max: 5, unidad: "s", defecto: 0.2 },
  { id: "eco", nombre: "Eco", sinonimos: ["retardo", "repeticion"], tipo: "numero", min: 0, max: 100, unidad: "%", defecto: 0 },
  { id: "sonando", nombre: "Sonando", sinonimos: ["encendido"], tipo: "booleano", defecto: false },
  { id: "nota", nombre: "Nota", sinonimos: ["tocar", "pulsa nota"], tipo: "disparo" },
];

export function documentoSintetizador(): string {
  const params = JSON.stringify(PARAMETROS_SINTETIZADOR);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Sintetizador</title>
<style>body{font:14px system-ui;background:#0b0e14;color:#e8eef7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}div{text-align:center}button{cursor:pointer;padding:10px 18px;border-radius:10px;border:0;background:#34d399;color:#04121f;font-weight:700}#estado{margin-top:12px;font-size:12px;opacity:.75}</style>
</head><body><div><button id="activar">Activar sonido</button><div id="estado">El navegador pide un gesto para activar el audio.</div></div>
<script>
var CANAL="__PM_CANAL__";
var ONDA={seno:"sine",cuadrada:"square",sierra:"sawtooth","triángulo":"triangle"};
var FILTRO={"paso bajo":"lowpass","paso alto":"highpass",banda:"bandpass"};
var est={onda:"seno",frecuencia:440,volumen:-12,filtro:"paso bajo",corte:4000,resonancia:1,ataque:0.01,liberacion:0.2,eco:0,sonando:false};
var ac=null,filtro,seco,ecoG,del,amo,vivo=null;
function lineal(db){return Math.pow(10,db/20)}
function cadena(){
  filtro=ac.createBiquadFilter();del=ac.createDelay(1);del.delayTime.value=0.28;
  ecoG=ac.createGain();seco=ac.createGain();amo=ac.createGain();
  filtro.connect(seco);filtro.connect(del);del.connect(ecoG);ecoG.connect(del);
  del.connect(seco);seco.connect(amo);amo.connect(ac.destination);aplicar()}
function aplicar(){if(!ac)return;
  filtro.type=FILTRO[est.filtro]||"lowpass";filtro.frequency.value=est.corte;filtro.Q.value=est.resonancia;
  ecoG.gain.value=est.eco/100*0.7;amo.gain.value=est.sonando?lineal(est.volumen):0;
  if(!vivo)return;vivo.type=ONDA[est.onda];
  vivo.frequency.setTargetAtTime(est.frecuencia,ac.currentTime,0.01)}
function conmutar(){if(!ac)return;
  if(est.sonando&&!vivo){vivo=ac.createOscillator();vivo.type=ONDA[est.onda];vivo.frequency.value=est.frecuencia;vivo.connect(filtro);vivo.start()}
  if(!est.sonando&&vivo){vivo.stop();vivo.disconnect();vivo=null}aplicar()}
function nota(){if(!ac)return;var t=ac.currentTime;var o=ac.createOscillator();
  o.type=ONDA[est.onda];o.frequency.value=est.frecuencia;var v=ac.createGain();
  v.gain.setValueAtTime(0.0001,t);v.gain.exponentialRampToValueAtTime(Math.max(lineal(est.volumen),0.0001),t+est.ataque+0.001);
  v.gain.exponentialRampToValueAtTime(0.0001,t+est.ataque+0.05+est.liberacion);
  o.connect(v);v.connect(filtro);o.start(t);o.stop(t+est.ataque+est.liberacion+0.2)}
document.getElementById("activar").onclick=function(){
  if(!ac){var C=window.AudioContext||window.webkitAudioContext;ac=new C();cadena();conmutar()}
  ac.resume();document.getElementById("estado").textContent="Audio activo. Dicta: «sube la frecuencia 2 kHz»."};
addEventListener("message",function(e){
  if(e.source!==parent)return;var m=e.data||{};
  if(m.protomolecula!==1||m.canal!==CANAL)return;
  if(m.tipo==="establecer"&&typeof m.parametroId==="string"&&Object.prototype.hasOwnProperty.call(est,m.parametroId)){
    est[m.parametroId]=m.valor;aplicar();conmutar()}
  if(m.tipo==="disparar"&&m.parametroId==="nota")nota()});
parent.postMessage({protomolecula:1,canal:CANAL,tipo:"hola",nombre:"Sintetizador",parametros:${params}},"*");
</script></body></html>`;
}

export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: PARAMETROS_SINTETIZADOR,
  entradas: [],
  salidas: ["wav"],
  ficha: {
    web: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
    licencia: "API del navegador",
  },
  vista: { tipo: "documento", documento: documentoSintetizador },
};
