# Contrato · Red sin dependencias: todo StarSeed OS sin internet externo (2026-11-08)

## 1 · Qué pidió Alex (08-11)
Toda la red, cada función de cada sistema y las capas de conciencia deben funcionar sin internet externo.
Eso incluye publicar y transmitir en páginas, comunidades, grupos, canales y transmisiones, con todo tipo de formatos.

Debe servir con cualquier combinación de medios:
- antenas del aparato;
- zonas Wi‑Fi;
- routers propios;
- antenas mesh P2P;
- servidores privados o públicos.

Cada pieza debe poder configurarse y vincularse, y se debe poder conectar más hardware y firmware sin depender de él.

Todo debe autoconfigurarse con inteligencia, con sugerencias y opciones para cada caso.

## 2 · Dónde estamos (medido hoy en el código, no en los contratos)

| Sistema | Sin internet hoy | Por qué |
|---|---|---|
| Mensajes entre neuronas | **Sí** | Red local nativa y WebRTC sin servidores. Bluetooth y Wi‑Fi directo ya están en main (INT1108C). |
| Mensajes de cuenta (DM) | **Sí, en código (MSJ1108C), sin probar en aparatos** | Almacén IndexedDB, historial unificado con la cuenta, subida idempotente; adjuntos, formato, citas y ediciones también por la malla (§7.1.1). |
| Llamadas 1:1 y de grupo (≤ 6) | **Sí, sin probar en aparatos** | `iceServers: []`; vídeo y pantalla viajan por el canal de datos. |
| Archivos | **Sí** | Trozos con SHA y reanudación. Por TCP 47071 va a unos 550 KB/s; con Wi‑Fi directo, más. |
| Publicaciones y feed | **No** | Primero se escribe en Supabase y solo después se difunde. El feed lee la tabla. |
| Páginas, comunidades, canales | **No** | Viven solo en Supabase. |
| Grupos y gobierno | **No** | Membresías y votos en Supabase; el resultado lo sella el servidor. |
| Transmisiones y estaciones | A medias | Los espectadores se pasan los segmentos entre sí, pero sigue haciendo falta el origen y el directorio está en Supabase. |
| Biblioteca | A medias | Lo instalado funciona; el catálogo y las instalaciones nuevas, no. |
| Capas de conciencia | A medias | Un modelo local o Ollama en la LAN sirve. WebLLM y transformers.js se cargan de CDNs. `ia-por-malla` necesita la malla de cuenta señalizada por Supabase. El reparto de capas entre pares está escrito y sin cablear. |
| Cuenta y acceso | **No** | El primer inicio, el registro y la renovación del token dependen de Supabase Auth. La clave maestra de cuenta existe sin interfaz. |
| Avisos | A medias | Los de mensajes de la malla son locales. Los demás vienen de Supabase o de ntfy.sh. |
| Actualizaciones | **No** | Solo desde GitHub. Por la malla viaja la petición, no los archivos. |
| Routers mesh | A medias | Genera la configuración UCI (802.11s + batman‑adv) pero no la aplica; sin probar en un router real. |
| LoRa / Meshtastic | A medias | Funciona en Chrome con Web Serial, Web BLE o HTTP. El puente serie nativo está sin cablear. |
| Reticulum | **No** | Solo lo detecta y lo etiqueta. |

**Raíz del problema.** Supabase es la única fuente de verdad: 276 archivos lo importan y unas 133 tablas. Su URL queda fija al compilar. La malla lleva copias o avisos, pero no tiene un dato propio.

**Otros huecos:**
- El canal nativo TCP 47071 firma el saludo pero **no cifra el contenido**.
- Hay 7 módulos útiles que nadie importa:
  - `chat-directo`
  - `estaciones/malla-directa`
  - `nativa/nas`
  - `malla/localsend`
  - el puente Meshtastic nativo
  - `capas/repartir`
  - `master-identity`

## 3 · La idea central
**Cada neurona es un nodo completo y la nube es una puerta más.** Hoy los datos viven en la nube y la malla los copia. Hay que darle la vuelta: cada dato nace firmado en la neurona que lo crea. Se replica por el medio que haya hacia quien tenga derecho a tenerlo, y la nube (Supabase o un servidor propio) es una réplica más, que se pone al día cuando hay internet.

