# Bucle de automejora de pruebas por la malla (BAP) — contrato

> Estado: DISEÑO de la dirección para la ola BAP1127 (2026-11-27). Base: HEAD `0835e0e5d` y seis auditorías de solo lectura (actualización, pruebas, malla, IA local, automejora, dirección), con los puntos clave re-comprobados en código. Nada se ejecutó para escribirlo. «Sin comprobar» = no leído en código. «Sin dato» = no medido. Su §4 sustituye a lo desactualizado de `architecture/actualizaciones-por-capas-sop.md` §4 y `architecture/apps-autonomas-sin-internet.md:32` (el canal de capas YA está encendido: `vars.SERVIDOR_CAPAS_CANAL = 1`).


## C. Correcciones de la crítica adversarial (2026-11-27) — MANDAN sobre el resto del documento

> Un crítico independiente comprobó este diseño contra el código (HEAD `80581291b`) y lo devolvió con 13 problemas graves. Estas correcciones están verificadas con cita y **prevalecen** sobre cualquier párrafo posterior que las contradiga. Cada tarea del enjambre debe volver a anclar sus citas con `grep` en la HEAD de su rama.

1. **Presencia sin capa (antes BAP1127C).** `v.interfaz` es `OS_VERSION`, una constante (`src/lib/actualizaciones/versiones-locales.ts:36`, `src/lib/version/os-release.ts:6`), y no hay entrada «servidor». El empuje por la malla necesita primero la build REAL de la capa: `web_corre` de `servidor_local_estado` → nueva entrada `servidor` en versiones-locales y campo `capaBuild` en `CapacidadesNodo` (BAP1127H). El empuje (BAP1127C) depende de eso.
2. **Humo (BAP1127G).** `version.json.build` es aleatorio (`scripts/gen-version.mjs:13`) y la capa se nombra con `.next/BUILD_ID` (`native/servidor-local/capa.mjs:290`): NO se comparan. El humo compara el `sha` del `/version.json` que sirve el Node local con el `public/version.json` empaquetado dentro de la propia capa (`servidor_capas.rs:159`) o con el commit del manifiesto firmado.
3. **Vigía.** Ya lee cada 5 min el `/version.json` publicado y busca al momento si difiere (`servidor_capas.rs:1313-1333`, `servidor_relevo_logica.rs:22,139-142`). Con anillo: en apps de prueba la referencia es el puntero de prueba; en las globales no se busca otra vez si el canal ya respondió «al día» para esa publicada. `MIRAR_WEB_MS` NO se toca. La web y la PWA no pasan por el anillo (autopublicar → Vercel).
4. **Órdenes de prueba (BAP1127J).** No se crea ruta ni cola nuevas: se generaliza `/api/banco-llamadas/route.ts` + `src/lib/banco-llamadas/actor.ts`/`app.ts` (guardas `mandoHabilitado`, `esPeticionDeEstaMaquina`, `enMac`, `origenPropio`; latido de Rust porque macOS frena `setInterval`) con el tipo de orden `prueba-control`. `STARSEED_APP_NATIVA` solo existe al compilar (`next.config.ts:10`): no sirve de puerta en ejecución.
5. **Ejecutor `prueba-control` (BAP1127I).** `mandarOrden` espera 15 s (`src/lib/control-remoto/canal.ts:27,345`) y la prueba dura 10-120 s: contesta «aceptada» al instante y el fin se da por una línea del registro. Hace falta sesión Mac→origen y origen→destino aceptadas con permiso encendido (`sesion.ts` pasos 2, 4 y 13); se abre con `SesionHacia` como el banco de llamadas.
6. **Contexto de BitNet (BAP1127M/N).** El ctx es TOTAL y se reparte entre slots: 8 GB → 512 con 1 slot; 16 GB → 1536 entre 3 = 512 por slot. Presupuesto = ctx_por_slot − n_predict − margen; con 512 por slot: prompt ≤ ~600 caracteres y `n_predict` ≤ 128, o BitNet solo en nodos con ≥1024 por slot. Marca del guardia: `/tmp/starseed-llama-server-congelado-por-el-guardia` (importar `MARCA`/`MOTORES` de `guardia-memoria.py`). La cesión a la conversación vive en `prioridad_conversacion.py`.
7. **Censo.** Mientras «Diagnóstico de pruebas» esté encendido: latido de censo cada 60 s y línea inmediata al cambiar `capaBuild` (sin freno de 5 min). «Actualizado» = censo con `capa=build` visto DESPUÉS de la promoción.
8. **Retirada y promoción firmadas.** La clave del updater solo vive en los secretos del CI: promover y retirar son un `workflow_dispatch` (`capa-promover.yml`) que firma en el CI. Retirar es acción manual de la dirección o de Maggasukha, nunca del bucle.
9. **Pruebas de Rust en la CI.** No `cargo test` de golpe: `rustc --edition 2021 --test` por cada `*_logica.rs` solo-std (como dicen sus cabeceras), primero con `continue-on-error`, bloqueante tras una pasada verde.
10. **`native-build.yml`** (job `servidor-capa`, :651-680) también respeta el anillo.
11. **Firmas (fase 4).** En esta ola: UNA atestación de máquina («pruebas») + el Aprobar de Maggasukha. El multirrol se difiere hasta tener comprobaciones deterministas por rol y nodos independientes; si no, sería una firma ceremonial.
12. **Espejo del registro (BAP1127D).** Por `src/lib/malla/transporte-universal.ts` (local, TCP nativo, BLE, WebRTC), SOLO al par con rol director. Lo espejado va a un archivo aparte por aparato con rotación propia (BAP1127Y), no al `enlaces.log` (rota a 1 MiB, `ble.rs:600`). Formato real de lo anexado hoy: `<iso> web (nombre) <iso> …`, ≤60 líneas y 400 caracteres (`ble.rs:1763-1775`). WebRTC se señaliza por Supabase: sin internet solo valen los otros transportes.
13. **No duplicar `CapacidadesNodo`** (`src/lib/network/capacidades-nodo.ts:27-52`: `ramLibreMb`, `cpu`, `discoLibreGb`, `bitnet{tokPorS,ctx,ocupado}`, `needle`, `capas`, `tokS`). Se extiende con `capaBuild`, `appVersion`, `rol`, `slotsLibres`; nada de `salud-neurona.ts` ni `perfil-ia.json` paralelos.
14. **Ids de prueba incompatibles** (batería `B1-MT-A1…`, registro `B4-MAC-A-TABLETA…`, comprobaciones «prueba N»): tabla de equivalencias versionada en `config/pruebas-equivalencias.json` y batería obligatoria por versión.
15. **Puertas protegidas (antes BAP1127Q)** van AL FINAL de la ola, con el veto limitado a commits de tareas BAP y un control en Genesis para permitir un sha concreto antes de encenderlo.
16. **Lanzamiento oficial automático.** `config/lanzamientos.json` tiene `auto_por_defecto=true` y `director_lanzamientos.py` (pasada, :113-115 y :377-390) lanzaría solo al acabar una lista; hoy lo frena la pausa. Maggasukha pidió el lanzamiento automático por sistema operativo (05-11), así que es SU decisión: hasta que la tome, la pausa se mantiene y el bucle se detiene en «lista para aprobar».
17. **Propuestas → enjambre.** Hoy es el botón humano «Mandar al enjambre» (`src/components/mando/panel-capas-red.tsx:432-434`; `automejora_mac.py` las deja fuera de `olas/` a propósito). Encolarlas solas es decisión de Maggasukha. Formato de partida: `automejora_logica.propuestas_de_ayuda`.
18. **Aprendizaje honesto.** Lo que «aprende» esta ola es memoria de casos con desenlace (experiencias + `aprendido.jsonl`), no entrenamiento de pesos. El cambio de reparto 70/30 va en tarea propia con época versionada y despliegue al A1 incluido.
19. **Tiempo real.** Desde que el arreglo se integra en `main` hasta que el aparato lo tiene: ventana de autopublicar (≤20 min) + CI (6-8,5 min) + capa (CI) + detección. Se mide desde la integración. «Casi instantáneo» de verdad exige construir la capa por `workflow_dispatch` sobre el sha integrado o en el A1 (decisión de Maggasukha, segunda clave solo-pruebas).
20. **Dónde se prueba.** En la Mac solo pruebas dirigidas y ligeras: `npx vitest run <archivo>`, `python3 -m pytest <archivo>`, `rustc --edition 2021 --test <modulo>_logica.rs -o /tmp/x && /tmp/x`. NUNCA `cargo build`, `cargo test` del crate, `next build` ni servidores. A1 medido el 27-11: 2 núcleos, 11 GB de RAM (≈3 libres), 8,7 GB de disco libre — no sirve hoy de banco de pruebas pesado.
21. **IA local por SO.** El instalador en Python cubre macOS y Linux; Windows y Android quedan fuera de esta ola (Android solo Needle y delega en pares). El runtime de BitNet se toma de `nodo-bitnet.sh` del repo «IA 1.58 bit» fijado por commit y SHA si Maggasukha lo aprueba.
22. **Disco.** La precondición de disco mira el nodo donde se trabaja, no la Mac de dirección (medido 7,5-9,4 GB libres).


