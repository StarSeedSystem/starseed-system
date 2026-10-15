import type { DefinicionAtomo } from "../registro-atomos";
import type { Parametro, Operacion } from "../tipos";

/** Documento HTML completo y autocontenido para el sintetizador Web Audio. */
export function documentoSintetizador(): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<button id="activar">Activar sonido</button>
<script>
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillators = {};
  let gainNode = audioContext.createGain();
  let delayNode = audioContext.createDelay();
  let feedbackGain = audioContext.createGain();
  let filter = audioContext.createBiquadFilter();
  gainNode.connect(audioContext.destination);
  delayNode.connect(gainNode);
  feedbackGain.connect(delayNode);
  delayNode.connect(feedbackGain);
  filter.connect(delayNode);
  
  // Oscilladores
  function createOscillator(type, frequency) {
    const osc = audioContext.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    return osc;
  }
  
  // Parámetros
  let params = {
    onda: 'seno',
    frecuencia: 440,
    volumen: -12,
    filtro: 'paso bajo',
    corte: 4000,
    resonancia: 1,
    ataque: 0,
    liberacion: 0,
    eco: 0,
    sonando: false,
  };
  
  // Aplicar parámetros
  function aplicarParametros() {
    // Osciladores
    Object.values(oscillators).forEach(osc => osc.stop());
    oscillators = {};
    if (params.sonando) {
      const osc = createOscillator(params.onda, params.frecuencia);
      osc.connect(filter);
      osc.start();
      oscillators.main = osc;
    }
    
    // Filtro
    filter.type = params.filtro === 'paso bajo' ? 'lowpass' :
                   params.filtro === 'paso alto' ? 'highpass' :
                   'bandpass';
    filter.frequency.value = params.corte;
    filter.Q.value = params.resonancia;
    
    // Delay y feedback
    delayNode.delayTime.value = 0.1; // fixed delay time
    feedbackGain.gain.value = params.eco / 100;
    
    // Ganancia (convertir dB a lineal)
    const gain = Math.pow(10, params.volumen / 20);
    gainNode.gain.value = gain;
  }
  
  // Mensaje desde el padre
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data.protomolecula !== 1) return;
    if (event.data.canal !== '__PM_CANAL__') return;
    if (event.data.tipo === 'establecer') {
      params = { ...params, ...event.data.valores };
      aplicarParametros();
    } else if (event.data.tipo === 'disparar' && event.data.parametroId === 'nota') {
      // Disparar nota
      const osc = createOscillator(params.onda, params.frecuencia);
      osc.connect(filter);
      osc.start();
      setTimeout(() => osc.stop(), 0.1); // nota corta
    }
  });
  
  // Enviar hola al cargar
  window.addEventListener('load', () => {
    window.parent.postMessage({
      protomolecula: 1,
      canal: '__PM_CANAL__',
      tipo: 'hola',
      valores: params
    }, '*');
  });
  
  // Activar sonido con gesto del usuario
  document.getElementById('activar').addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    aplicarParametros();
  });
</script>`;
}

/** Definición del átomo sintetizador Web Audio. */
export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "onda", nombre: "Onda", sinonimos: ["forma de onda", "tipo de onda"], tipo: "opcion", opciones: ["seno", "cuadrada", "sierra", "triangulo"], defecto: "seno" },
    { id: "frecuencia", nombre: "Frecuencia", sinonimos: ["freq", "tono", "nota"], tipo: "numero", min: 20, max: 20000, defecto: 440, unidad: "Hz" },
    { id: "volumen", nombre: "Volumen", sinonimos: ["gain", "nivel"], tipo: "numero", min: -60, max: 6, defecto: -12, unidad: "dB" },
    { id: "filtro", nombre: "Filtro", sinonimos: ["tipo de filtro"], tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"], defecto: "paso bajo" },
    { id: "corte", nombre: "Frecuencia de corte", sinonimos: ["corte", "frecuencia de corte"], tipo: "numero", min: 20, max: 20000, defecto: 4000, unidad: "Hz" },
    { id: "resonancia", nombre: "Resonancia", sinonimos: ["Q", "realimentacion"], tipo: "numero", min: 0, max: 20, defecto: 1 },
    { id: "ataque", nombre: "Ataque", sinonimos: ["attack", "inicio"], tipo: "numero", min: 0, max: 2, defecto: 0, unidad: "s" },
    { id: "liberacion", nombre: "Liberación", sinonimos: ["release", "fade out"], tipo: "numero", min: 0, max: 5, defecto: 0, unidad: "s" },
    { id: "eco", nombre: "Eco", sinonimos: ["reverberacion", "delay"], tipo: "numero", min: 0, max: 100, defecto: 0, unidad: "%" },
    { id: "sonando", nombre: "Sonando", sinonimos: ["activo", "encendido"], tipo: "booleano", defecto: false },
    { id: "nota", nombre: "Nota", sinonimos: ["disparo", "trigger", "tocar nota"], tipo: "disparo" },
  ],
  entradas: [],
  salidas: ["wav"],
  ficha: {
    web: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
    licencia: "API del navegador",
  },
  vista: {
    tipo: "documento",
    documento: documentoSintetizador,
  },
};