El sistema se organiza en cuatro capas, y cada una funciona sin la de arriba:

```
4 · Servicios   páginas · comunidades · grupos · canales · transmisiones · mensajes · conciencia
3 · Datos       registro vivo firmado de cada entidad, réplicas por ámbito, fusión sin conflictos
2 · Vías        planificador único · guardar y reenviar · multisalto · cifrado E2E · identidad sin servidor
1 · Medios      conectores enchufables: BLE · Wi‑Fi directo · zona Wi‑Fi · LAN · routers mesh · LoRa · Reticulum · serie · internet
```

## 4 · Capa 1 · Medios: conectores enchufables, sin depender de ninguno

Un contrato único, `ConectorMedio`, con estas piezas:
- `descubrir()`, `enlazar()`, `enviar()`, `alRecibir()` y `cerrar()`;
- una **ficha de capacidades medida**: ancho, latencia, MTU, alcance, energía, tiempo de aire, coste, privacidad y si lleva flujos;
- los permisos que necesita.

Lo que ya existe se envuelve con este contrato: red local nativa, WebRTC local, Bluetooth, Wi‑Fi directo, cuenta, relé y LoRa. Cada medio nuevo es un conector más, sin tocar los sistemas de arriba.

| Medio | Alcance | Ancho | Qué lleva |
|---|---|---|---|
| Bluetooth LE directo | 10–50 m | decenas a cientos de kbps | Descubrir, mensajes, avisos, votos, voz Opus de 16–24 kbps, imágenes pequeñas, negociar el Wi‑Fi directo |
| Wi‑Fi directo / zona local del Android | 50–100 m | 50–300 Mbps | Todo: archivos grandes, vídeo, pantalla, transmisiones |
| LAN del router (Wi‑Fi o cable) | el edificio | 100+ Mbps | Todo |
| Routers mesh OpenWrt (802.11s + batman‑adv) | un barrio, por saltos | 10–300 Mbps | Todo, en varios saltos |
| LoRa (Meshtastic) | 1–15 km | ≤ 200 B por mensaje, poco tiempo de aire | Texto, avisos, votos, recibos, estaciones paramétricas (se manda `t0` y los parámetros, no el audio) |
| Reticulum (RNode, serie, TCP/UDP, paquete) | según la interfaz | de bps a Mbps | Pendiente de decisión (§11) |
| Serie / USB / Ethernet | cable | según el cable | Nodos y radios conectados |
| Internet (SIM, Wi‑Fi público, satélite) | global | variable | Opcional: «puerta» para unir islas y respaldar en la nube |

**Hardware y firmware sin dependencia.** Un registro de conectores con perfiles:
- Meshtastic por serie, BLE o HTTP;
- RNode;
- router OpenWrt (adoptar o configurar);
- ESP32 y Raspberry Pi como «nodo base StarSeed» (servidor local, malla y radios en un aparato fijo);
- módem SIM o satélite como puerta.

Cada perfil dice qué detecta, qué ofrece y qué permisos pide. Si el hardware no está, el sistema sigue con lo que hay. Al flashear o reconfigurar un router siempre decide la persona, con aviso.

## 5 · Capa 2 · Vías
- **Un planificador único.** Hoy hay 8 elegidores: `elegirEnlaces`, `planTransmission`, `decideRoute`, CAMR, `planParaDatos`, `planDeEnvio`, `planLlamadaChat` y `mediosParaEnviar`. Se unen en uno que lee las fichas de §4 y elige por dato según tamaño, urgencia, privacidad, energía y coste. Puede repartir un archivo entre varios medios a la vez (multitrayecto) y cambia de medio en caliente cuando aparece uno mejor.
- **Guardar y reenviar.** Si no hay ruta ahora, el dato espera firmado y sale cuando la haya. Es la base del correo por la malla, ampliada a todo.
- **Multisalto con consentimiento.** Las neuronas vecinas, también de otras cuentas, pueden pasar datos cifrados que no pueden leer. Cada persona decide si su neurona hace de relevo, con tope de batería y de datos.
- **Cifrado E2E en todos los medios.** Primero, cifrar el canal TCP 47071; el Bluetooth y el Wi‑Fi directo nacen cifrados. Se usa el trinquete existente: ECDH, HKDF, AES‑GCM y rotación de claves.
- **Identidad sin servidor.**
  - La clave maestra de la cuenta firma un certificado por neurona: cuenta → neurona.
  - Las huellas de otras cuentas se aprenden por QR, por la malla (teselas firmadas) y por las resonancias de confianza.
  - Revocar una neurona también viaja por la malla.