## D. Decisiones de Maggasukha (2026-11-27: «de tus preguntas haz lo que recomiendes»)

Adoptadas las recomendaciones de la dirección. Mandan junto con la sección C.

1. **Anillo de prueba para el canal global: SÍ.** Al canal global de capas solo llega lo promovido tras pasar la batería en el anillo de prueba. La variable del repo `SERVIDOR_CAPAS_ANILLO=prueba` se enciende **cuando BAP1127B (publicar al anillo) y BAP1127X (promover/retirar en el CI) estén integrados y una promoción de prueba haya funcionado**; antes no, para no dejar a las apps globales sin capas. La web y la PWA siguen saliendo por autopublicar → Vercel.
2. **Lanzamiento oficial: se detiene en «lista para aprobar».** `config/lanzamientos.json` pasa a `auto_por_defecto: false` (hecho, DIR1127B). La versión pública sale solo con el Aprobar de Maggasukha desde Genesis; el bucle la prepara con su evidencia y se la pide una vez en «Te toca a ti». El interruptor del panel sigue existiendo por si él lo vuelve a encender.
3. **Propuestas del bucle → enjambre: solas, con topes.** Una propuesta con evidencia (id de prueba, registros, umbral incumplido) entra sola en la cola como tarea BAP de prioridad baja, con un máximo de 3 por iteración y nunca sobre archivos protegidos (§8); pasa las mismas puertas que cualquier tarea (tsc, vitest/pytest, revisión, commit-seguro, CI). El botón «Mandar al enjambre» queda para lo que no tenga evidencia. Nada de eso es una versión pública (punto 2).
4. **Capa rápida compilada en el A1 con una segunda clave: NO por ahora.** El A1 mide 2 núcleos, 11 GB de RAM (≈3 libres) y 8,7 GB de disco libre; la capa se sigue construyendo en GitHub. Se revisa cuando haya un nodo con recursos (o la Maggabox reparada como espejo LAN, decisión aparte).
5. **Umbrales de la batería B4:** **≥5 cuadros/s** por la malla para que una capa pase el anillo de prueba; **≥15 cuadros/s** (objetivo de PRU1124A) para que una versión sea candidata a pública. Apertura ≤2 s, B1 enlace <10 s, B5 reanudación <5 s, B3 hash exacto, llamadas con los umbrales del banco.
6. **Instalador de BitNet:** desde el repo «IA 1.58 bit» (`nodo-bitnet.sh`) **fijado por commit y SHA**, sin copiar el código; macOS y Linux en esta ola.
7. **Firmantes:** una atestación de máquina («pruebas») + el Aprobar de Maggasukha (C.11); el multirrol se añade cuando haya comprobaciones deterministas por rol.
8. **Interruptores por aparato** («Diagnóstico de pruebas», «Recibir diagnóstico (dirección)», permiso de control): solo los enciende Maggasukha en cada aparato; la dirección se los recordará en «Te toca a ti» cuando el bucle los necesite.
9. **Dónde corre la ola:** el enjambre de la Mac con pruebas dirigidas ligeras (C.20); lo pesado, en la CI de GitHub.

