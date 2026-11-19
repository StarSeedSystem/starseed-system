# Permisos por medio — contrato de la matriz y de la regla de petición

Fuente ejecutable: `src/lib/permisos/matriz.ts` (tabla y regla) y `src/lib/permisos/__tests__/matriz.test.ts`.
Fuente histórica de detalle: `src/lib/nativa/permisos-registro.ts`, `src/lib/nativa/permisos-enlaces.ts`,
`src/lib/nativa/permisos-inicio.ts`, `src/lib/nativa/permisos-inicio-ejecutor.ts`,
`src/lib/permisos/permission-engine.ts` y `native/src-tauri/src/permisos_inicio.rs`.
Si este documento y la tabla ejecutable se separan, manda la tabla y su prueba.

## La regla

1. **Al instalar y al abrir** se pide lo que falta y sea útil para una función real del OS. Nunca se pide
   por pedir ni se concede nada en nombre de la persona: solo se lanza el aviso del sistema o se abre la
   pantalla exacta de Ajustes para que ella decida.
2. **Falta** es «sin preguntar» o «sin conceder». **Denegado a mano** es una decisión explícita de la
   persona. Si está denegado a mano, no se vuelve a pedir solo: se muestra en la lista con «Abrir ajustes».
3. Lo que el medio solo concede en un panel (`panel`) no se pide con un aviso: se abre Ajustes.
   Lo que se pregunta al usarlo (`por-uso`) no se pide antes: se pide en el momento de usarlo.
   Lo declarado en el manifiesto (`declaracion`) o que el medio no pide (`nada`) no genera diálogo.
4. Lo que ya salió como `aviso-y-panel` (macOS: pantalla, accesibilidad, monitorización de entrada) pasa a
   «Abrir ajustes» en las siguientes aperturas; el sistema ya no repite su aviso.
5. El estado se guarda por persona y por medio. `alInstalar` recibe el primer estado; `alAbrir` recibe
   además los permisos cuyo aviso ya salió (`yaPedidos`).

## Cómo se lee cada celda

`forma de pedir · detección · enlace`

- **Forma de pedir:** `aviso` (aviso del sistema), `aviso-y-panel` (aviso la primera vez, luego solo Ajustes),
  `panel` (solo Ajustes), `por-uso` (se pregunta al usarlo), `declaracion` (basta declararlo), `nada`.
- **Detección:** `si` (el medio deja leer el estado), `parcial` (solo de forma indirecta), `no` (no se puede leer).
- **Enlace:** `directo` (pantalla de ese permiso), `lista` (categoría donde hay que buscar StarSeed),
  `ficha` (ficha de la app y luego Permisos), `aviso` (no hay pantalla previa), `sin-enlace` (no se puede abrir),
  `no-hace-falta` (el medio no lo pide).
- `—` significa que el permiso no existe en ese medio y la decisión es `no-disponible`.

## Matriz real permiso × medio

| Permiso | macOS | Windows | Linux | Android | iOS | Navegador web | Terminal |
|---|---|---|---|---|---|---|---|
| Micrófono | aviso·si·directo | por-uso·no·directo | por-uso·no·sin-enlace | aviso·si·ficha | aviso·si·ficha | aviso·si·aviso | por-uso·no·sin-enlace |
| Cámara | aviso·si·directo | por-uso·no·directo | por-uso·no·sin-enlace | aviso·si·ficha | aviso·si·ficha | aviso·si·aviso | por-uso·no·sin-enlace |
| Pantalla | aviso-y-panel·si·directo | nada·si·no-hace-falta | por-uso·no·aviso | por-uso·no·aviso | por-uso·no·aviso | por-uso·no·aviso | por-uso·no·sin-enlace |
| Accesibilidad / control | aviso-y-panel·si·directo | nada·si·no-hace-falta | por-uso·no·aviso | panel·si·lista | panel·si·ficha | — | por-uso·no·sin-enlace |
| Ubicación | por-uso·si·directo | por-uso·no·directo | nada·no·no-hace-falta | por-uso·si·ficha | por-uso·si·ficha | aviso·si·aviso | — |
| Bluetooth | aviso·si·directo | nada·si·directo | nada·si·no-hace-falta | aviso·si·ficha | aviso·si·ficha | aviso·si·aviso | por-uso·no·sin-enlace |
| Red local | aviso·parcial·directo | por-uso·no·sin-enlace | nada·si·no-hace-falta | aviso·si·ficha | aviso·si·ficha | nada·no·no-hace-falta | nada·si·no-hace-falta |
| Notificaciones | aviso·parcial·lista | nada·no·directo | nada·no·no-hace-falta | aviso·si·directo | aviso·si·ficha | aviso·si·directo | declaracion·no·no-hace-falta |
| Segundo plano | panel·si·lista | aviso·si·directo | declaracion·si·sin-enlace | panel·si·directo | declaracion·no·no-hace-falta | declaracion·no·no-hace-falta | declaracion·no·no-hace-falta |
| Archivos / almacenamiento | por-uso·no·directo | por-uso·no·sin-enlace | por-uso·no·sin-enlace | panel·si·directo | por-uso·no·aviso | por-uso·no·aviso | por-uso·no·sin-enlace |
| Entrada virtual | aviso-y-panel·si·directo | nada·si·no-hace-falta | por-uso·no·aviso | panel·si·lista | — | — | — |
| Energía / batería | nada·si·no-hace-falta | nada·si·no-hace-falta | nada·si·no-hace-falta | panel·si·directo | nada·si·no-hace-falta | nada·no·no-hace-falta | nada·si·no-hace-falta |