## 6 · Capa 3 · Datos: el registro vivo de cada entidad
Cada página, comunidad, grupo, canal, publicación, hilo, votación o estación es un **registro de operaciones firmadas**. Cada operación lleva autor, reloj lógico híbrido y referencia a las anteriores. Las neuronas que tienen derecho se pasan las operaciones que les faltan, y con las mismas operaciones todas llegan al mismo estado.

| Tipo | Regla de fusión |
|---|---|
| Publicaciones, comentarios, mensajes | Solo se añaden; se ordenan por reloj; editar o borrar es otra operación firmada |
| Perfil de página, comunidad o canal | Por campo, gana el último reloj; solo pueden escribir los roles con permiso |
| Membresías y roles | Conjunto con altas y bajas firmadas por quien tiene el rol para hacerlo |
| Reacciones | Contador sin conflictos por autor |
| Documentos y tablas vivas | El motor de celdas que ya existe (`vivo/tabla/fusion.ts`) |
| Votos | Ver §7.3 |

- **Réplicas por ámbito.** Cada entidad dice quién la guarda: neuronas de los miembros, cerebros, servidores propios, nube StarSeed. También dice cuántas copias mínimas quiere.
- **Almacenamiento local:**
  - App nativa: SQLite en el servidor local.
  - Web y PWA: IndexedDB y OPFS.
- **La nube como réplica.** Al volver internet, Supabase recibe las operaciones y se reconcilia de forma idempotente por id, como ya hace el correo por la malla. La URL del servidor pasa a configurarse en tiempo de ejecución: nube StarSeed, servidor propio, neurona base o solo malla.

## 7 · Capa 4 · Servicios

### 7.1 · Mensajes, llamadas y archivos
- Los mensajes que llegan por la malla entran en el almacén local y se fusionan con el historial de la cuenta.
- Adjuntos, formato y citas también viajan por la malla.
- Las llamadas eligen medio con el planificador. Por Bluetooth solo va la voz; con Wi‑Fi directo o LAN, vídeo y pantalla.

#### 7.1.1 · F1 hecha en código (MSJ1108C · 2026-11-08)
- **Almacén local** por mensaje en IndexedDB, con reloj híbrido, vía, recibos y metadatos de adjuntos; migración sin pérdidas
  desde `starseed.mensajeria.malla.v1` (respaldo literal en `.respaldo`, la clave vieja no se borra, lápidas).
- **Fusión:** el hilo muestra un historial único (servidor + malla, sin duplicados, con la vía real); al volver internet lo
  que solo viajó por la malla sube **con su mismo id** (idempotente, sin cambios de esquema; propuesta de columna `meta` en el detalle).
- **Contenido rico por la malla:** markdown, formato enriquecido, citas, y ediciones/borrados como operaciones firmadas por
  el autor, en cuentas y en neuronas. Los adjuntos siguen por el motor de archivos con miniatura primero.
- **Huérfanos:** `chat-directo` se queda fuera (duplicaría el buzón); `localsend` y `nas` necesitan lado nativo (plan escrito).
- Detalle, límites (TOFU de claves hasta F0) y pendientes en aparatos reales: `architecture/datos-por-la-malla.md` §10.
- Sigue pendiente de F1: la prueba de los 18 formatos por cada medio (necesita los medios de MED1108B) y cablear `localsend`/`nas`.