## 0. Petición y alcance

Maggasukha (27-11): actualizar las neuronas al instante con los cambios de las pruebas P2P; que MetaGenesis se autovincule a los aparatos por la malla, haga los controles, analice registros y señales (procesamiento, almacenamiento, red); que agentes locales BitNet 1.58 / Needle en cada nodo propongan mejoras; volver a probar y repetir hasta una versión que pase todo; al final firman directores y supervisores y se lanza como versión pública. Lo más fundamental primero.

En ingeniería: un bucle cerrado **probar → medir → analizar → proponer → integrar por las puertas → actualizar aparatos → volver a probar**, donde la verdad es la prueba real (con números), los agentes locales solo proponen y la versión pública solo sale con la palabra de Maggasukha.

Esta ola: 22 tareas `BAP1127A…V` en 4 fases (§14). Fuera de la ola: §4.6 y §13.

## 1. El bucle de un vistazo

```
 arreglo integrado en main (puertas del enjambre)
        │
        ▼
 CI servidor-capa.yml ──► candidata-servidor.json        (nadie la lee)
        │                     │  el bucle promueve SOLO sin ronda activa
        │                     ▼
        │            latest-servidor-prueba.json ──► apps «-prueba.N» (miran cada 2 min + empuje por la malla)
        │                                                │ relevo en momento seguro → salud → HUMO HTTP
        │                                                │ (fallo: vuelta atrás local · retirada remota firmada)
        │                                                ▼
        │                      censo «capa=<build>» de cada aparato → espejo del registro → enlaces.log de la Mac
        │                                                ▼
        │       ronda.py ► lanzar (buzón de órdenes) / espera-manos ► recoger (espejo; SSH/adb respaldo) ► EVALUADOR
        │                                   │ verde                                  │ fallo / regresión
        │                                   ▼                                        ▼
        │        libro de firmas ► promover a global ► Aprobar      analista local: reglas → Needle → BitNet 1.58
        │                                                                             ▼
        │                                                      propuesta JSON ► tarea del enjambre (olas/)
        └─────────────────────────────────────────────── puertas ◄──────────────────┘   (tope 8 iteraciones)
```

## 2. Qué existe y se reutiliza (no se duplica)

| Pieza | Dónde | Uso en el BAP |
|---|---|---|
| Vigía de capas, verificación minisign + SHA por archivo, pendiente→activa→anterior→instalador | `native/src-tauri/src/servidor_capas.rs:1170` buscar, `:578` verificar_firma, `:727` elegir, `:800` tras_lista, `:839` tras_fallo, `:1092` extraer, `:1301` iniciar_vigia | Base de la actualización rápida; la verificación no se toca |
| Canal y constantes | `servidor_capas_logica.rs:44` CANAL; `:54-63` salud 60 s, estable 30 s, primera mirada 90 s, 6 h, 30 min | Se añade el puntero de prueba |
| Sobrescrituras solo en depuración | `servidor_capas.rs:374-399` (permitir_local, STARSEED_CAPAS_PRIMERA_MS, STARSEED_CANAL_SERVIDOR) | Prueba de que las release no aceptan otro canal: el anillo va en código |
| «Buscar ahora» sin suelo | `servidor_local.rs:172-183` → `pedir_busqueda` (`servidor_capas.rs:262`) | Lo dispara el empuje por la malla |
| Relevo en momento seguro | `src/lib/nativa/relevo-capa-cliente.ts`; sondeo 30 s (`relevo-capa.ts:73`) | Sin cambios de política |
| Publicación firmada | `native/servidor-local/publicar-capa.sh:46-66`; `.github/workflows/servidor-capa.yml:19-28` (gate `vars.SERVIDOR_CAPAS_CANAL`) | Se añaden anillo, promover y retirar |
| Patrón «el mayor de dos canales» | `canal_actualizacion.rs:12-16`, `canal_actualizacion_logica.rs:36-47` | Lo copia el anillo de capas |
| Presencia con versiones por capa | `src/lib/neurons/presencia.ts:32-33,59,222` | Empuje |
| Ficha + latido por DataChannel cada 30 s | `src/lib/network/malla-neuronas.ts:165-216` | Censo de salud sin Supabase |
| Espejo continuo del registro (hoy SOLO Bluetooth) | `src/lib/malla/registro-enlace-ble.ts:194-271`; `src/lib/malla/bluetooth-directo-motor.ts:996-1002`; `ble.rs:1758` ble_registro, `:1763` ble_registro_anexar, `:1869-1876` cola_de_registro | Se generaliza a toda la malla |
| Control firmado y sellado, vocabulario cerrado | `src/lib/control-remoto/niveles.ts:199-300`, `canal.ts`, `orden.ts`, `ejecutores.ts` | Se añade `prueba-control` |
| Validador de prueba-control (PRU1126A parte 1) | `src/lib/control-remoto/prueba-control.ts:14-15` | Lo usa el ejecutor (parte 2) |
| Conductor de batería | `scripts/puente/pruebas_malla.py` (cmds `:381-611`, evaluar_patrones `:111`, SSH/adb `:254-305`, `lanzar` prometido en `:12` sin implementar, constantes `:51-54`) | Registro tolerante, recoger por espejo, `lanzar`, evaluar con números |
| Batería ejecutable | `starseed_memory_root/pruebas/bateria-1118.json` (B1-B5, criterios debe/no_debe por aparato) | Umbrales numéricos opcionales |
| Umbrales de llamadas | `scripts/puente/banco_pruebas_logica.py:423-511` (regla), `:54` (limpiar) | Se fusionan en el evaluador |
| Director de pruebas | `director_pruebas.py` (compilar `:194-198`, pedir-arreglo `:515-538`); `director_pruebas_logica.py:12-19` | Llama a una pasada del bucle; pedir-arreglo también encola |
| Ronda | `scripts/puente/ronda.py:54-55` | El bucle abre y cierra rondas |
| Automejora | `automejora_logica.py:17` CAPAS_VALIDAS, `:29`, `:64-66` reparto, `:168` propuestas_de_ayuda, `:255` nueva_version; `experiencias.py:77,90,103`; `jev_desenlaces.py`; `jev_reservadas.py` | Capa `prueba` con desenlaces reales |
| IA local | `config/capas-astraura.json`; `scripts/puente/instalar_modelo.py`; `jev_local.py` (BitNet :8790, concesión de conversación); `ollama_instalador.rs:77-79`; repo aparte «IA 1.58 bit» (`nodo-bitnet.sh`, `bitnet_cpp_manager.py`) | Perfil único, instalador por SO, pool, analista |
| Puertas | `scripts/enjambre/starseed-enjambre.py`; `commit-seguro.py`; `autopublicar.py` + `produccion_puertas.py`; `ci.yml` | Únicas vías de integración |
| Lanzamiento oficial | `lanzamientos_logica.py:31` FASES, `:410` decidir_aprobacion, `:446` cabeza_para_preparar; `director_lanzamientos.py:274-282` _publicar; Aprobar de Genesis (centro-versiones-1105.md §10.2) | Compuerta de evidencia + firmas |
| Criptografía disponible | `genesis_firma_logica.py:29-31` (cryptography, ECDSA) | Libro de firmas |

