import type { DefinicionAtomo, VistaAtomo } from "../tipos";
import type { Parametro } from "../tipos";

/** Parámetros del sintetizador Web Audio */
export const PARAMETROS_SINTETIZADOR: Parametro[] = [
  {id:"onda",nombre:"onda",sinonimos:["forma de onda","tipo de onda"],tipo:"opcion",opciones:["seno","cuadrada","sierra","triángulo"],defecto:"seno"},
  {id:"frecuencia",nombre:"frecuencia",sinonimos:["pitch","nota","tono"],tipo:"numero",min:20,max:20000,paso:1,unidad:"Hz",defecto:440},
  {id:"volumen",nombre:"volumen",sinonimos:["ganancia","nivel"],tipo:"numero",min:-60,max:6,paso:0.1,unidad:"dB",defecto:-12},
  {id:"filtro",nombre:"filtro",sinonimos:["tipo de filtro","modo de filtro"],tipo:"opcion",opciones:["paso bajo","paso alto","banda"],defecto:"paso bajo"},
  {id:"corte",nombre:"frecuencia de corte",sinonimos:["corte","frecuencia de corte del filtro"],tipo:"numero",min:20,max:20000,paso:1,unidad:"Hz",defecto:4000},
  {id:"resonancia",nombre:"resonancia",sinonimos:["q","factor de calidad"],tipo:"numero",min:0,max:20,paso:0.1,defecto:1},
  {id:"ataque",nombre:"ataque",sinonimos:["attack","inicio"],tipo:"numero",min:0,max:2,paso:0.01,unidad:"s",defecto:0},
  {id:"liberacion",nombre:"liberación",sinonimos:["release","fin"],tipo:"numero",min:0,max:5,paso:0.01,unidad:"s",defecto:0},
  {id:"eco",nombre:"eco",sinonimos:["reverberación","reverb","delay"],tipo:"numero",min:0,max:100,paso:1,unidad:"%",defecto:0},
  {id:"sonando",nombre:"sonando",sinonimos:["activo","encendido"],tipo:"booleano",defecto:false},
  {id:"nota",nombre:"nota",sinonimos:["disparo","trigger","tocar nota"],tipo:"disparo",defecto:false},
];

/** Documento HTML completo y autocontenido para el sintetizador en iframe aislado */
function documentoSintetizador(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
  <title>Sintetizador Web Audio</title>
  <style>
    body{font-family:sans-serif;margin:20px}
    button{cursor:pointer;padding:10px 20px;margin:10px}
    .parametro{margin:15px 0}
    label{display:block;margin-bottom:5px}
    input[type="range"]{width:200px}
    input[type="number"]{width:80px}
    select{width:150px}
  </style>
</head>
<body>
  <h1>Sintetizador Web Audio</h1>
  <div id="controles"></div>
  <button id="activar">Activar sonido</button>
  <script>
    let audioContext=null,oscillator=null,filter=null,delay=null,gainNode=null;
    const parametros={onda:"seno",frecuencia:440,volumen:-12,filtro:"paso bajo",corte:4000,resonancia:1,ataque:0,liberacion:0,eco:0,sonando:false};
    function inicializarAudio(){
      if(audioContext)return;
      audioContext=new(window.AudioContext||window.webkitAudioContext)();
      oscillator=audioContext.createOscillator();
      filter=audioContext.createBiquadFilter();
      delay=audioContext.createDelay();
      gainNode=audioContext.createGain();
      oscillator.connect(filter);
      filter.connect(delay);
      delay.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type=parametros.onda;
      oscillator.frequency.value=parametros.frecuencia;
      filter.type=parametros.filtro==="paso bajo"?"lowpass":parametros.filtro==="paso alto"?"highpass":"bandpass";
      filter.frequency.value=parametros.corte;
      filter.Q.value=parametros.resonancia;
      delay.delayTime.value=parametros.eco/100*2;
      gainNode.gain.value=Math.pow(10,parametros.volumen/20);
    }
    function actualizarParametro(id,valor){
      parametros[id]=valor;
      switch(id){
        case"onda":oscillator.type=valor;break;
        case"frecuencia":oscillator.frequency.value=valor;break;
        case"volumen":gainNode.gain.value=Math.pow(10,valor/20);break;
        case"filtro":filter.type=valor==="paso bajo"?"lowpass":valor==="paso alto"?"highpass":"bandpass";break;
        case"corte":filter.frequency.value=valor;break;
        case"resonancia":filter.Q.value=valor;break;
        case"eco":delay.delayTime.value=valor/100*2;break;
        case"sonando":valor?oscillator.start():oscillator.stop();break;
        case"nota":
          if(!audioContext)inicializarAudio();
          oscillator.frequency.setValueAtTime(parametros.frecuencia,audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(parametros.frecuencia*0.01,audioContext.currentTime+0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime+0.1);
      }
    }
    window.addEventListener("message",e=>{
      if(e.data.protomolecula!==1||e.data.canal!== "__PM_CANAL__"||e.source!==parent)return;
      const{tipo,id:parametroId,valor}=e.data;
      if(tipo==="establecer")actualizarParametro(parametroId,valor);
      else if(tipo==="disparar"&&parametroId==="nota")actualizarParametro("nota",true);
    });
    window.addEventListener("load",()=>{parent.postMessage({protomolecula:1,canal:"__PM_CANAL__",tipo:"hola",parametros:PARAMETROS_SINTETIZADOR.map(p=>({id:p.id,nombre:p.nombre,tipo:p.tipo,min:p.min,max:p.max,paso:p.paso,unidad:p.unidad,opciones:p.opciones,defecto:p.defecto}))},"*")});
    document.getElementById("activar").addEventListener("click",()=>{if(!audioContext)inicializarAudio();});
  </script>
</body>
</html>`;
}

/** Definición del átomo sintetizador-web-audio */
export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: PARAMETROS_SINTETIZADOR,
  entradas: [],
  salidas: ["wav"],
  vista: {
    tipo: "documento",
    documento: documentoSintetizador,
  },
  ficha: {
    web: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
    licencia: "API del navegador",
  },
};