### 7.2 · Publicaciones, páginas, comunidades y canales
- Publicar escribe primero en local y se difunde a las réplicas del ámbito. El feed lee del almacén local.
- Cada página o comunidad tiene un **perfil de red** (§8).
- Los canales públicos se anuncian por la malla. Quien los sigue recibe las publicaciones por el medio que haya; por LoRa, solo el titular y el aviso.

### 7.3 · Grupos y gobierno sin servidor
- Cada voto es una papeleta firmada por el miembro.
- El quórum y el plazo los dicta la configuración del grupo.
- El cierre lo sellan **notarios**: neuronas del grupo elegidas por sorteo determinista. Cuando k de n firman el mismo recuento, el resultado vale.
- Sin quórum alcanzable queda «provisional» y se cierra al reconectar.
- Delegaciones, pruebas de que nadie vota dos veces y opción de voto secreto (paso posterior).

### 7.4 · Transmisiones y estaciones
- El origen emite a sus vecinos, y los espectadores retransmiten en árbol o en malla.
- La calidad baja por escalones según el medio de cada tramo: vídeo → audio → paramétrico.
- Las estaciones paramétricas (`t0` + parámetros) llegan incluso por LoRa.
- El directorio de estaciones se anuncia por la malla.

### 7.5 · Capas de conciencia
- **Motores empaquetados:** WebLLM y transformers.js vienen en la app o los sirve el servidor local, no los CDNs.
- **Capas por la malla:** se cablea `capas/repartir`, siempre con SHA del manifiesto.
- **IA por cualquier enlace:** la neurona sin recursos le pide a una vecina o al cerebro de la LAN.
- **Por ámbito:** cada página, comunidad o grupo elige capas, servidor y nivel de privacidad. CAMR pasa de recomendar a decidir con esa configuración.

### 7.6 · Cuenta y acceso
- **Primer acceso sin internet:** una neurona ya dentro de la cuenta enrola a la nueva por QR o Bluetooth, firmando su certificado.
- **Sesión local** con la clave de la neurona.
- Supabase Auth queda como una forma más de entrar.

### 7.7 · Avisos y actualizaciones
- Todos los sistemas avisan por la malla; ntfy queda opcional y se puede alojar en la LAN.
- Las actualizaciones firmadas (APK, paquete de escritorio, capas) se las pasan las neuronas entre sí y con un espejo en la LAN. La firma del actualizador se verifica igual.

### 7.8 · Navegadores en la LAN
Una app nativa puede hacer de **estación base**: sirve la web y su API local a la red, con aviso y permiso. Así un móvil o un PC sin app entra en StarSeed desde el navegador sin internet.

## 8 · Configuración e inteligencia
- **Perfil de red por ámbito** (página, comunidad, grupo, canal, transmisión). Sus campos:
  - alcance: neurona, LAN, malla vecinal, todo;
  - réplicas y número mínimo;
  - medios permitidos y preferidos;
  - cifrado;
  - formatos y escalones;
  - retención;
  - capas de conciencia;
  - quién puede hacer de relevo.

  Se hereda de la cuenta y cada ámbito lo puede ajustar.
- **Copiloto de red.** Detecta el entorno: internet, router, vecinos, radios, batería, hardware conectado. Propone el plan con una frase y un toque, con tres modos por acción: Automático, Preguntar o Nunca. Explica por qué eligió cada medio.
- **Perfiles de situación.** Casa, Viaje, Asamblea o evento, Apagón o emergencia, Comunidad rural, Privado total. Cambian varios ajustes a la vez y se activan solos por señales; por ejemplo, sin internet durante 5 min propone «Apagón».
- **Mapa de vías.** Por cada sistema: si funciona ahora, por qué medio y qué falta para que funcione.
- **Autoprueba.** Comprueba de verdad cada medio entre dos neuronas y guarda el resultado.

## 9 · Formatos por medio (escalones automáticos)

| Formato | BLE | Wi‑Fi directo / LAN / mesh | LoRa |
|---|---|---|---|
| Texto, votos, recibos, avisos | Sí | Sí | Sí (≤ 200 B) |
| Imagen | Miniatura (≤ 200 KB) y el resto cuando haya otro medio | Original | Solo aviso |
| Audio, voz | Opus de 16–24 kbps | Original | Paramétrico |
| Vídeo, pantalla, transmisión | No (pasa a voz) | Original y escalones | Solo aviso |
| Archivos grandes y modelos | Espera a otro medio (lo propone) | Sí, multitrayecto | No |

