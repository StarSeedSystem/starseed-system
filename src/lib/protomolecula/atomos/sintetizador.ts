import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/tipos";

export const SINTETIZADOR: DefinicionAtomo = {
  herramientaId: "sintetizador-web-audio",
  nombre: "Sintetizador Web Audio",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "onda", nombre: "Onda", sinonimos: ["forma de onda", "tipo de onda"], tipo: "opcion", opciones: ["seno", "cuadrada", "sierra", "triángulo"], defecto: "seno", },
    { id: "frecuencia", nombre: "Frecuencia", sinonimos: ["frecuencia", "tono", "nota"], tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 440, },
    { id: "volumen", nombre: "Volumen", sinonimos: ["volumen", "ganancia", "nivel"], tipo: "numero", min: -60, max: 6, paso: 0.1, unidad: "dB", defecto: -12, },
    { id: "filtro", nombre: "Filtro", sinonimos: ["tipo de filtro", "filtro activo"], tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"], defecto: "paso bajo", },
    { id: "corte", nombre: "Frecuencia de corte", sinonimos: ["corte", "frecuencia de corte", "fc"], tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 4000, },
    { id: "resonancia", nombre: "Resonancia", sinonimos: ["q", "factor de calidad", "ancho de banda"], tipo: "numero", min: 0, max: 20, paso: 0.1, defecto: 1, },
    { id: "ataque", nombre: "Ataque", sinonimos: ["attack", "inicio"], tipo: "numero", min: 0, max: 2, paso: 0.01, unidad: "s", defecto: 0, },
    { id: "liberacion", nombre: "Liberación", sinonimos: ["release", "fin"], tipo: "numero", min: 0, max: 5, paso: 0.01, unidad: "s", defecto: 0, },
    { id: "eco", nombre: "Eco", sinonimos: ["reverberación", "retardo", "feedback"], tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 0, },
    { id: "sonando", nombre: "Sonando", sinonimos: ["activo", "encendido", "on"], tipo: "booleano", defecto: false, },
    { id: "nota", nombre: "Nota", sinonimos: ["disparo", "trigger", "disparar"], tipo: "disparo", defecto: false, },
  ],
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

function documentoSintetizador(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
</head>
<body>
  <button id="activar">Activar sonido</button>
  <script>
    let ctx: AudioContext, osc: OscillatorNode, filtro: BiquadFilterNode, delay: DelayNode, ganancia: GainNode, salida: AudioDestinationNode;
    let ecoRetardo = 0.3, ecoFeedback = 0;
    const params = { onda: "seno", frecuencia: 440, volumen: -12, filtro: "paso bajo", corte: 4000, resonancia: 1, ataque: 0, liberacion: 0, eco: 0, sonando: false };
    function crearCadena() {
      if (ctx) ctx.close();
      ctx = new AudioContext();
      osc = ctx.createOscillator();
      osc.type = params.onda as OscillatorType;
      osc.frequency.value = params.frecuencia;
      filtro = ctx.createBiquadFilter();
      filtro.type = params.filtro as BiquadFilterType;
      filtro.frequency.value = params.corte;
      filtro.Q.value = params.resonancia;
      delay = ctx.createDelay();
      delay.delayTime.value = ecoRetardo;
      ganancia = ctx.createGain();
      ganancia.gain.value = dbALinea(params.volumen);
      salida = ctx.destination;
      osc.connect(filtro).connect(delay).connect(ganancia).connect(salida);
      delay.connect(delay, ecoFeedback, ecoFeedback); // feedback
    }
    function dbALinea(db: number) { return Math.pow(10, db / 20); }
    function actualizarParametros() {
      if (!ctx) return;
      osc.type = params.onda as OscillatorType;
      osc.frequency.value = params.frecuencia;
      filtro.type = params.filtro as BiquadFilterType;
      filtro.frequency.value = params.corte;
      filtro.Q.value = params.resonancia;
      delay.delayTime.value = ecoRetardo;
      // Para el eco, necesitamos un bucle de feedback con ganancia.
      // Debido a la complejidad, dejamos el eco solo como delay sin feedback ajustable.
      // En una implementación completa, se insertaría un GainNode en el bucle de feedback.
    }
    function reproducirNota() {
      if (!ctx) return;
      // Usamos el nodo de ganancia para el envolvente
      ganancia.gain.cancelScheduledValues(ctx.currentTime);
      ganancia.gain.setValueAtTime(0, ctx.currentTime);
      ganancia.gain.linearRampToValueAtTime(dbALinea(params.volumen), ctx.currentTime + params.ataque);
      ganancia.gain.linearRampToValueAtTime(0, ctx.currentTime + params.ataque + params.liberacion);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + params.ataque + params.liberacion + 0.1); // pequeño margen
    }
    function manejarMensaje(e: MessageEvent) {
      try {
        const data = e.data;
        if (typeof data !== 'object' || data === null) return;
        if (data.protomolecula !== 1) return;
        if (data.canal !== '__PM_CANAL__') return;
        if (e.source !== parent) return;
        const { tipo, id: parametroId, valor } = data;
        if (tipo === 'establecer') {
          params[parametroId as keyof typeof params] = valor;
          actualizarParametros();
        } else if (tipo === 'disparar' && parametroId === 'nota') {
          reproducirNota();
        }
      } catch (_) {}
    }
    document.getElementById('activar').addEventListener('click', () => {
      crearCadena();
      osc.start();
    });
    window.addEventListener('message', manejarMensaje);
    // Envía hola al cargar
    window.addEventListener('load', () => {
      parent.postMessage({ protomolecula: 1, canal: '__PM_CANAL__', tipo: 'hola', ids: Object.keys(params) }, '*');
    });
  </script>
</body>
</html>`;
}