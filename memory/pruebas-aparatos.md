# Pruebas en aparatos de Alex · tabla por build

Flujo: apps nativas de StarSeed OS (Mac, Android, Windows, Linux) que se comunican
directamente entre neuronas sin internet ni router (Bluetooth, Wi‑Fi directo, red local).

Aparatos: Mac «MaggaBook» (M1, 8 GB) · tablet Android 16 «Maggaboard» (Samsung SM‑X900) ·
iPhone (sin app iOS). Mac ↔ Android solo por Bluetooth; «Wi‑Fi» = red local por router.

Mantener al día cada vez que Alex reporte. Dirección: MetaGenesis (chat «Dirección MetaGenesis»),
relevo recibido de Claude el 2026-11-10 01:45 CST (origen: `~/.hermes/RELEVO-DIRECCION-PRUEBAS-1110.md`).

## Tabla de builds de prueba y resultados

| Build | Qué traía | Resultado en los aparatos de Alex |
|---|---|---|
| .26–.29 | Actualización desde dentro, firma de la app de Mac, Bluetooth con texto e imagen, voz por red local | ✅ Actualizar, firma, texto e imagen por Bluetooth, voz por red local |
| .30 | Voz por Bluetooth, llamada entrante nativa, controles en llamada, internet compartido, envíos cifrados por varias antenas | ✅ Voz solo por Bluetooth. Lo demás sin probar |
| .31 | Canal rápido de Bluetooth (L2CAP), video ligero, Wi‑Fi sin hotspot | ❌ Rompió todo el Bluetooth |
| .32 | Bluetooth arreglado con el canal rápido encendido; Windows y Linux | ✅ Texto, archivos y voz por Bluetooth. ❌ Video negro. ❌ La Mac eligió la cámara del iPhone. ⚠️ La tarjeta de aceptar archivo tardaba minutos. ⚠️ El enlace se reiniciaba cada 10 min |
| .33 | Bluetooth estable, video ligero «arreglado», aceptar archivo al instante, internet compartido para toda la app, símbolo 3D, recomendador de modelos | ✅ Enlace Bluetooth estable y canal rápido (por el registro). ❌ Llamadas: solo audio, por Bluetooth y por Wi‑Fi. ❌ Video negro. ❌ Cámara del iPhone otra vez. ❌ Selector de cámaras vacío. ❌ Desde la Mac no se activaba el video en la 2.ª llamada. ❌ La tablet sin Wi‑Fi no podía llamar |
| .34 | Símbolo fusionado con la flor de la vida; internet compartido en ambos sentidos | Sin probar todavía |
| .35 | Arreglos de llamadas (sección 4 del relevo), variantes opcionales de modelos, instalar Ollama, captura de Jev | **Pendiente de la ronda de Alex** |

Confirmado en aparatos hasta hoy: actualizar desde dentro, firma de Mac, texto y archivos por
Bluetooth, voz por red local, voz solo por Bluetooth, enlace Bluetooth estable. Todo lo demás
está en código y sin confirmar.

## Registro de la prueba.35 (cuando Alex reporte)

Ronda pendiente (sección 6 del relevo):
1. Tres llamadas Mac ↔ tablet solo por Bluetooth, encendiendo la cámara desde la Mac en cada una.
2. En la Mac: Calidad › Cámara, cambiar a la cámara del iPhone y volver.
3. Con el Wi‑Fi de la tablet apagado, llamar a la Mac desde la tablet.
4. Una llamada con el Wi‑Fi de la tablet encendido y cámara en los dos lados.

Registro a leer: `~/Library/Logs/app.starseed.os/enlaces.log` (líneas de tablet con prefijo
«(Maggaboard)»). Referencia de lectura: `~/.starseed/opus1031/evidencia/enlaces-prueba33-llamadas.log`.

Claves del registro:
- `visibilidad lienzo=…` / `visibilidad video=…`: tamaño, tapado, brillo.
- `camara pedida/abierta/corrige/fallo`: qué cámara y por qué falló.
- `video-datos tx/rx` con `motivos=`: cuadros enviados/recibidos/pintados y descartes.
- `carril par=… flujo=… de=… a=… motivo=…`: cambio de carril; >unos pocos/min = fallo.
- `negociacion …` / `inicio paso=…`: negociación e inicio sin servidor.

## Causas del video negro (prueba.33) y arreglos (prueba.35)

1. Pantalla negra por Bluetooth: la llamada negociaba una pista de video WebRTC que nunca
   conectaba y quedaba muda. `src/lib/llamadas/motor.ts` (`streamDe`/`lienzoDe`) devolvía esa
   pista en vez del lienzo del video ligero. Arreglado en motor y, como segunda defensa, en la ventana.
2. Oscilación con Wi‑Fi (2×/seg): `src/lib/llamadas/voz-datos/transporte.ts` no contaba la red
   local nativa como ruta con IP. Arreglado con un carril por flujo (`src/lib/llamadas/carriles.ts`).
3. La Mac casi no enviaba video: la compuerta que protege la voz cerraba el paso al video. Arreglado.
4. Selector de cámaras vacío: no se refrescaba tras el permiso. Arreglado; cámara por id exacto.
5. La tablet sin Wi‑Fi no podía llamar: `llamadas-neurona.ts` no daba ruta sin internet y
   `acciones.ts` creaba primero la sesión en el servidor. Arreglado leyendo el código; no reproducido.
6. El video de la Mac no arranca en la 2.ª llamada. No se reprodujo. Queda con registro detallado.

Sin confirmar en aparatos: todo lo anterior en WKWebView (Mac) y en el WebView de Android.

## Bancos de prueba reales

`pruebas-reales/llamadas-video` (53 casos) y `pruebas-reales/llamadas-medio` (7 casos).
Cada uno con su LEEME. Se corren en contenedor con Chromium y Playwright, no en la Mac.
Antes de integrar un arreglo de llamadas deben pasar los dos.

## Lecciones (sección 5 del relevo)

1. Evidencia antes que teoría. 2. Los bancos con medios simulados no demuestran que algo se vea.
3. Lo que el banco no puede ver (WKWebView, Android), que lo diga el registro. 4. Una función
nueva que rompe algo se arregla, no se apaga. 5. Enlaces directos de verdad (P2P/malla, sin
hotspot). 6. Solo se compila la última build. 7. Agentes en pares con archivos que no se pisen.
8. Los worktrees son parciales (sparse). 9. Guardias de todo el repo en `src/lib/__tests__`.
10. Pruebas inestables con la Mac cargada: `adaptador-motor.test.ts`, `archivo-seguro.test.ts`,
`almacenamiento-aliviar.test.ts`, `chat-director.test.tsx` — conviene hacerlas deterministas.
