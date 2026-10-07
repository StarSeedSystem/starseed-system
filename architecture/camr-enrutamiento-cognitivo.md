# CAMR · Enrutamiento Cognitivo Multiespectro (StarSeed OS)

> Petición de Alex (2026-10-05): en el panel de gestión de señales y enrutamiento del OS, un módulo
> de **Enrutamiento Autónomo Cognitivo Multiespectro** con:
>
> - **Modo de enlace híbrido autónomo**, con balanceo por prioridad y QoS.
> - **Capa física unificada** que abarca Reticulum/RNS (HF, VHF, UHF, LoRa), el puente de Meshtastic y
>   las mallas IP (802.11s, Babel, B.A.T.M.A.N.-adv y Yggdrasil).
> - **Radio cognitiva:** modulación automática según SNR/BER, control de potencia en autoequilibrio
>   comunitario y búsqueda dinámica de espectro limpio.
> - **Métrica híbrida:** latencia, ancho de banda y resiliencia del enlace.
> - **Planificador multitrayecto comunitario.**

## 0. Lo que ya existe (se amplía, no se rehace)

- `src/ai/astraura/mesh/`, unas 12.000 líneas:
  - `antennas.ts`: regiones con **límites legales** (frecuencias, ciclo de trabajo, potencia).
  - `bands.ts`.
  - `meshtastic-adapter.ts`, sobre `@meshtastic/core` y sus transportes serie, BLE y HTTP.
  - `simulator.ts`.
  - `decision-router.ts` y `synaptic-router.ts`.
  - `signals.ts`, `senales-enlace-malla.ts`, `senales-radio-local.ts`, `health.ts` y `radar-fusion.ts`.
- `src/components/mesh/`:
  - `red-mesh-center.tsx`: la página `/red-mesh`.
  - `antennas-panel.tsx`: selector inteligente de preset, ya con límites legales.
  - `signals-center.tsx`, `detected-signals-panel.tsx` y `mesh-control-panel.tsx`.
- `src/lib/network/`: `estadisticas-enlace.ts`, `capacidades-nodo.ts`, `red-mesh-settings.ts`,
  `neuron-network.ts` (OpenWISP) y `radio-local-cliente.ts`.

## 1. Capa de abstracción heterogénea

- Una interfaz común `EnlaceFisico` en `src/ai/astraura/mesh/camr/`:
  - `id`, `tecnologia` (rns, meshtastic, 80211s, babel, batman, yggdrasil, simulado);
  - banda y frecuencia, capacidad nominal, MTU, cifrado permitido y estado;
  - `medir() → Medicion` (RSSI, SNR, BER/PER, ruido de fondo, latencia, pérdida, tiempo de aire usado y vecinos);
  - `aplicar(params, {seco})` y `enviar(paquete, clase)`.
- **Adaptadores:**
  - Meshtastic: reutiliza `meshtastic-adapter.ts`.
  - Simulado: reutiliza `simulator.ts`.
  - Los demás hablan con el **agente local CAMR** (§4) por HTTP en `127.0.0.1:4480`: RNS (incluida la
    RNode de LoRa, HF, VHF y UHF), mallas IP en Linux/OpenWrt (`iw`, `batctl`, `babeld`) y Yggdrasil
    (su API de administración).
- **Enlace transparente:** un mensaje del OS lleva su **clase de tráfico** y el planificador (§3) elige
  la interfaz. Los mensajes que cruzan de RNS a IP o al revés se reempaquetan respetando la MTU de cada
  una (fragmentación y reensamblado en la capa CAMR).

## 2. Radio cognitiva (por antena y en tiempo real)

Motor de política puro, en `camr/radio-cognitiva.ts`: mediciones + perfil legal → parámetros
recomendados.

- **Modulación adaptativa.** Elige el preset, ancho de banda, factor de dispersión y tasa de
  codificación (LoRa) o el MCS (Wi-Fi) según el margen de SNR y la BER/PER. Usa **histéresis** (subir
  exige mejora sostenida N medidas) para no oscilar.
- **Control de potencia (TPC) con autoequilibrio comunitario.** Usa la mínima potencia que da el margen
  de SNR objetivo con el vecino más lejano necesario. Reparte con los vecinos para no ahogar la malla,
  bajando quien sobra y subiendo solo quien es puente único. **Nunca** supera el límite legal.
- **Búsqueda de espectro limpio.** Mide ocupación y ruido por canal (survey de Wi-Fi, detección de
  actividad de canal o RSSI de LoRa) y propone el canal más limpio **dentro del plan de bandas legal**.
  Cambia solo si la mejora supera un umbral y avisa a los vecinos antes, con el cambio coordinado.
