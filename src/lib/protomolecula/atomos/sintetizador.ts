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

/** Las opciones de un parámetro, tal como las declara la definición (el documento no las repite a mano). */
const opcionesDe = (id: string): string[] => SINTETIZADOR.parametros.find((p) => p.id === id)?.opciones ?? [];
/** Un valor como literal dentro del <script>: JSON con «<» escapado, para que ningún texto pueda cerrar la etiqueta. */
const enScript = (valor: unknown): string => JSON.stringify(valor).replace(/</g, "\\u003c");

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
<p>Cadena: oscilador → filtro → ganancia (volumen y envolvente) → destino; en paralelo, la ganancia alimenta el retardo del eco, con realimentación siempre menor que 1.</p>
<button id="btn">Activar sonido</button>
<script>
(function(){
  const CANAL = "__PM_CANAL__";
  const ONDAS = ${enScript(opcionesDe("onda"))}, FILTROS = ${enScript(opcionesDe("filtro"))};
  const PARAMETROS = ${enScript(SINTETIZADOR.parametros)}; // lo que el OS pinta como controles: el «hola» los declara tal cual
  const SILENCIO = 0.001; // -60 dB: lo más bajo que admite una rampa exponencial
  let ctx = null, osc = null, filt = null, ret = null, gan = null, fb = null, mez = null, iniciado = false;
  let param = { onda:"seno", frecuencia:440, volumen:-12, filtro:"paso bajo", corte:4000, resonancia:1, ataque:0.01, liberacion:0.5, eco:0, sonando:false };
  function dBtoGain(v){ return Math.max(0, Math.pow(10, v/20)); }
  function tipoOnda(t){ switch(t){ case "cuadrada":return "square"; case "sierra":return "sawtooth"; case "triangulo":return "triangle"; default:return "sine"; } }
  function tipoFiltro(t){ switch(t){ case "paso alto":return "highpass"; case "banda":return "bandpass"; default:return "lowpass"; } }
  function tiempoEco(){ return 0.15 + (param.eco/100)*0.3; }
  // Realimentación del eco: con 1 o más la señal se acumula sin fin (a 440 Hz y 0,15 s el retardo suma en fase y el tono crece hasta saturar).
  function realimentacion(){ return 0.6 * param.eco/100; }
  function crearOscilador(){
    osc = ctx.createOscillator();
    osc.type = tipoOnda(param.onda);
    osc.frequency.setValueAtTime(param.frecuencia, ctx.currentTime);
    if(filt) osc.connect(filt);
    iniciado = false; // un oscilador solo puede arrancar una vez
  }
  function crearCadena(){
    if(ctx){ try{ ctx.close(); }catch(e){} }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if(!Contexto) throw new Error("este navegador no tiene Web Audio");
    ctx = new Contexto();
    const t = ctx.currentTime;
    filt = null; crearOscilador(); // el oscilador va primero y se conecta al filtro en cuanto existe
    filt = ctx.createBiquadFilter(); osc.connect(filt);
    ret = ctx.createDelay(3);
    gan = ctx.createGain();
    fb = ctx.createGain();
    mez = ctx.createGain();
    filt.type = tipoFiltro(param.filtro);
    filt.frequency.setValueAtTime(param.corte, t);
    filt.Q.setValueAtTime(param.resonancia, t);
    filt.connect(gan);
    gan.connect(ctx.destination); // sonido directo
    gan.connect(ret); ret.connect(mez); mez.connect(ctx.destination); // eco: solo se oye lo que sube «eco»
    ret.connect(fb); fb.connect(ret); // realimentación atenuada
    gan.gain.setValueAtTime(dBtoGain(param.volumen), t);
    ret.delayTime.setValueAtTime(tiempoEco(), t);
    fb.gain.setValueAtTime(realimentacion(), t);
    mez.gain.setValueAtTime(param.eco/100, t);
    if(param.sonando) sostener(); // lo que el OS mandó antes de activar el audio
  }
  // Un valor que no es un número finito no mueve nada: setValueAtTime lanza ante NaN o Infinity y dejaría la cadena rota hasta recargar.
  function acotar(v, lo, hi, antes){ return (typeof v === "number" && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : antes; }
  function arrancar(){ if(!iniciado){ osc.start(); iniciado = true; } }
  function fijarGanancia(t){ gan.gain.cancelScheduledValues(t); gan.gain.setValueAtTime(dBtoGain(param.volumen), t); }
  // «sonando»: encendido sostiene el tono al volumen elegido (sin rampa); apagado detiene el oscilador y deja otro listo.
  function sostener(){
    if(!osc || !ctx) return;
    if(param.sonando){ arrancar(); fijarGanancia(ctx.currentTime); }
    else if(iniciado){ try{ osc.stop(); }catch(e){} crearOscilador(); }
  }
  function establecer(p){
    const val = p.valor;
    const t = ctx ? ctx.currentTime : 0;
    switch(p.id){
      case "onda": param.onda = ONDAS.indexOf(val) >= 0 ? val : param.onda; if(osc) osc.type = tipoOnda(param.onda); break;
      case "frecuencia": param.frecuencia = acotar(val, 20, 20000, param.frecuencia); if(osc) osc.frequency.setValueAtTime(param.frecuencia, t); break;
      case "volumen": param.volumen = acotar(val, -60, 6, param.volumen); if(gan && param.sonando) fijarGanancia(t); break; // sin tono sostenido, el volumen se aplica en la próxima nota
      case "filtro": param.filtro = FILTROS.indexOf(val) >= 0 ? val : param.filtro; if(filt) filt.type = tipoFiltro(param.filtro); break;
      case "corte": param.corte = acotar(val, 20, 20000, param.corte); if(filt) filt.frequency.setValueAtTime(param.corte, t); break;
      case "resonancia": param.resonancia = acotar(val, 0, 20, param.resonancia); if(filt) filt.Q.setValueAtTime(param.resonancia, t); break;
      case "ataque": param.ataque = acotar(val, 0, 2, param.ataque); break;
      case "liberacion": param.liberacion = acotar(val, 0, 5, param.liberacion); break;
      case "eco": param.eco = acotar(val, 0, 100, param.eco); if(ret){ ret.delayTime.setValueAtTime(tiempoEco(), t); fb.gain.setValueAtTime(realimentacion(), t); mez.gain.setValueAtTime(param.eco/100, t); } break;
      case "sonando": if(typeof val === "boolean"){ param.sonando = val; sostener(); } break;
    }
  }
  // «nota»: sube del silencio al volumen en «ataque» segundos; si no hay tono sostenido, baja a silencio en «liberacion». No cambia «sonando».
  function disparar(p){
    if(p.id !== "nota" || !osc || !ctx) return;
    arrancar();
    const t = ctx.currentTime, g = gan.gain, fin = t + param.ataque + param.liberacion;
    osc.frequency.setValueAtTime(param.frecuencia, t);
    g.cancelScheduledValues(t);
    g.setValueAtTime(SILENCIO, t);
    g.linearRampToValueAtTime(Math.max(SILENCIO, dBtoGain(param.volumen)), t + param.ataque);
    if(!param.sonando){ g.exponentialRampToValueAtTime(SILENCIO, fin); g.setValueAtTime(0, fin); }
  }
  function decir(m){ parent.postMessage(Object.assign({ protomolecula:1, canal:CANAL }, m), "*"); }
  window.addEventListener("message", function(e){
    if(e.source !== parent) return;
    try{
      const msg = e.data;
      if(!msg || msg.protomolecula !== 1 || msg.canal !== CANAL) return;
      if(msg.tipo === "establecer") establecer({ id: msg.parametroId, valor: msg.valor });
      else if(msg.tipo === "disparar") disparar({ id: msg.parametroId });
      else if(msg.tipo === "estado" && msg.valores) Object.keys(msg.valores).forEach(function(id){ establecer({ id: id, valor: msg.valores[id] }); });
    }catch(err){}
  }, false);
  // Si el audio no se puede crear (sin Web Audio, política del navegador, sandbox) se DICE: sin «listo» el OS no sabría por qué no suena.
  document.getElementById("btn").addEventListener("click", function(){
    try{ crearCadena(); }
    catch(err){
      ctx = osc = filt = ret = gan = fb = mez = null; iniciado = false; // lo que llegue después solo actualiza lo recordado
      decir({ tipo:"error", mensaje:"No se pudo activar el audio: " + (err && err.message ? err.message : String(err)) });
      return;
    }
    decir({ tipo:"listo" });
  });
  decir({ tipo:"hola", nombre:"Sintetizador Web Audio", parametros:PARAMETROS });
})();
</script>
</body>
</html>`;
}