Correcciones a las auditorías (comprobadas): (a) los registros SÍ viajan entre aparatos, pero solo por el canal rápido Bluetooth; (b) el reparto de la automejora está en `automejora_logica.py:66` (`bucket < 70` sobre 0-255 ⇒ ~27 % / ~73 %); (c) ninguna puerta ejecuta las pruebas Rust de `native/src-tauri`: `ci.yml:190` solo `cargo check`, `commit-seguro.py:151-160` ejecuta pruebas TS, el único `cargo test` es de memvid (`comprobar-nube.yml:115-117`).

## 3. Huecos que cierra

1. Un único puntero global (`servidor_capas_logica.rs:44`): sin anillo de prueba, sin canaria remota y sin forma de congelar la capa durante una ronda.
2. Solo sondeo (90 s / 5 min / 6 h); un aparato no sabe que otro ya tiene la capa.
3. Vuelta atrás solo por caída del Node; sin retirada remota; la salud no comprueba que se sirva la build esperada.
4. Registros por SSH/adb desde la Mac; espejo solo por Bluetooth; `evidencias/` vacía; `registro.jsonl` sin `tipo` (15 líneas) ⇒ `siguiente` e `informe` ciegos.
5. Solo Mac→X se lanza desde la dirección; `prueba-control` sin ejecutor ni `lanzar`.
6. Evaluación por 1-2 regex sin números; dos evaluadores separados.
7. Ninguna neurona publica memoria, disco, carga o capa en vivo.
8. Sin instalador de IA local por SO en el OS; dos tablas de perfil BitNet incompatibles; nadie analiza registros de pruebas con IA local.
9. Automejora sin entradas (3,4 % de experiencias con desenlace; ninguna directiva escrita jamás).
10. El lanzador no lee evidencia (`lanzamientos_logica.py:410`; centro-versiones-1105.md:543-544); no hay firmas por director; `auto_por_defecto = true` en `config/lanzamientos.json`.
11. Ninguna puerta corre `cargo test` de la app nativa.

## 4. Actualización casi instantánea de las neuronas de prueba

### 4.1 Qué vía para qué cambio

| Cambio | Vía | Tiempo medido | Manos |
|---|---|---|---|
| Interfaz y servidor Next | Capa del servidor local (`servidor-capa.yml`) | CI 5 min 53 s – 8 min 25 s (6 ejecuciones del 26/27-11) + detección + descarga + relevo | ninguna |
| Rust, Kotlin, permisos | Instalador de prueba (`native-build.yml`, canal=pruebas) | CI 21 min 51 s – 23 min 41 s | Android: el sistema siempre pide confirmar (`canal_actualizacion.rs:12-16`) |
| Navegador / PWA | Vercel + SW (`register-sw.tsx:114,190-193`) | tras autopublicar (ventana 20 min, `autopublicar.py:62`) | ninguna |

Regla: los arreglos del bucle se diseñan para caer en la capa siempre que se pueda; lo nativo se agrupa y se compila solo la última versión (regla de Maggasukha del 08-11).

### 4.2 Anillos

Tres punteros en el Release `servidor-local`, mismo formato que `latest-servidor.json` (FORMATO 1, `servidor_capas_logica.rs:47`):

