# Neurona insomne · siempre disponible con la pantalla cerrada (INS1027)

**Pedido de Alex (2026-10-27):** «agrega este funcionamiento nativo para las neuronas compatibles de sus capacidades
siempre disponibles aun con las pantallas cerradas, incluyendo las capacidades de los agentes y procesos programados en
segundo plano y de la actividad de la red mesh P2P compartida inteligentemente usando la red StarSeed para
potencializar sus capacidades como servidores completos de cualquier tipo de todo StarSeed OS de cada neurona y cerebro;
también inclúyelo en la librería autoactualizable» — https://github.com/krishhgg/Insomnia

## 1. Qué es Insomnia (medido el 2026-10-27)

- App de la barra de menús de macOS (Swift 6.2, MIT, Krish Garg), **experimental**. Estable `v0.1.0` (2026-10-10) y
  nocturnas diarias (`nightly-20261027-b8e7e20d617f` la última). Requiere **macOS 26 o posterior en Apple Silicon**.
  La Mac de Alex tiene macOS 26.3.1 arm64: es compatible.
- Sesiones con hora de fin: mientras duran, la Mac no duerme **aunque se cierre la tapa** (`pmset -a disablesleep 1`,
  que el instalador permite sin contraseña con una regla de sudoers en `/etc/sudoers.d/insomnia`; **cualquier programa
  que corra como la persona puede usar esa regla**). Con la tapa cerrada apaga pantalla y luz del teclado, congela con
  `SIGSTOP` las apps de su lista (Slack, WhatsApp, Discord por defecto; nunca reuniones ni grabadoras), silencia el
  audio y pone el modo de bajo consumo. Batería: bajo consumo por debajo del 40 %, fin de la sesión por debajo del
  10 %; calor serio → bajo consumo, crítico → fin. Diario de recuperación y un agente de `launchd` que deshace la
  sesión cada minuto si la app falta. Extras: saltar al punto de acceso del iPhone si cae el Wi-Fi y escribir
  `continue` en un panel de tmux marcado.
- **Sin API para empezar sesiones**: no tiene esquema de URL ni CLI de control. Deja su estado en
  `~/Library/Application Support/Insomnia/session.json` (`startedAt`, `endsAt` en ISO 8601, `extensions`) y
  `state.json` (`sleepDisabledByUs`…), solo legibles por la persona (0600).
- **Aviso del propio proyecto:** superficie estable y ventilada, nunca dentro de una bolsa; la recuperación puede
  fallar y un temporizador no es una garantía de seguridad.

## 2. Qué es una «neurona insomne» en StarSeed OS

Una neurona que **se declara siempre disponible hasta una hora** y, mientras lo es, sigue sirviendo con la pantalla
cerrada: los agentes del enjambre, los procesos programados (rutinas, directores, vigías), el servidor de su cerebro,
la Biblioteca y los archivos que comparte, y su parte de la malla P2P (relé, faros, réplicas). La red StarSeed lo sabe
y le da trabajo de servidor con preferencia; cuando se acaba la sesión o baja la batería, devuelve lo que tenía a
tiempo (relevo de la colmena, `architecture/colmena-relevo-contenedores.md`).

### Proveedores por plataforma (`capacidadInsomne(plataforma)`, PURA)

| Plataforma | Con la tapa/pantalla cerrada | Proveedor |
|---|---|---|
| macOS 26+ Apple Silicon | Sí | **Insomnia** (la persona la instala y empieza la sesión; el OS lee su estado) |
| macOS otra | Solo con corriente y pantalla externa | `caffeinate -s` (ya existe: servicio `com.starseed.despierto` de Genesis · Servidor 1.58) |
| Linux (portátil) | Sí | `systemd-inhibit --what=handle-lid-switch:sleep:idle` mientras dure la sesión |
| Windows | Sí | acción de la tapa «no hacer nada» por `powercfg` mientras dure (y se restaura) |
| Servidor (A1, VPS) | No aplica: ya es siempre encendido | — |
| Navegador / PWA | No: solo con la pestaña a la vista | Screen Wake Lock API, y se dice tal cual |
| Android / iOS | No | se dice tal cual |

Una neurona no compatible **no finge**: su ficha dice por qué y qué le falta.