## Falta frente a denegado a mano, medio por medio

- **macOS:** TCC devuelve `notDetermined` (falta), `granted` y `denied` (denegado a mano) para micrófono,
  cámara, pantalla, accesibilidad y monitorización de entrada. Red local no se puede leer: se deduce de si la
  malla local responde; si la persona apagó el interruptor, se marca a mano en la lista y no se vuelve a pedir.
- **Windows:** las apps de escritorio no tienen estado por aplicación. Micrófono y cámara se leen del
  interruptor global de Privacidad; si está apagado es denegado a mano. El resto se detecta `no`: se muestra
  «Abrir ajustes» y se deja la decisión en la persona. El Firewall se abre solo la primera vez y no se repite.
- **Linux:** X11 no pide permiso para pantalla, entrada ni red; Wayland pregunta por sesión mediante su portal
  (por-uso), así que no hay denegación persistente que recordar. GNOME/KDE no tienen una pantalla única: nunca
  se abre una pantalla inventada; se dice dónde mirar.
- **Android:** `checkSelfPermission` distingue concedido de denegado. Si tras negar,
  `shouldShowRequestPermissionRationale` es `false`, es denegado a mano con «no volver a preguntar»: se guarda
  como tal y solo se ofrece la ficha de la app. Accesibilidad, superposición, batería y todos los archivos se
  leen como servicio/AppOps y se conceden en su panel.
- **iOS:** `AVCaptureDevice`, `CLLocationManager` y `UNUserNotificationCenter` devuelven `notDetermined`
  (falta), `denied` (denegado a mano) o `restricted` (no disponible). Tras negar no se vuelve a pedir: se abre
  la ficha de la app en Ajustes. Pantalla y archivos usan el selector del sistema cada vez (por-uso).
- **Navegador web:** la Permissions API devuelve `granted`, `prompt` o `denied`. Un `denied` puede venir de un
  aviso cerrado sin decidir: se compara con el resultado real (`NotAllowedError`) y, si la consulta sigue en
  `prompt`, se trata como falta y se puede volver a pedir al abrir. Si la consulta ya dice `denied`, es
  denegado a mano y solo se abre la configuración del sitio.
- **Terminal:** hereda los permisos del programa que aloja la terminal (TCC en macOS, portal en Linux,
  Privacidad en Windows). No hay aviso propio del comando: todo es `por-uso` y, si falta, `sin-enlace` con el
  nombre del ajuste del anfitrión. Nunca se lanza un diálogo que el terminal no puede mostrar.

## Al instalar y al abrir

- `alInstalar(medio, estados)` devuelve `pedir` (avisos que toca lanzar), `abrirAjustes` (solo panel),
  `porUso`, `listo` y `noAplica` (nada que pedir o inexistente en ese medio).
- `alAbrir(medio, estados, yaPedidos)` hace lo mismo, pero los `aviso-y-panel` ya vistos pasan a `abrirAjustes`.
- `queHacer(medio, permiso, estado, yaPedido)` es la decisión de una fila y la usan la lista de la neurona y
  las funciones del OS antes de empezar. Un `denegado-mano` nunca devuelve `pedir`.
- El estado leído y lo guardado se separan: el sistema dice qué hay; lo guardado recuerda qué se preguntó y
  qué denegó la persona. Al volver a la app se relee el sistema y se conserva la marca manual.

## Enlaces y ejecución

Los enlaces concretos (texto exacto de la pantalla y qué pulsar) viven en `src/lib/nativa/permisos-enlaces.ts`;
la apertura real de la pantalla, en `medios_abrir_ajustes` / `abrirAjustesMedios` (`src/lib/nativa/medios-nativos.ts`).
La matriz solo declara el nivel de enlace; no abre nada por sí misma ni ejecuta red, disco o procesos.

## Pruebas y aplicación por medio

Prueba pura: `npx vitest run src/lib/permisos/__tests__/matriz.test.ts`. Cubre la cobertura de la tabla, la
lectura de cada medio, la regla de no insistir y el reparto de `planDe`.

La aplicación por medio se reparte en `starseed_memory_root/olas/cola-permisos-por-medio-1119.json` (macOS,
Android/iOS, Windows/Linux, navegadores y terminal). Cada tarea lee esta matriz y no la duplica.