- `candidata-servidor.json` — lo escribe el CI en cada push a main cuando `vars.SERVIDOR_CAPAS_ANILLO == 'prueba'` (BAP1127B). Ninguna app lo lee.
- `latest-servidor-prueba.json` — lo mueve SOLO el bucle con `publicar-capa.sh promover <build> --a prueba`, nunca con una ronda activa. Lo leen solo las apps cuya versión contiene `-prueba.`, que toman el más nuevo entre este y el global (BAP1127A).
- `latest-servidor.json` (global) — con el anillo encendido, solo avanza por promoción tras una batería verde (decisión 1). Sin la variable, todo sigue como hoy.

Promover no vuelve a firmar: la firma vive en el manifiesto y el puntero solo apunta; `decidir()` nunca retrocede a un `creado_ms` menor. La poda (`GUARDAR_CAPAS = 4`) nunca borra una build apuntada por un puntero. Orden de activación: primero una compilación de prueba con BAP1127A instalada en las tres neuronas, después la variable.

### 4.3 Detección y empuje

- Apps de prueba: puntero de prueba cada 2 min (`CADA_MS_PRUEBA`) y web publicada cada 60 s; las demás apps, igual que hoy (BAP1127A).
- Empuje: si un par de la misma cuenta anuncia (presencia `v` o ficha `salud.capaBuild`) una capa distinta, se invoca `servidor_local_buscar` con suelo de 60 s por build (BAP1127C, BAP1127H). Solo provoca una búsqueda; aplicar sigue dependiendo de la verificación y del momento seguro.
- Nada nuevo se escribe en Supabase.

### 4.4 Seguridad de la capa rápida

- Verificación idéntica, sea cual sea el origen.
- Humo antes de promover una pendiente (BAP1127G): `/version.json` del Node local debe traer la build de la capa y la página principal debe responder 2xx/3xx; si no, `tras_fallo` (vuelta atrás existente) y línea `[capas] humo fallo motivo=…`.
- Retirada remota (BAP1127F): `retiradas.json` = `{formato:1, creado_ms, builds:[…]}` + `retiradas.json.sig` (minisign con la clave del updater; el comentario firmado nombra el archivo). Una build retirada se marca mala; si es la activa, vuelve a la anterior en el siguiente relevo; si la anterior también, al instalador.

### 4.5 Presupuesto de tiempo (estimación; el censo la medirá)

push → CI 6-8,5 min → el bucle promueve en ≤1 min si no hay ronda → la primera app de prueba lo ve en ≤2 min y las demás en segundos por el empuje → descarga (capa ≈45-50 MB según el contrato §10; sin dato hoy) → relevo ≤30 s → salud ≤60 s + humo ≤20 s. Orden de magnitud: **9-12 min tras el push**, frente a 10-16 min estimados hoy, y con confirmación por aparato en lugar de suposición. Bajar de ahí exige construir la capa fuera de GitHub (decisión 2).

### 4.6 Después de esta ola

Espejo LAN de capas en la Maggabox (una descarga por casa, sin internet); capas de prueba construidas en el A1 con clave «solo pruebas»; capa de modelos de IA con el mismo manifiesto firmado; directivas y umbrales empujados como datos por la malla; actualizar la app Linux por SSH como acción cerrada del director.

## 5. Canal de control y registros por la malla

### 5.1 Espejo del registro por cualquier transporte (BAP1127D)

- Generaliza el espejo BLE (`registro-enlace-ble.ts:194-271`) al DataChannel `starseed` de la MISMA cuenta.
- Mensaje `{t:'registro.espejo', desde:<ISO>, l:[líneas]}` ≤16 KB, cada ≥15 s, nunca compitiendo con voz o vídeo, sin reenviar líneas que ya empiezan por `(nombre) ` (sin bucles).
- Emite solo con el interruptor local «Diagnóstico de pruebas»; recibe solo con «Recibir diagnóstico (dirección)». Ambos apagados por defecto.
- Saneado en origen: sin IPs, rutas de usuario, correos, nada con forma de clave o token, ni contenido (regla de `malla-registro.ts`).
- El receptor anexa con `ble_registro_anexar` y el prefijo `(nombre) `: todo acaba en el `enlaces.log` de la Mac, que el director ya lee.

### 5.2 Censo de neurona (BAP1127H)

`FichaDispositivo.salud` opcional = `{capaBuild, appVersion, memLibreMb, discoLibreGb, cpuCarga, ia:{capas, slotsLibres}, rol}`; lo que no se mide queda vacío. Línea al registro al cambiar (máx. una cada 5 min):

`censo neurona=<nombre> rol=<aparato-de-prueba|director|-> plataforma=<p> app=<versión> capa=<build|-> mem=<MB|-> disco=<GB|-> ia=<ids|->`

Sin IP ni huellas completas (≤8 hex).

### 5.3 Recoger y registro único (BAP1127E)

`recoger` toma primero, del `enlaces.log` de la Mac, las líneas del espejo de cada aparato dentro de la ventana; SSH/adb solo si no hay ninguna. Siempre escribe `evidencias/<id>-<fecha>/resumen.json` con la fuente usada por aparato (espejo, ssh, adb o sin-acceso). Registro tolerante: la línea manual `{fecha, version, ronda, prueba, resultado, nota}` se lee como `{tipo:'fin', …}`; las nuevas son `{tipo:'inicio'|'fin', id, version, capa, resultado, veredicto_sha256, nota, t}`. `registro.jsonl` no se reescribe.

### 5.4 Buzón de órdenes de prueba (BAP1127E, BAP1127J) y ejecutor (BAP1127I)

