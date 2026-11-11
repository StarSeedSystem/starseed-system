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
node correr.mjs salida todos 300 > resultados.json # o: aleteo, ip-aparece, choque, video, segunda, corte-ip, sin-servidor, paso-ip, paso-ip-silencioso, timbre-cola, video-sube, wifi-directo, ble-160, ble-80, ble-40, ble-caida, ble-micro
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

Cada caso nuevo devuelve `pasa`. El árbol viejo se construye sin `cola-timbre` (el módulo llega vacío y el banco usa el
intento único de antes).

No está en CI (no hay trabajo de extremo a extremo con navegador). Lo que el banco NO cubre: radios reales, el
transporte universal, el timbre por la malla y las vistas de la ventana.