## 10 · Fases (olas). Cada una se da por hecha solo cuando funciona en dos aparatos reales.

| Fase | Contenido |
|---|---|
| **F0 · Cimientos** | Cifrar TCP 47071; contrato `ConectorMedio` envolviendo los enlaces que ya hay; planificador único; certificado cuenta → neurona y clave maestra con interfaz; URL del servidor en tiempo de ejecución; Mapa de vías (solo lectura) |
| **F1 · Mensajería completa sin internet** | Almacén local de mensajes y fusión con el historial; adjuntos, formato y citas por la malla; cablear `chat-directo`, `localsend` y `nas`; prueba de los 18 formatos por cada medio |
| **F2 · Entidades local‑first** | Registro vivo firmado; almacén local; réplicas por ámbito; publicaciones, páginas, comunidades y canales; reconciliación con Supabase |
| **F3 · Gobierno sin servidor** | Papeletas firmadas, quórum, notarios, provisional y cierre al reconectar |
| **F4 · Transmisiones y estaciones** | Relevo entre espectadores, escalones por medio, paramétricas por LoRa, directorio por la malla; cablear `estaciones/malla-directa` |
| **F5 · Conciencia sin internet** | Motores empaquetados, capas P2P, IA por cualquier enlace, configuración por ámbito |
| **F6 · Antenas y hardware** | Puente Meshtastic nativo, serie en Windows, aplicar y probar UCI en un router OpenWrt real, nodo base (Raspberry Pi o ESP32), conector Reticulum (según §11), estación base para navegadores |
| **F7 · Avisos y actualizaciones por la malla** | Avisos de todas las entidades; espejo de actualizaciones en la LAN y entre pares |
| **F8 · Copiloto** | Perfil de red por ámbito, perfiles de situación, sugerencias, autoprueba |

**Orden recomendado:** F0 → F1, después F2 y F3 juntas (comparten el registro vivo), luego F5, F4, F7, F6 y F8.

## 11 · Decisiones de Alex
1. **Motor de fusión de datos (F2):**
   - **Propio**, sobre lo que ya hay: celdas CRDT, teselas y reloj de Lamport. Sin dependencia nueva.
   - **Biblioteca MIT** (Automerge o Loro): más probada, pero añade peso.
2. **Reticulum.** El protocolo es de dominio público desde 2016. La implementación de referencia lleva la «Reticulum License»: MIT con dos prohibiciones, sistemas pensados para dañar a personas y usarla, directa o indirectamente, para crear datos de entrenamiento de IA. Como StarSeed aprende de sus propias experiencias, las opciones son:
   - **(a)** no integrar la de referencia y escribir un conector propio del protocolo público;
   - **(b)** hablar con un `rnsd` que instale la persona, con aviso;
   - **(c)** dejarlo para después.
3. **La nube como réplica.** Pasar de «Supabase manda» a «la neurona manda y la nube se reconcilia» cambia la seguridad (RLS → firmas). Se hace por sistema, empezando por los mensajes.
4. **Relevo para otras cuentas:** activado por defecto, con topes, o desactivado.

## 12 · Límites reales
- **Navegadores.** Un navegador solo, sin app, no descubre a nadie sin internet: necesita QR o una estación base.
- **iOS.** Limita el Bluetooth y el Wi‑Fi en segundo plano.
- **Mac.** Tiene una sola radio Wi‑Fi: con el Wi‑Fi directo deja su red de casa mientras dura.
- **LoRa.** Es lento por naturaleza y la ley limita su tiempo de aire.
- **Islas.** Dos zonas sin ningún medio entre ellas no se ven hasta que alguien lleve los datos (guardar y reenviar) o haya una puerta.
- **Cuentas nuevas.** Crear una cuenta nueva sin ninguna neurona de confianza cerca necesita, al menos una vez, un ancla de identidad: QR de otra persona o internet.
