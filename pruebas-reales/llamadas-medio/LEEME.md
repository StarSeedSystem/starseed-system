# Banco real de llamadas: carriles por flujo (LLA1110D)

Dos motores de llamada **de verdad** (`MotorLlamada`) en una página de Chromium, con `RTCPeerConnection` reales y la
cámara y el micro falsos de Chromium, unidos por una señalización en bucle y por un enlace de datos simulado (como el
Bluetooth L2CAP: retardo, capacidad y pérdida en `banco.datos`). La ruta IP se controla con `banco.red`:

- `red.ip = false`: la señalización no entrega candidatos ICE (como por Bluetooth: ICE no conecta) y, en una conexión
  ya hecha, el estado ICE se fuerza a `failed` (el corte se simula a nivel de estado: los paquetes siguen pasando);
- `red.ipVista.A/B`: lo que cada motor CREE (`hayRutaIp`), para reproducir la prueba 33 (IP de verdad, «sin IP» visto);
- `red.retardoIceMs` (1.5 s): lo que tarda ICE en un aparato.

## Correrlo (en un contenedor con Chromium y Playwright; no hace falta `npm install` del repo)

```sh
cd pruebas-reales/llamadas-medio
node construir.mjs ../.. salida/banco.js          # esbuild con el alias @/ (entra src/lib/llamadas y, MLL1111C, malla/senales-red y malla/cola-timbre)
cp index.html salida/
node correr.mjs salida todos 300 > resultados.json # o: aleteo, ip-aparece, choque, video, segunda, corte-ip, sin-servidor, paso-ip, paso-ip-silencioso, timbre-cola, video-sube, wifi-directo, ble-160, ble-80, ble-40, ble-caida, ble-micro, ble-real, ble-real-mudo, ble-tableta, wifi-cae, ruta-fantasma
```

Para comparar con otro árbol (p. ej. main): `node construir.mjs /ruta/al/otro/repo salida-viejo/banco.js`.
Necesita `esbuild` y `playwright` (globales o en `/opt/npm-tools`). No toca el Mac ni la red.

## Escenarios