- Python escribe `~/.starseed/produccion/ordenes-prueba/<id>.json` = `{formato:1, id, accion:'prueba-control', origen:<nombre>, destino:<nombre>, duracion_ms (10000-120000), fuente:'auto'|'proyeccion'|'malla', creado_ms, caduca_ms (≤5 min)}`.
- La app de la Mac de dirección (servidor local, `STARSEED_APP_NATIVA=1`, interruptor de dirección encendido) lo lee por una ruta API local, valida con `prueba-control.ts`, resuelve nombres a huellas en su propia lista de neuronas (si hay ambigüedad, rechaza), firma y envía por el canal de control existente, y deja `<id>.resultado.json`.
- El ORIGEN ejecuta `prueba-control` por el mismo camino que la pantalla «Controlar». Si un permiso de control está apagado responde `espera-permiso`; con una llamada en curso, `ocupado`. Nadie enciende permisos a distancia.

### 5.5 Permisos

| Permiso | Por defecto | Quién lo enciende |
|---|---|---|
| Control (ver/controlar) | apagado | el dueño, en el aparato |
| Diagnóstico de pruebas (emitir espejo y censo) | apagado | Maggasukha, en cada aparato de prueba |
| Recibir diagnóstico (dirección) | apagado | Maggasukha, en la Mac de dirección |
| Terminal (modificar) | apagado; fuera de esta ola | — |

## 6. IA local en cada nodo

### 6.1 Qué corre dónde (honesto)

| Medio | Needle 3 | BitNet b1.58 2B | Medido |
|---|---|---|---|
| Mac (arm64, 8 GB) | sí | 1 slot, ctx 512 | ~9 tok/s con 2 hilos; compite con el enjambre |
| Linux x86/ARM (Maggabox, A1) | sí | sí, vía `nodo-bitnet.sh` (otro repo) | sin dato de tok/s |
| Contenedor de nube 2 vCPU | sí | sí | 13,7 tok/s, 1290 MB RSS, arranque 4 s |
| Windows | WASM | sin ruta (sin dato) | Ollama guiado (`ollama_instalador.rs`) |
| Android (tableta, Maggadroid) | WASM | NO (sin soporte oficial) | delega en pares |
| Navegador | WASM 2-6 capas | no | Bonsai ONNX WebGPU |

### 6.2 Perfil único (BAP1127K)

`scripts/puente/perfil_ia_nodo.py` → `~/.starseed/perfil-ia.json`. Tabla canónica = la del backend, porque es la que tiene fallos medidos: ≤8,5 GB → 1 slot, ctx 512, 2 hilos; ≤16,5 GB → 3 slots, ctx 1536, min(4, núcleos/2) hilos; más → 5 slots, ctx 4096, min(6, núcleos/2) hilos; slots ≤ max(1, núcleos/2). **Agentes BitNet simultáneos de un nodo = sus slots.** Más agentes = más nodos por la malla, no más slots (en 8 GB, 2 slots partieron el ctx y tiraron el servidor). El otro repo adopta el JSON más adelante (decisión 3).

### 6.3 Instalación por SO (BAP1127O)

Plan puro por SO con tamaños y SHA de `config/capas-astraura.json`; aplicar exige `~/.starseed/visto-bueno-ia.json` con las capas aprobadas; descarga con `instalar_modelo.py` (SHA, anterior, atómico; se corrige el nombre fijo `modelo.dat`). macOS/Linux: Needle + GGUF i2_s + runtime vendorizado (pendiente de la decisión 3); Windows: Needle + Ollama guiado; Android/web: solo Needle. Las capas «por-verificar» (Colibri, Ollama) nunca se instalan solas.

### 6.4 Pool (BAP1127M)

Cola en archivos con prioridad conversación > pruebas > fondo; concurrencia = slots del perfil; no empieza trabajo si hay concesión de conversación (`~/.starseed/conversacion.json`, patrón de `jev_local.py`) o si el guardia congeló BitNet (`/tmp/starseed-bitnet-congelado-por-el-guardia`). Anota tok/s medidos.

### 6.5 Analista de pruebas (BAP1127N)

Tres etapas:

1. Reglas deterministas (siempre): agrupa patrones fallidos y métricas fuera de umbral, calcula `huella_fallo` y busca en `starseed_memory_root/pruebas/aprendido.jsonl`.
2. Needle clasifica el área, si está instalado.
3. BitNet redacta hipótesis y cambio con salida JSON restringida y un prompt de ≤1400 caracteres que empieza marcando la evidencia como DATOS.

Sin modelo, la propuesta lleva solo la etapa 1 y `hipotesis: 'sin modelo local'`.

Propuesta: `{formato:1, id:'BAPP-<huella8>-<iter>', origen:'prueba:<id>@<build>', huella_fallo, prueba, aparatos, evidencia:{carpeta, sha256, extracto ≤40 líneas saneadas}, metricas, hipotesis ≤300, archivos ≤3, cambio ≤600, prueba_que_verifica, riesgo, reservada, proponente:'reglas'|'needle'|'bitnet@<nodo>'}`.

### 6.6 Aprendizaje (BAP1127L y el bucle)

- Capas `juicio` y `prueba` en `CAPAS_VALIDAS`; cada prueba cerrada pasa a `experiencias.py` con su desenlace REAL (nunca la opinión de Jev).
- `aprendido.jsonl`: `{huella_fallo, propuesta, integrada, mejoro}`; el analista lo consulta primero.
- Reparto 70/30 corregido (`int(sha[:8],16) % 100 < 70`) y filtro por capa.
- Sin entrenamiento de pesos ni adaptadores (reservadas `entrenar-laya`, `afinar-adaptador`). Meta^n sigue para las pautas de juicio; su proponedor no cambia en esta ola.

## 7. La máquina del bucle (BAP1127S)

Estado en `~/.starseed/produccion/bap-estado.json`. Una pasada por minuto, llamada desde la pasada del director de pruebas (BAP1127R). Interruptor `~/.starseed/produccion/bap.json {activo, promover_global}`, apagado por defecto.