## 3. Estado y señales (módulos puros donde se pueda)

- `src/lib/neurons/insomne.ts` (PURO): `EstadoInsomne = { activo, hasta, tapaCerrada?, proveedor, motivo,
  bateria?, calor? }`, `capacidadInsomne(plataforma, version)`, `politicaInsomne` (qué sigue: `agentes`, `programados`,
  `malla`, `servidorCerebro`, `biblioteca`; todo encendido por defecto) y `debeSoltarTrabajo(estado, ahora)` (quedan
  menos de 15 min, batería por debajo del 15 % o calor crítico → soltar con relevo).
- `src/lib/neurons/insomne-servidor.ts` (solo servidor, `node:fs`): lee `session.json` y `state.json` de Insomnia y
  `pmset -g assertions`; nunca escribe en la carpeta de Insomnia ni ejecuta `pmset` con sudo.
- `GET /api/neuronas/insomne` (local, como `/api/mando/*`): el estado de ESTA neurona.
- **Presencia:** `SenalesMedio` (`src/lib/neurons/senales-medio.ts`) gana `insomne: { hasta, proveedor }`; viaja con la
  presencia de la cuenta (`src/lib/neurons/presencia.ts`) y la ve cualquier neurona.

## 4. La red StarSeed lo aprovecha (inteligentemente)

- **Colmena** (`scripts/puente/colmena_logica.py`): `elegir_destino` prefiere, a igual medio, la neurona insomne cuya
  sesión dura más que la tarea; `debe_desconectarse_solo` también suelta cuando la sesión insomne termina en menos de
  5 min.
- **MetaGenesis** (`scripts/puente/nodo_metagenesis_logica.py`): una neurona insomne suma puntos de estabilidad para
  liderar y para recibir préstamos mientras dure su sesión (el A1 sigue siendo el siempre encendido de referencia).
- **Malla y apps en la malla** (`architecture/apps-en-la-malla.md`, `architecture/malla-neuronas-autovinculo.md`):
  una neurona insomne se anuncia como servidor de cerebro, de archivos y de relé hasta su hora de fin.
- **Nada se reparte a una neurona dormida**: si la presencia deja de latir, la colmena reenruta (como hoy).

## 5. Dónde lo ve la persona

- **Neuronas** (`src/components/neurons/neuronas-panel.tsx`): por neurona, «Siempre disponible (pantalla cerrada)» con
  su proveedor, hasta cuándo, qué sigue funcionando y qué falta si no es compatible. En la Mac: «Abrir Insomnia» (la
  sesión la empieza la persona en su barra de menús) y el aviso de ventilación de Apple.
- **Genesis · Servidor 1.58** (`src/components/mando/panel-servidor.tsx`): junto a «Mantener encendida», el estado
  insomne de la Mac.
- **Biblioteca:** `lib-insomnia` (`config/repos-libreria-1027.json`, autoactualizada por etiquetas estables
  `vX.Y.Z`; las nocturnas no cuentan como versión).

## 6. Lo que NO se hace (a propósito)

- **No se instala Insomnia en nombre de nadie:** su instalador pide la contraseña y deja una regla de sudoers; lo hace
  la persona con la orden de la ficha. **Tampoco se usa esa regla desde el OS** para dormir/despertar la Mac por su
  cuenta: Insomnia lleva el diario y la recuperación; un segundo dueño de `disablesleep` dejaría la Mac sin dormir.
- No se toca su lista de congelados ni su configuración.
- Linux y Windows (sección 2) son una ola propia en la app nativa (`native/src-tauri`), no esta.

## 7. Ola INS1027 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Misma cola que el Mausbot: `starseed_memory_root/olas/cola-mausbot-insomne-1027.json`. Orden: puro (A) → servidor y
ruta (B) → presencia (C) → panel de neuronas (D) → colmena y MetaGenesis (E, F) → Genesis (G).

**Verificación:** en la Mac, con Insomnia instalada por Alex y una sesión corta: la ruta da `activo: true` y la hora de
fin; la neurona sale «siempre disponible hasta HH:MM» en Neuronas y en la presencia de otra neurona; con la tapa
cerrada sigue el latido del orquestador y del vigía; al acabar la sesión, la colmena suelta y reenruta.