| Escenario | Qué mira |
|---|---|
| `aleteo` | Prueba 33, llamada 3: IP real pero «sin IP» visto y enlace de datos arriba. Reinicios de la voz por datos. |
| `ip-aparece` | Solo Bluetooth 20 s, luego aparece la IP y sigue N s: carriles por flujo, ofertas sin IP, vídeo con cuadros y píxel no negro. |
| `choque` | Los dos encienden/apagan la cámara a la vez 5 veces: colisiones y convergencia. |
| `video` | Vídeo por WebRTC: A enciende, B enciende, A apaga y enciende: `framesDecoded` y píxel no negro. |
| `segunda` | Tres llamadas seguidas en la misma página: la cámara enciende en todas. |
| `corte-ip` | Voz por Bluetooth + vídeo por WebRTC; la IP se corta 20 s y vuelve. |
| `sin-servidor` | Llamada sin tema de Supabase, solo canal directo y sin IP: contestada en los dos y voz por datos. |
| `paso-ip` | (MLL1111C) Dos vías arriba, voz por WebRTC; corte de IP con señal del sistema (`offline`, ICE «failed»): ms hasta que la voz suena en los dos. |
| `paso-ip-silencioso` | (MLL1111C) Igual, pero ICE sigue «conectado» y solo dejan de entrar bytes (`red.modoCorte = "silencio"`): solo la comprobación de vida lo ve. |
| `timbre-cola` | (MLL1111C) Timbre sin ninguna vía; a los 5 s liga una (`banco.abrirVia`): debe salir solo. |
| `video-sube` | (MLL1111C) Contesta sin ruta IP y aparece a los 3 s: ms desde que WebRTC conecta hasta que el vídeo sube (vídeo ligero de mentira). |
| `wifi-directo` | (MLL1111C) Wi-Fi directo y router simulados con su medida (`banco.extras`): los datos toman el que más mide, con histéresis. |
| `ble-160` (LLA1111B) | Enlace como el Bluetooth de verdad (`enlaceBle`: carril de voz antes que el de vídeo, parada y espera con 42 ms de acuse, colas de 6/24 KiB) a 160 kb/s, micros abiertos (Opus real) y cámaras encendidas, N s: fps pintados en cada lado por ventanas de 5 s, pérdida y tránsito de la voz, espera que le pone el vídeo. Pasa con ≥ 3 fps en el 80 % de las ventanas, voz < 2 % perdida, ≤ 3 % por encima de 250 ms y ninguna espera tras vídeo > 150 ms. |
| `ble-80` | Igual a 80 kb/s: o el vídeo sigue (≥ 1 fps) o se pausa con aviso; la voz limpia. |
| `ble-40` | Igual a 40 kb/s (la voz sola ya no cabe): aviso de pausa en ≤ 15 s y la voz no peor que sola. |
| `ble-caida` | 160 → 40 → 160 kb/s a mitad de llamada: pausa con aviso, y el vídeo vuelve solo en ≤ 20 s. |
| `ble-micro` | 160 kb/s y el micro de A se silencia y abre cada 6 s: los fps no cambian. |
| `voz-40` · `voz-24` · `voz-16` (VOZ1111J) | Solo voz, los dos micros abiertos (Opus real), carril Bluetooth a 40/24/16 kb/s (anunciado 160). Pasa con pérdida < 2 % en cada sentido, ≤ 1 hueco audible/min y ninguno > 200 ms (el «oído» del banco: marcas cada 2 s para el boca-oído; hueco = trama casi muda o ≥ 150 ms sin sonar; los saltos de < 150 ms del temporizador de 20 ms de la página se cuentan aparte, `saltosTemporizador`, porque el worklet de verdad guarda 240 ms), boca-oído p95 ≤ 900 ms y la llamada viva al acabar. |
| `voz-caida` | 160 → 24 → 160 kb/s: lo mismo en cada tramo desde 6 s después de cada cambio (`asentados`); en esos 6 s de recolocación (`transitorios`) ningún hueco > 1 s. |
| `voz-suelo` | 160 → 8 → 160: aviso «no alcanza para la voz» en los dos en ≤ 8 s y se va en ≤ 12 s al volver. |
| `voz-40-cif` · `voz-24-cif` · `voz-16-cif` | Como `voz-*` pero con el cifrado del enlace en el aire (`ble.cifrado`: el cuerpo en base64 + 96 B por escritura, como Mac ↔ tableta). Dicen dónde está el suelo real con cifrado. |
| `vozvideo-80` · `vozvideo-40` | Voz y vídeo a la vez: la reserva de la voz sigue a su escalón (registro `video-datos reparto … voz=`). |
| `ble-real` (LLA1111Q) | Carril **calibrado** con el registro de la prueba 37 (`bleReal` en `entrada.ts`, cada número con la línea del registro de la que sale): acuse por escritura 25 + Exp(30) ms (tope 115), serialización 35–70 B/ms de aire, cifrado del enlace (base64 + 96 B por escritura), la cubeta de escrituras del motor (36 de ráfaga, 7,2/s), control antes que voz/datos, la señalización cada 3,3 s y el espejo del registro (5 KB cada 30 s) en el mismo enlace, y `capacidadKbps` = lo que mide la app nativa con mensajes ≥ 2 KiB. Micros abiertos y cámaras encendidas, 120 s. Pasa con ≥ 3 fps en el 80 % de las ventanas en los dos sentidos, voz < 2 % perdida, ≤ 3 % tarde (400 ms), espera tras vídeo ≤ 150 ms, ≤ 1 hueco audible/min y ninguno > 200 ms, y la voz en Opus ≥ 12 kb/s al acabar. Con el código de antes reproduce el aparato: voz en 6 kb/s con el enlace leído a 20–40 kb/s y vídeo en pausa. |
| `ble-real-mudo` | Igual con los dos micros en silencio: el vídeo no puede depender de que alguien hable. |
| `ble-tableta` (LLA1112A) | `ble-real` con el lado B como la tableta de la prueba 39 (`bleReal.ladoB` = `LADO_TABLETA_39` en `entrada.ts`, cada número con su línea): acuse más largo, serialización más lenta y PARADAS (B ni escribe ni entrega a su web durante 150–450 ms cada ≈ 2 s; una escritura en vuelo se alarga hasta que acaba). 120 s, micros abiertos y cámaras. Pasa con lo de `ble-real` (tránsito aparte: aquí manda lo que se reproduce) más: audio inventado ≤ 5 % en cada ventana de 5 s y el «tarde» que informa el otro ≤ 5 % (desde los 20 s), espera tras vídeo ≤ 250 ms (carril lento). **LLA1113B:** en la Mac (Chrome instalado) NO pasa ni con el código del commit que lo creó (`a51f1170a`: vídeo de A 0,7 fps, 9 ventanas de voz con inventado > 5 %) ni con main tras LLA1113A (vídeo de A 0 fps: cada prueba de reanudar acaba en «pausa motivo=prueba-fallida» porque las paradas de B inflan la espera de la voz de A, `reparto.ts` `ControlReparto.paso`). No es una regresión; queda abierto si las paradas deben contar en la prueba de reanudar (falta verlo en el aparato). |
| `ble-lento` (LLA1113A) | `ble-real` con los temporizadores de la PÁGINA lentos (como WebKit con la ventana oculta o tapada: cada setInterval/setTimeout del motor corre como mucho una vez por segundo) en dos tramos de 30 s; lo del banco (carril, oído) sigue con los reales (`__bancoT` en `entrada.ts`, la cuña de `construir.mjs`). Reproduce la prueba 40 con el código de antes: «pausa motivo=suelo cabe=142kbps … espera=1000/0ms», la voz al escalón 5 por «descartes» con 160–260 kb/s de sitio y huecos de 29 s. Pasa con lo de `ble-real`, ninguna pausa del vídeo y la voz nunca al escalón 5. `BANCO_CANAL=chrome` lo corre con el Chrome instalado (Mac sin navegadores de Playwright). |
| `wifi-cae` (LLA1112A) | Llamada con IP y Bluetooth (160 kb/s, vídeo ligero de verdad), voz y vídeo por WebRTC; corte silencioso de la IP 20 s y vuelta. Pasa si el motor elegido para «enlace local + Bluetooth» es el de llamadas, la voz suena en los dos en ≤ 2,5 s, hay vídeo ligero (≥ 1 fps) durante el corte, la llamada sigue y el vídeo vuelve por WebRTC sin negro; y si la llamada directa sigue en curso 2 s después de perder su enlace. |
| `ruta-fantasma` (LLA1112A) | Solo Bluetooth con una ruta IP anunciada que no lleva nada (los dos aparatos de la misma cuenta, «Yo»), 180 s. Pasa con ≤ 2 reintentos de WebRTC, ningún «Reconectando…» con la voz por Bluetooth, sin el aviso de enlace fallido al acabar y el otro con el nombre de su aparato. |