| Estado | Sale cuando | Hace |
|---|---|---|
| espera-candidata | hay candidata más nueva que la última probada, o una versión nativa de prueba publicada | — |
| promoviendo | no hay ronda activa | `publicar-capa.sh promover <build> --a prueba` |
| actualizando | el censo de cada aparato requerido dice `capa=<build>` y es de hace <120 s (tope 15 min) | motivo «aparato X no actualiza» |
| precondiciones | disco ≥10 GB, aparatos con censo vivo, diagnóstico encendido, sin otra ronda | lista de lo que falta |
| probando | todas las pruebas de la ronda lanzadas o en `espera-manos` | `ronda.py`; `pruebas_malla.py lanzar/empezar` |
| evaluando | veredicto de cada prueba | `recoger` + evaluador |
| verde | todo ok | firmas (§9); promover a global si `promover_global` |
| analizando | hay propuestas | analista en el nodo con slot libre (A1 primero, por SSH como `automejora_mac.py`) |
| esperando-integracion | tareas BAPF integradas y nueva candidata | tareas a `olas/` como «Mandar al enjambre» |
| parado | tope o huella repetida | aviso al Director presidente con la evidencia |

Topes: 8 iteraciones por versión; la misma `huella_fallo` 3 veces seguidas ⇒ parado y escala. Un arreglo integrado que toca `native/` ⇒ `director_pruebas.py pedir compilar` (existente) y espera. Lo que necesita manos (permisos, aceptar, la instalación en Android) ⇒ `espera-manos`, con la instrucción exacta por el canal del Director presidente y Telegram.

## 8. Jueces y puertas

| Paso | Quién | Cómo |
|---|---|---|
| Proponer | analista local (reglas/Needle/BitNet) | JSON; jamás ejecuta código |
| Escribir el cambio | enjambre (modelos gratis; sonnet para Rust/arquitectura) | tareas BAPF con la evidencia en el prompt |
| Juzgar el código | puertas deterministas | tsc → vitest/pytest → revisión cruzada → commit-seguro (cerrojo integrar) → CI (tsc, test, mesh-core, next build, cargo check + **cargo test *_logica**) |
| Juzgar la versión | evaluador con umbrales (BAP1127P) sobre la prueba real | sin datos ⇒ `sin-datos` (nunca ok); prohibido o fuera de umbral ⇒ fallo; regresión >10 % ⇒ fallo |
| Frenar | Jev | solo veta (≥0,95); nunca convierte un no en sí |
| Publicar web | autopublicar | sin cambios |
| Publicar versión oficial | Maggasukha (Aprobar) | §9 |

Archivos protegidos (BAP1127Q), vetados en `analizar_lote` salvo un sha permitido por Maggasukha: `scripts/puente/autopublicar.py`, `produccion_puertas.py`, `commit-seguro.py`, `libro_firmas.py`, `evaluador_pruebas_logica.py`, `lanzamientos_logica.py`, `jev_reservadas.py`, `bap_bucle_logica.py`, `config/firmantes.json`, `.github/workflows/*`, `starseed_memory_root/pruebas/bateria-*.json`. `propuesta_bap` no crea tareas sobre ellos.

Umbrales por defecto (propuestos, decisión 6): B1 enlace ≤10 s; B4 apertura ≤2000 ms y ≥5 cuadros/s por la malla; B5 reanudación ≤5 s; B3 hash exacto; llamadas: los de `banco_pruebas_logica.regla`.

## 9. Firmas y lanzamiento público

- Libro por versión `~/.starseed/produccion/firmas/<version>.jsonl`, encadenado: `{v:1, version, sha, rol, huella, evidencia_sha256, t, prev, firma}` con ECDSA P-256 (`cryptography`). Privada por rol en `~/.starseed/firmas/<rol>.pem` (0600) o en una variable de entorno; públicas en `config/firmantes.json` con `requeridos`.
- Roles requeridos propuestos: pruebas (batería verde con evidencia), malla (checklist de `directores_especialidad.py`), producción (CI + humo del sha), supervisor (la evidencia corresponde a la build censada y los hashes cuadran), presidente (cierra). Jev aconseja y no firma.
- Honestidad: en esta ola, varias firmas las emite el mismo anfitrión con claves distintas por rol. Separan responsabilidades y dejan rastro, pero no son independencia real; esta llega cuando cada rol firme desde otro medio (A1, Maggabox).
- Compuerta (BAP1127U): `decidir_aprobacion` rechaza sin batería verde, sin matriz mínima (mac, linux, android) o sin firmas válidas; `_publicar` lo vuelve a comprobar. El camino automático se detiene en `lista-para-aprobar`.
- Publicación pública: solo con el Aprobar de Maggasukha en Genesis (centro-versiones-1105.md §10.2). El sistema le manda UNA vez, por el Director presidente y Telegram: versión, sha corto, pruebas verdes, firmas K/K e instrucción de pulsar Aprobar («Te toca a ti»).

## 10. Seguridad

- La firma de capas (minisign del updater) no cambia; la retirada usa la misma; en esta ola ninguna clave privada se copia a la Mac ni al A1.
- Claves solo en variables de entorno o archivos 0600; entre nodos solo por canales cifrados existentes; nunca en el repo, la memoria, los registros ni el chat.
- Registros y censo saneados en origen; el analista recibe la evidencia marcada como datos y descarta rutas con `..`, fuera del repo o protegidas.
- Órdenes: vocabulario cerrado, firmadas por aparato y selladas E2E; buzón con una sola acción, caducidad de 5 min, ≤4 KB y sin texto hacia shells; los subprocesos del bucle usan listas de argumentos.
- Prohibido `--no-verify`, `--dangerously-skip-permissions` y `push --force` a main; tampoco se paga nada: el bucle no usa el peldaño de pago de Jev ni OpenRouter de pago.
- Reservadas intactas (`jev_reservadas.py`, `mcp_director_ordenes.py:29-36`), incluida `cambiar-umbrales-propios`.

