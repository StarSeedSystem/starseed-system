# Voz estable de Astraura · voz que termina y oído que no se reinicia (contrato · 2026-11-05)

> Alex (2026-11-05): «los sistemas de voz funcionan solo cuando los regenero y no son completas … al
> comienzo mejor y después se degenera la calidad y no termina de decir los mensajes largos, y cuando hablo
> con la orbe de Astraura al presionarlo se mantiene repitiendo en loop el sonido de reinicio del micrófono …
> debería ser una línea estable receptora del micrófono y medios de sentidos configurados que autodetecte y
> perciba lo que diga hasta que detecte que naturalmente termine de explicar … que responda siempre con la voz
> natural inmediatamente en cualquier medio». Se lee ANTES de tocar `engine.ts` (habla y escucha), `voz-rt.ts`,
> `stt-oss/*`, `voz-starseed/motor.ts` o `/api/voz/*`.

## 1 · Causas medidas (2026-11-05)

1. **Mensajes largos sin terminar (voz del navegador):** `speakWithBrowser` hablaba el mensaje ENTERO en una
   sola utterance. Chrome corta las largas a ~15 s y el vigilante (máx. 30 s) cerraba el turno y reabría el
   micrófono a media frase; en Android, abrir el micro corta la voz.
2. **Se degrada la calidad (voz en tiempo real en la Mac):** con el enjambre trabajando, Supertonic midió
   RTF 3,2 (54 s para 17 s de audio) y bajó sus pasos de 6 a 4: huecos entre frases, peor calidad y frases
   que no llegan. La concesión de prioridad no basta (RTF 2,9 con ella activa).
3. **«Solo funciona al regenerar»:** el primer intento chocaba con lo anterior; regenerar empezaba limpio.
4. **El pitido en bucle de la orbe (móvil):** el reconocedor del navegador en Android termina tras cada
   frase o silencio y se reiniciaba cada ~320 ms; Android PITA en cada arranque.
5. **Corta a media explicación:** cada «final» del reconocedor (~0,6 s de pausa) se mandaba YA como orden.

## 2 · Lo hecho (Ola 1105 · VOZ, Claude)

- Voz del navegador **por trozos en fila** (`trocearTexto`, ≤ 200 caracteres), vigilante por trozo,
  `cancelarNavegador()` en todos los sitios que callan.
- `voz-rt.ts`: si el equipo no llega a tiempo real (RTF > 1,1, del servidor o medido), **cede el turno** al
  motor instantáneo; cada 20 min le da una oportunidad para volver a medir.
- `turno-natural.ts` (puro, con pruebas): **se escucha hasta que la persona termina de explicar**: espera
  ~0,9 s tras una frase cerrada, ~0,75 s tras una pregunta, ~2,6 s tras un conector, coma o muletilla; tope
  de 2 min por turno. Lo usan el oído del navegador y el oído por tramos.
- **Móvil: una línea de micrófono estable** (getUserMedia + VAD por tramos) con **oído en la nube**
  (`/api/voz/oir`: Groq Whisper con `GROQ_API_KEY` o Gemini con `GEMINI_API_KEY`; sin claves → 503 y manda el
  oído del navegador). Se apaga con `localStorage["starseed.oido.nube"] = "0"`.

## 3 · Lo que sigue (enjambre, `olas/cola-voz-1105.json`)

- `voz-starseed/motor.ts`: la nube por trozos ≤ 500 (la ruta corta a 600) y el nivel «sistema» por trozos.
- `speak-router.ts`: si un motor empieza y falla a mitad, el RESTO del mensaje sigue con el siguiente motor
  (hoy se calla); la misma voz mientras se pueda.
- Móvil sin oído en la nube: la línea estable con Whisper en el navegador (`oss-stt.ts`) si ya está
  descargado; si no, el reconocedor del navegador SOLO al detectar voz (un pitido por turno, nunca en bucle).
- Ajustes de voz: interruptor «Oído en la nube» y, a la vista, qué oído y qué voz están sonando y por qué.
- Prioridad de la voz en la Mac: medir por qué la concesión no baja el RTF (`prioridad_conversacion.py`).

## 4 · Reglas

- La misma voz dentro del mismo mensaje mientras ese motor pueda; terminar el mensaje manda sobre el timbre.
- Nunca dos reconocedores a la vez; nunca reiniciar el del navegador en bucle en móvil.
- El audio a la nube solo para transcribir; sin guardar; nada de claves en el cliente ni en el repo.