Cada caso nuevo devuelve `pasa`. Para correrlo desde una copia fuera del repo (si el `playwright` del repo no casa con los navegadores instalados), copia `correr.mjs` y `salida/` a otra carpeta y córrelo allí: usa el de `/opt/npm-tools`. El árbol viejo se construye sin `cola-timbre` (el módulo llega vacío y el banco usa el
intento único de antes).

No está en CI (no hay trabajo de extremo a extremo con navegador). Lo que el banco NO cubre: radios reales, el
transporte universal, el timbre por la malla y las vistas de la ventana.

**Qué prueban los carriles simulados y qué no (LLA1111Q).** El carril fijo (`ble-160`…`vozvideo-40`) es exactamente lo
que suponía el modelo de LLA1111B (capacidad fija, acuse fijo de 42 ms, sin tope de escrituras): prueba la lógica en
carriles estrechos, pero un control afinado solo contra él no ve lo que el aparato hace de otra manera — la prueba 37
falló en el aparato con todos estos casos en verde. El carril calibrado (`ble-real`) añade lo que el registro de la
prueba 37 enseña del Bluetooth de verdad (acuse variable, tope de escrituras del emisor, cifrado, tráfico de otros
carriles) y reproduce aquel fallo con el código de antes; sigue sin probar la radio: el reparto del aire entre los dos
sentidos, las pausas largas de la radio, el GATT (sin canal rápido) y lo que tarda la medida nativa en llegar a la web
(cada 15 s por `refrescar`).