## 11. Métricas

| Métrica | Hoy | Objetivo de la ola |
|---|---|---|
| Push → capa activa en cada aparato de prueba | sin dato de extremo a extremo (estimado 10-16 min; CI medido 5:53-8:25) | medida por el censo; ≤ CI + 3 min |
| Aparatos que confirman la build a los 5 min de promover | sin dato (se anota a mano) | 100 % de los encendidos |
| Direcciones de B4 lanzables sin manos | 2 de 6 (solo Mac→X) | 6 de 6 con permiso encendido |
| Pruebas cerradas con evidencia guardada | 0 de 15 (`evidencias/` vacía) | 100 % |
| Experiencias con desenlace | 473 de 14.055 (3,4 %) | todas las de capa `prueba` |
| Iteraciones por versión hasta verde / tiempo por iteración | sin dato (>24 h de .63 a .64; >48 h sin .65) | medidas; tope 8 |
| tok/s de BitNet por nodo | Mac ~9; nube 13,7; resto sin dato | medido por el pool |
| Capas vueltas atrás por humo / retiradas | sin dato | registradas |
| Versiones con firmas completas antes de Aprobar | no existe | 100 % |

## 12. Dónde corre cada cosa

- **Mac** (8 GB, saturada, disco <10 GB medido): app de dirección (recibe espejo y censo), pasadas ligeras de `director_pruebas` y del bucle, `ronda.py`. Nada de `cargo`, `next build` ni análisis BitNet salvo un slot libre y el gobernador de acuerdo.
- **A1 de Oracle**: analista + pool BitNet según su perfil, Laya, juez de Meta^n; pruebas de las tareas del enjambre. Sin comprobar su tamaño actual: los documentos dicen 2 núcleos y ~1 GB libre (`automejora-meta-n.md` §4), la instrucción 4 núcleos y ~24 GB; BAP1127K lo medirá.
- **GitHub Actions**: CI, capa, compilación nativa.
- **Maggabox** (Linux): aparato de prueba; Needle; BitNet solo si su perfil lo permite (RAM sin comprobar); evidencias NO en su disco USB (quedó en solo lectura).
- **Tableta y Maggadroid** (Android): aparatos de prueba; solo Needle; delegan.
- **Navegador**: sin vigía de capas; Needle WASM.

## 13. Qué NO se hace

- Integrar algo propuesto por un agente local sin pasar por todas las puertas.
- Publicar la versión oficial sin el Aprobar de Maggasukha, o dejar que la firma de los directores lo sustituya.
- Encender permisos de control o de diagnóstico a distancia, o abrir una terminal libre por la malla.
- Instalar GB de modelos sin visto bueno, o cualquier capa sin SHA verificado; prometer BitNet en Android.
- Entrenar pesos o adaptadores, o cambiar los umbrales propios de forma automática.
- Recompilar la app nativa para cambios de interfaz; cambiar la capa de un aparato a mitad de una ronda.
- Enviar telemetría por Supabase en cada latido; copiar claves privadas entre nodos.
- Usar modelos o APIs de pago.

## 14. Fases y tareas

- **Fase 1 · Fundamentos** — A anillo de prueba (Rust) · B publicar/promover + cargo test en CI [A] · C empuje [—] · D espejo del registro [—] · E registro único + recoger + `lanzar` [—] · F retirada firmada [A, B] · G humo [F] · H censo [C, D] · I ejecutor de prueba-control [—] · J buzón de órdenes [I, E].
- **Fase 2 · Análisis local con 1.58** — K perfil [—] · L experiencias y juicio [E] · M pool [K] · N analista [E, M, P] · O instalador por SO [K].
- **Fase 3 · Bucle con jueces** — P evaluador [E] · Q puertas protegidas [B] · R propuestas + gancho del director [N] · S bucle [A, B, C, D, E, F, G, H, J, L, N, P, Q, R].
- **Fase 4 · Firmas y lanzamiento** — T libro de firmas [—] · U compuerta de evidencia [T, P] · V sección del bucle en Genesis [S].

Para que la dirección las haga ya: A, B y Q (seguridad de capas, CI y puertas). Reglas de todas las tareas: ≤3 archivos y ≤120 líneas nuevas por archivo; pruebas pesadas en el A1 o en la nube; tras integrarse, verificación funcional en localhost.

## 15. Decisiones de Maggasukha

Están en la salida de esta ola (`decisiones_para_maggasukha`): anillo y canal global; capas construidas en el A1; vendorizar el instalador de BitNet; firmantes requeridos; interruptores por aparato; umbrales; `auto_por_defecto`; dónde corre el enjambre.

## 16. Riesgos residuales

- Encender `SERVIDOR_CAPAS_ANILLO` antes de que las apps de prueba entiendan el puntero de prueba, o con el bucle apagado, deja sin capas nuevas a todos. Mitigación: orden de activación (§4.2); apagar la variable vuelve al comportamiento de hoy.
- El censo amplía la huella de identificación del aparato: solo misma cuenta y con interruptor.
- Falsos «están usando…» durante B4 y la falta de TURN pueden dar fallos espurios: el evaluador debe distinguir «sin enlace» de un fallo de la función.
- En Android, una capa compilada con Node 22 corre en Node 24 sin comprobación de versión mayor (`servidor_capas.rs` ~653): el humo la detecta en el aparato.
- Un modelo de 2B con ctx corto puede proponer mal: las puertas y la prueba real deciden, y el analista funciona sin modelo.
- La Mac saturada y el disco <10 GB paran el enjambre: sin moverlo al A1/nube o liberar disco, la ola no avanza.
