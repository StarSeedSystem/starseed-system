# La síntesis diaria del 2026-11-14 falló: diagnóstico y arreglo (ola SIN1114)

## 1. Pedido de Maggasukha (2026-11-14, 19:42 México)

> Analiza los mensajes del chat de la síntesis diaria que falló y arréglalo para que funcione correctamente.

## 2. Diagnóstico (A1, Mac y Drive, 2026-11-15 01:40 UTC)

1. **No hubo síntesis del 2026-11-14.**
   - El agente nativo (`agente_sintesis`, estado en
     `starseed_memory_root/produccion-audiovisual/estado.json`) quedó en `fase: entregar`, con `entregada: false`,
     `sintesis_path: null` y `respaldo: false`, aunque encoló 7 tareas. Su respaldo de las 07:54 no redactó nada.
   - **El respaldo del A1 desapareció.** `vigilar_sintesis` (08:30) vivía en la herramienta provisional
     `~/herramientas/peticiones-telegram/peticiones_telegram.py`. Desde que el servicio corre el bot del repo, nadie lo
     ejecuta: `estado.json` del bot sigue en `sintesis: 2026-11-13`.
2. **Las pruebas del enjambre escriben en el Drive real.**
   - `test_agente_sintesis.py` llama a `A.ciclo(...)` sin `subir_drive` en
     `test_entregar_añade_fuente_notebooklm_y_linea_telegram` y en `test_entregar_fallo_notebooklm_no_bloquea`, así
     que se usa el `_subir_doc` real con los tokens de `~/.starseed/cuentas`.
   - Cada vez que una puerta corre esas pruebas aparecen **dos Google Docs vacíos llamados «Síntesis diaria
     2026-11-11»** en Drive › Síntesis diarias. Hay decenas desde el 2026-11-14 a las 19:34 UTC: pares a las 19:34,
     20:21, 21:17, 21:18, 22:03, 23:19, 00:37 y 01:24.
3. **El multiformato procesó basura.** `peticiones_notebooklm.ultima_sintesis()` toma el último Doc *creado* cuyo
   nombre empieza por «Síntesis diaria», así que eligió un Doc vacío de la prueba.
   - A las 06:17 UTC el bot anunció «Nueva síntesis diaria detectada: 2026-11-11» y lo procesó: esos son los mensajes
     fallidos del chat.
   - Además, `sintesis_multiformato.procesar_sintesis_diaria(fecha)` ignora la fecha y usa `ultima_sintesis()`, así
     que aunque exista la síntesis de hoy procesaría la basura más reciente.
4. **El bot del repo apenas registra nada** (no deja rastro de lo que envía), así que el diagnóstico tiene que
   reconstruirse por el estado y por Drive.

## 3. Puntual (Claude, 2026-11-15 01:45 UTC)

- Se lanzó en el A1 `~/.starseed/peticiones/sintesis_hoy.py 2026-11-14`. Usa la herramienta provisional:
  investigación profunda, el informe con todas las secciones del protocolo y el resumen por Telegram.
- Después, en el mismo cuaderno, los 9 formatos de NotebookLM, enviados uno a uno al chat y guardados en Drive ›
  Síntesis diarias › «Síntesis diaria 2026-11-14 · formatos».
- La fecha se reservó antes en `multiformato.json` para que el vigilante del bot no la procese a la vez.

## 4. Arreglo permanente

### 4.1 Las pruebas nunca tocan servicios reales (URGENTE)

- **Interruptor:** `STARSEED_PRUEBAS=1`, que ponen las puertas y también cada archivo de prueba al importarse.
  Con él:
  - `cuentas_google.token()` devuelve `None`;
  - los envíos de Telegram (`sintesis_telegram.enviar`, `decir`, `subir`), las subidas a Drive y el CLI de
    NotebookLM se niegan con un error claro.
- **Guardia de red en las pruebas:** cualquier `urllib.request.urlopen` o socket hacia fuera durante las pruebas
  falla la prueba.
- **Las dos pruebas** de §2.2 inyectan `subir_drive`.

### 4.2 Elegir bien la síntesis

- `ultima_sintesis(fecha=None)` busca la síntesis más reciente **por la fecha del título**, no por la fecha de
  creación.
  - Solo valen Docs cuyo texto exportado tenga al menos 4.000 caracteres, y nunca un título con «prueba».
  - Con `fecha`, devuelve el Doc de esa fecha, o falla.
- `procesar_sintesis_diaria(fecha)` usa el Doc de **esa** fecha.
- El vigilante del multiformato solo procesa la síntesis de hoy o de ayer (hora de México), y solo si vale.

### 4.3 Síntesis garantizada todos los días

- **El agente nativo:** se diagnostica por qué el 2026-11-14 su respaldo de las 07:54 no redactó, se arregla, y una
  prueba reproduce ese estado.
- **El respaldo del A1 pasa al bot del repo.**
  - A las 08:30 de México, si no hay una «Síntesis diaria <hoy>» que valga, el A1 la hace con NotebookLM:
    investigación profunda, el informe con el protocolo completo y el resumen a Telegram.
  - Es el mismo comportamiento que `vigilar_sintesis` y `lanzar_sintesis` de la herramienta provisional.
  - Después se dispara el multiformato.
- **Registros:** el bot del repo vuelve a registrar cada envío (`→ telegram: <primeros 90 caracteres>`) y cada
  fallo con su traza.

### 4.4 Limpieza (sin borrar)

- Un guion **mueve**, sin borrar, los Docs basura a la subcarpeta «_pruebas (para borrar)» de Síntesis diarias. Basura
  son los que cumplen todo esto:
  - se llaman «Síntesis diaria 2026-11-11»;
  - su texto tiene menos de 2.000 caracteres;
  - se crearon después del 2026-11-12.
- Nunca toca un Doc de 4.000 caracteres o más.
- Informa del número. Maggasukha decide si se vacía.

## 5. Cola SIN1114

La cola está en `starseed_memory_root/olas/cola-sin1114.json`. SIN1114A va primero.
