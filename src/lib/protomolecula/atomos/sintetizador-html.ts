export function documentoSintetizador(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
</head>
<body>
  <button id="activar">Activar sonido</button>
  <script>
    let audioContext = null;
    let oscillator = null;
    let filter = null;
    let delay = null;
    let gain = null;
    let delayFeedbackGain = null;
    const crearCadenaDeAudio = () => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 4000;
      filter.Q.value = 1;
      delay = audioContext.createDelay();
      delay.delayTime.value = 0.3;
      delayFeedbackGain = audioContext.createGain();
      delayFeedbackGain.gain.value = 0;
      gain = audioContext.createGain();
      gain.gain.value = 0.25;
      oscillator.connect(filter);
      filter.connect(delay);
      delay.connect(gain);
      gain.connect(audioContext.destination);
      delay.connect(delayFeedbackGain);
      delayFeedbackGain.connect(delay);
    };
    const actualizarTipoOscilador = (tipo) => {
      if (oscillator) oscillator.type = tipo;
    };
    const actualizarTipoFiltro = (tipo) => {
      if (filter) filter.type = tipo;
    };
    const actualizarFrecuenciaFiltro = (frecuencia) => {
      if (filter) filter.frequency.value = frecuencia;
    };
    const actualizarQFiltro = (q) => {
      if (filter) filter.Q.value = q;
    };
    const actualizarTiempoRetraso = (tiempo) => {
      if (delay) delay.delayTime.value = tiempo;
    };
    const actualizarRetroalimentacionEco = (retroalimentacion) => {
      if (delayFeedbackGain) delayFeedbackGain.gain.value = retroalimentacion / 100;
    };
    const actualizarVolumen = (db) => {
      if (gain) gain.gain.value = Math.pow(10, db / 20);
    };
    const iniciarOscilador = () => {
      if (oscillator) oscillator.start();
    };
    const detenerOscilador = () => {
      if (oscillator) oscillator.stop();
    };
    const dispararNota = () => {
      console.log('Nota disparada');
    };
    const manejarMensaje = (evento) => {
      if (evento.source !== parent) return;
      if (evento.data.protomolecula !== 1) return;
      if (evento.data.canal !== "__PM_CANAL__") return;
      const { tipo, id: parametroId, valor } = evento.data;
      if (tipo === "establecer") {
        switch (parametroId) {
          case "onda": actualizarTipoOscilador(valor); break;
          case "frecuencia": if (oscillator) oscillator.frequency.value = valor; break;
          case "volumen": actualizarVolumen(valor); break;
          case "filtro": actualizarTipoFiltro(valor); break;
          case "corte": actualizarFrecuenciaFiltro(valor); break;
          case "resonancia": actualizarQFiltro(valor); break;
          case "eco": actualizarRetroalimentacionEco(valor); break;
          case "sonando": if (valor) iniciarOscilador(); else detenerOscilador(); break;
          case "nota": if (valor) dispararNota(); break;
        }
      } else if (tipo === "disparo" && parametroId === "nota" && valor) {
        dispararNota();
      }
    };
    window.addEventListener('load', () => {
      const mensajeHola = {
        protomolecula: 1,
        canal: "__PM_CANAL__",
        tipo: "hola"
      };
      parent.postMessage(mensajeHola, "*");
    });
    window.addEventListener('message', manejarMensaje);
    document.getElementById('activar').addEventListener('click', () => {
      if (!audioContext) {
        crearCadenaDeAudio();
        iniciarOscilador();
      }
    });
  </script>
</body>
</html>`;
}