- **Ganancia direccional.** Calcula la PIRE como potencia + ganancia de antena − pérdidas de cable, y
  la limita a la PIRE legal. Si la antena es orientable, recomienda el acimut hacia el vecino con mejor
  métrica.
- **Seguridad del cambio.** Cada cambio aplicado se vigila durante T segundos. Si el enlace empeora,
  **vuelve** al parámetro anterior y lo registra.

## 3. Planificador multitrayecto comunitario

- **Clases de tráfico:**
  - `control-critico`: coordinación, emergencias, latidos de la malla;
  - `mensajes`: chat, avisos;
  - `tiempo-real`: voz, llamadas;
  - `masivo`: archivos, sincronización, medios.
- **Métrica híbrida por enlace:** puntuación de latencia, ancho de banda disponible, resiliencia
  (estabilidad histórica, pérdida, redundancia de rutas) y coste de tiempo de aire.
- **Política:**
  - `control-critico` va por enlaces de **largo alcance y alta resiliencia** (LoRa/RNS), con
    **redundancia**: dos caminos si existen.
  - `masivo` va por los de **mayor capacidad** (802.11s, BATMAN, Babel, Yggdrasil), nunca por LoRa
    salvo petición expresa, y troceado.
  - `tiempo-real` va por la menor latencia estable.
  - `mensajes` va por el mejor equilibrio.
- **Equidad comunitaria:** cupos de tiempo de aire por nodo en bandas compartidas, con prioridad para
  emergencias.

## 4. Agente local CAMR (Python)

- `scripts/red/camr_agente.py` corre en el Mac, en Linux, en una Raspberry o en OpenWrt con Python.
- **Detecta lo disponible** e importa cada librería solo si hace falta:
  - `rnsd` o la librería `RNS`;
  - la librería `meshtastic` y los puertos serie;
  - `iw`, `batctl`, `babeld` y `yggdrasilctl`.
- **API en `127.0.0.1:4480`:** `GET /estado`, `GET /mediciones`, `POST /aplicar` (con `seco` por
  defecto) y `POST /enviar`. Solo escucha en local.
- **Genesis:** la ruta `/api/mando/camr` hace de proxy para el panel en el Mac. La app nativa (Tauri)
  hablará con el agente directamente.

## 5. Ley y licencias (obligatorio, lo aplica el motor)

- **Perfil regional** de `antennas.ts`, ampliado con:
  - los canales de Wi-Fi de 2,4, 5 y 6 GHz y su PIRE por región;
  - **las bandas de radioaficionado de HF, VHF y UHF**.
- **Bandas de radioaficionado:**
  - solo se activan si el operador registra su **indicativo** (licencia) en el ajuste;
  - **no se cifra el contenido** en ellas (se firma, que sí está permitido), así que el planificador
    nunca enruta por ahí tráfico cifrado ni privado;
  - identificación periódica con el indicativo, según la norma de la región.
- **ISM y LoRa:** respeta el **ciclo de trabajo** (por ejemplo, EU 868: 1 % o 10 % según la
  sub-banda) con contabilidad de tiempo de aire, la potencia máxima y la PIRE.
- **Por defecto, modo «recomendar»:** el motor propone y el usuario aplica. El **automático** solo se
  activa en bandas sin licencia con perfil regional fijado, o en bandas con licencia si el operador lo
  activa con su indicativo.

## 6. Panel en el OS

- Nueva sección **«Enrutamiento cognitivo (CAMR)»** en el centro de la red mesh (`/red-mesh`), junto a
  Antenas y Señales. Reproduce el árbol de Alex:
  - Habilitar CAMR.
  - Modo de enlace: Híbrido autónomo (QoS).
  - Capa física unificada: RNS, Meshtastic e IP mesh (802.11s / Babel / BATMAN-adv / Yggdrasil),
    marcando cuáles están disponibles de verdad en este nodo.
  - Radio cognitiva: modulación, TPC y canal, cada uno con automático o manual.
  - Métrica de tráfico.
- **Información en vivo:**
  - por enlace: métricas en tiempo real, parámetros actuales y recomendados con su porqué;
  - el registro de decisiones con sus reversiones;
  - el reparto por clase de tráfico;
  - el perfil legal activo.
- Los ajustes se guardan en `red-mesh-settings.ts` **con migración de las configuraciones guardadas**
  (regla de propagación del OS).
- **Sin hardware:** todo funciona con el simulador, con escenarios de interferencia, movilidad y caída
  de enlace, para probar y para demostrarlo.
