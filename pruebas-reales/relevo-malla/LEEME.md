# Banco real del relevo: A llega a C por B (REL1111I)

Tres o cuatro neuronas, **una por contexto de Chromium** (cada una con su almacenamiento, su clave de cifrado y su identidad de
malla, como un aparato), con el código **real** del transporte universal (`crearEnviador`, despacho y entrega una sola vez), el
motor de relevo (`src/lib/malla/relevo`), el motor de archivos, el sello de archivos y el canal de señalización de llamadas.
Los carriles los simula `correr.mjs` en Node: capacidad (kb/s), retardo (ms), pérdida y corte, por pareja y tipo (`nativo`,
`ble`). El saludo de un carril «prueba» la huella y la clave de la vecina directa, como `nl.hola`; lo demás se aprende por los
anuncios del relevo.

## Correrlo (contenedor con Chromium y Playwright en `/opt/npm-tools`; no hace falta `npm install`)

```sh
cd pruebas-reales/relevo-malla
node construir.mjs ../.. salida/banco.js && cp index.html salida/
node construir.mjs /ruta/a/un/arbol/anterior salida-antes/banco.js && cp index.html salida-antes/   # el «par antiguo» del caso vieja
node correr.mjs salida todos salida-antes > resultados.json     # o un caso: a-c-por-b, cae-b-con-d…
node correr.mjs salida-antes todos salida-antes                 # el árbol anterior: todo cae salvo «vieja»
```

## Casos

| Caso | Neuronas | Qué mira | Pasa si |
|---|---|---|---|
| `a-c-por-b` | A–B (red local), B–C (Bluetooth) | Mensaje y archivo de 120 KB de A a C, solos | Acuse sellado de C, «por relevo de Maggaboard» en C, archivo con el SHA-256 de origen y `cifrado: archivo`; ninguna trama que pasó por B lleva las marcas en claro |
| `cae-b-con-d` | A–B–C rápido, A–D–C Bluetooth | 400 KB; al 20 % cae A–B | Cambia a D (`motivo=caida`), sigue (ms medidos), termina una sola vez; un mensaje durante va por D |
| `cae-b-sin-nadie` | A–B–C | 400 KB; B–C cae 8 s; mensaje en el corte | Nada llega durante el corte; al volver, mensaje y archivo terminan, una vez |
| `dos-relevos` | B por Bluetooth, D por red local | Calidad distinta, D se degrada un poco y luego mucho | Va por D; un poco peor no cambia (histéresis); mucho peor pasa a B (`motivo=mejor`) |
| `directo-aparece` | A–B–C, luego A–C | Archivo en curso por B | Pasa al directo (`a=directo`) y el resto va por A–C |
| `bucle` | A–B, B–D, D–C | Sin ruta de un relevo; tramas fabricadas | A no envía; B dice que no a una trama «para C» y no la pasa a D; una trama que ya pasó por B se corta |
| `declina` | A–B–C y A–D–C | B baja de batería con el anuncio aún en «releva» | Negativa, veto y por D; el anuncio siguiente dice `no-releva` |
| `vieja` | A–V–C, V con el código anterior | Par de la prueba 36 | A ↔ V directo en los dos sentidos; V nunca relevo ni destino |
| `timbre` | A–B–C | `abrirCanalLlamadaPorTransporte` (llamadas) de A a C | La presencia de A llega a C y la de C a A |

No está en CI. No cubre: radios reales, la app nativa (Bluetooth y TCP de verdad), el segundo plano, más de un relevo, la
pastilla de la interfaz.
