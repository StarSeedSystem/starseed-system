import { DefinicionAtomo, Parametro } from "../tipos";

export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    {id:"onda",nombre:"Onda",sinonimos:["forma de onda","tipo de onda"],tipo:"opcion",opciones:["seno","cuadrada","sierra","triángulo"],defecto:"seno"},
    {id:"frecuencia",nombre:"Frecuencia",sinonimos:["tono","pitch"],tipo:"numero",min:20,max:20000,defecto:440,unidad:"Hz"},
    {id:"volumen",nombre:"Volumen",sinonimos:["gain","nivel"],tipo:"numero",min:-60,max:6,defecto:-12,unidad:"dB"},
    {id:"filtro",nombre:"Filtro",sinonimos:["tipo de filtro"],tipo:"opcion",opciones:["paso bajo","paso alto","banda"],defecto:"paso bajo"},
    {id:"corte",nombre:"Frecuencia de corte",sinonimos:["corte"],tipo:"numero",min:20,max:20000,defecto:4000,unidad:"Hz"},
    {id:"resonancia",nombre:"Resonancia",sinonimos:["Q","emphasis"],tipo:"numero",min:0,max:20,defecto:1},
    {id:"ataque",nombre:"Ataque",sinonimos:["attack"],tipo:"numero",min:0,max:2,defecto:0.1,unidad:"s"},
    {id:"liberacion",nombre:"Liberación",sinonimos:["release"],tipo:"numero",min:0,max:5,defecto:0.1,unidad:"s"},
    {id:"eco",nombre:"Eco",sinonimos:["reverberación","delay"],tipo:"numero",min:0,max:100,defecto:0,unidad:"%"},
    {id:"sonando",nombre:"Sonando",sinonimos:["activo","playing"],tipo:"booleano",defecto:false},
    {id:"nota",nombre:"Nota",sinonimos:["disparo","trigger","tocar nota"],tipo:"disparo"},
  ],
  entradas:[],
  salidas:["wav"],
  vista:{tipo:"documento",documento:documentoSintetizador},
  ficha:{web:"https://developer.mozilla.org/docs/Web/API/Web_Audio_API",licencia:"API del navegador"},
};

function documentoSintetizador():string{
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
  <style>body{font-family:sans-serif;margin:20px;}button{padding:10px 20px;font-size:16px;cursor:pointer;}</style>
</head>
<body>
  <button id="activar">Activar sonido</button>
  <script>
    let ac=null,osc=null,filt=null,delay=null,gan=null,fbG=null,ECO_MAX=1;
    function crear(){
      ac=new (window.AudioContext||window.webkitAudioContext)();
      osc=ac.createOscillator();
      filt=ac.createBiquadFilter();
      delay=ac.createDelay();
      fbG=ac.createGain();
      gan=ac.createGain();
      osc.connect(filt);
      filt.connect(delay);
      delay.connect(gan);
      gan.connect(ac.destination);
      delay.connect(fbG);
      fbG.connect(delay);
    }
    function act(){
      if(!ac)return;
      const v=window.__PM_VALORES__||{};
      osc.type=v.onda||"sine";
      filt.type={ "paso bajo":"lowpass","paso alto":"highpass","banda":"bandpass" }[v.filtro||"paso bajo"]||"lowpass";
      osc.frequency.value=v.frecuencia||440;
      filt.frequency.value=v.corte||4000;
      filt.Q.value=v.resonancia||1;
      gan.gain.value=Math.pow(10,(v.volumen||-12)/20);
      fbG.gain.value=Math.min((v.eco||0)/100,ECO_MAX);
    }
    function nota(){
      if(!ac)return;
      const v=window.__PM_VALORES__||{};
      const nOsc=ac.createOscillator();
      const nGan=ac.createGain();
      nOsc.frequency.value=v.frecuencia||440;
      nOsc.type=v.onda||"sine";
      const ahora=ac.currentTime;
      const at=v.ataque||0.1;
      const lt=v.liberacion||0.1;
      nGan.gain.setValueAtTime(0,ahora);
      nGan.gain.linearRampToValueAtTime(0.01,ahora+at);
      nGan.gain.setValueAtTime(0.01,ahora+at+lt);
      nGan.gain.linearRampToValueAtTime(0,ahora+at+lt+0.1);
      nOsc.connect(nGan);
      nGan.connect(ac.destination);
      nOsc.start(ahora);
      nOsc.stop(ahora+at+lt+0.2);
    }
    window.addEventListener("load",()=>{
      const m={protomolecula:1,canal:"__PM_CANAL__",tipo:"hola",parametros:Object.keys(window.__PM_VALORES__||{})};
      window.parent.postMessage(m,"*");
      crear();
      act();
      document.getElementById("activar").addEventListener("click",()=>{if(ac.state==="suspended")ac.resume();});
    });
    window.addEventListener("message",e=>{
      if(e.source!==window.parent||!e.data||e.data.protomolecula!==1||e.data.canal!=="__PM_CANAL__")return;
      if(e.data.tipo==="cambio"&&e.data.objetivo){
        if(!window.__PM_VALORES__)window.__PM_VALORES__={};
        window.__PM_VALORES__[e.data.objetivo.parametroId]=e.data.valor;
        act();
        if(e.data.objetivo.parametroId==="nota"&&e.data.valor===true)nota();
      }
    });
  </script>
</body>
</html>`;
}
export {documentoSintetizador};