# Llamadas con superficie de telefonía (LLA1108C)

Contrato corto. Código: `src/lib/llamadas/superficie/*` (lógica pura) y `src/components/llamadas/superficie/*` (interfaz).

## 1. Superficie
Una sola superficie (`SuperficieLlamada`) para voz, vídeo, pantalla, transmisión en vivo y grupo. No conoce los motores: recibe una `VistaLlamada` y unas `AccionesLlamada` (`vista.ts`). Una acción ausente deja su botón desactivado con su motivo; no hay botones muertos. El adaptador `adaptador-directa.ts` conecta la llamada directa por enlace local (`LlamadaDirectaFlotante`); el motor de llamadas por cuenta (`motor.ts`) se conecta igual con otro adaptador (pendiente).

## 2. Estados y tamaños (`maquina.ts`)
Estados: `entrante`, `saliente`, `conectada`, `en-espera`, `reconectando`, `terminada` (más `inactiva`). El motor manda (`sincronizar.ts` traduce su estado a eventos). La espera no cuenta en el cronómetro. `terminada` guarda duración y medio y se queda hasta «Cerrar».
Tamaños: `burbuja` (arrastrable, también con flechas), `panel`, `pantalla-completa`. La máquina guarda solo el tamaño de DESTINO y el previo: la capa visual interpola con CSS, por eso la transición es interrumpible; con «reducir movimiento» no hay transición. Esc sale de pantalla completa y vuelve al tamaño previo.
Pantalla completa (PER1108A): en la app nativa se usa el comando de VENTANA `ventana_pantalla_completa` (nunca `requestFullscreen` de elemento: WebKit congeló el Mac); en la web, la del documento. El modo completo se pinta a viewport completo aunque el sistema la rechace.

## 3. Controles
Silenciar, cámara, girar cámara (si hay más de una), compartir pantalla, espera/reanudar, imagen en imagen, rejilla/orador, resaltar puntero (pantalla), colgar, cronómetro, salida de audio (`setSinkId` donde exista; Safari/WebKit no lo tiene) y rutas nativas por contexto opcional (`contexto-nativo.tsx`, vacío por defecto). Cambio de tipo sin colgar: `puedeCambiarTipo` + `diferenciaPistas` (qué pistas añadir/quitar sobre la misma conexión); el motor aplica la renegociación. Calidad: `calidad-llamada.ts` reutiliza `clasificarPar`/`etiquetaRuta` (BLE1108B), `calidadDesde` y `cifradoDe` (CIF1108A); lo no medido sale «sin medir».

## 4. Medio de transmisión (`selector-medio.ts`)
«Automático» (el planificador) o un medio fijado. Si no puede llevar el tipo (Bluetooth no lleva audio ni vídeo todavía) o no hay enlace, se dice y la llamada sigue por el medio actual. Si el fijado se cae, se re-rutea a otro capaz para no cortar.

## 5. Invitar (`grupo-invitar.ts`)
Usuarios, neuronas y grupos; pasa a malla de grupo con los límites de hoy (6 personas, 4 con vídeo). Se muestran y explican; un grupo que no cabe entero no entra a medias.

## 6. Grabación y consentimiento (`grabacion.ts`, `grabadora-local.ts`)
Apagada por defecto; orden explícita. Se avisa a TODOS por el canal de datos ANTES de grabar; si el aviso no llega a alguien, no se graba. Indicador rojo «Grabando» en todas las neuronas mientras alguien graba; quien entra tarde recibe el aviso (`avisosParaNuevo`). Local (`MediaRecorder` → OPFS). Al parar: Archivos, Biblioteca o descartar.

## 7. Astraura en la llamada (`astraura-llamada.ts`)
Opt-in por llamada y por neurona. Una sola neurona genera (`elegirGenerador`, local primero, desempate igual en todas) y la respuesta se difunde por el canal de datos con id único: cada neurona activa la muestra una vez (deduplicada) con los mismos ajustes de voz; leer en voz alta es otro opt-in. Sin reconocedor de voz no hay transcripción y el panel lo dice.
