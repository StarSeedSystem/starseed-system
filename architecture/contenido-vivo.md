# Contenido vivo · tres niveles en Astraura, la Protomolécula y las publicaciones (CVV1028)

**Pedido de Alex (2026-10-28):** «instala esta skill para nosotros y el desarrollo de contenido próximamente para
StarSeed en su sistema de diseño», y «también intégrala en el OS para Astraura y la Protomolécula y las publicaciones
de todo tipo en los contextos que sea útil, con opciones de variaciones locales o con oportunidad de conectarse con
Higgsfield o Spline o demás servicios externos desde StarSeed OS para cada cuenta, página o grupo (buscando lo mejor
comparando las opciones locales con servicios externos para tareas específicas inteligentemente)».

**Origen del método:** la skill «living-site» (Jack Roberts, cuyo método RISE ya es referencia del director de
diseño). No trae licencia y no tiene repositorio público, así que:
- está instalada para Claude Code en la Mac (`~/.claude/skills/living-site`) y en el plugin privado `starseed-estudio`;
- **en el OS no se copia su código**: el enjambre escribe la versión de StarSeed a partir del método (las ideas,
  las reglas y lo medido), con nombres, código y pruebas propios.

## 1. Los tres niveles

| Nivel | Qué es | Debe |
|---|---|---|
| 1 · 3D vivo | una pieza 3D con la que se juega (una por página, dos como mucho) | reaccionar o animarse y **nunca atrapar el scroll** |
| 2 · Película e imágenes | una película de scroll de UN solo movimiento de cámara, fotos del mismo mundo y fotos vivas (bucles) | no tener cortes, verse nítida a 2x, terminar en lo que muestra la sección siguiente |
| 3 · Gráficos vivos | diagramas dibujados en código que explican el producto y se mueven en bucle | cambiar algo cada 1–2 s, con 6 palabras como mucho dentro |

**Reglas de página** (de la skill, adaptadas):
- una idea por sección;
- texto a un lado y la imagen al otro, nunca texto sobre metraje;
- sin bordes duros entre secciones;
- tipografía legible;
- logos reales;
- interruptor de movimiento (Apagado · Encendido · Rayos X, que etiqueta cada pieza con «qué es · cómo se hizo»);
- movimiento reducido respetado;
- nada de cifras ni citas inventadas;
- en español, las reglas de redacción de `starseed-estudio-audiovisual` (`formatos-y-guiones.md` §9).

**Lo propio de StarSeed:** la skill parte de copiar un sitio ajeno; aquí no.
- El lienzo es el **ADN StarSeed** (tokens Trinity, skill `starseed-estudio-audiovisual`) o el sistema de diseño
  de la cuenta, página o grupo.
- Los sitios reales (`awesome-design-md`) solo sirven como referencia de estructura, nunca de marca.

## 2. Dónde vive

| Contexto | Cómo entra |
|---|---|
| **Protomolécula** | átomo `contenido-vivo` y molécula «publicación viva». `peticion/planificar` reconoce «hazlo vivo», «añade un 3D», «una película de scroll» o «un gráfico vivo» |
| **Astraura** | herramienta «Contenido vivo» en el picker «Conectores y habilidades» (`chat-herramientas.ts`); en un chat, Astraura arma el plan y lo abre en la Protomolécula sin salir del contexto |
| **Publicaciones de todo tipo** | en el lienzo universal (publicaciones, páginas, eventos, carteles e invitaciones, estaciones, mensajes, dashboards), un botón «Hacerla viva» que añade niveles a lo que ya existe sin rehacerlo |
| **Cuentas, páginas y grupos** | ajustes por ámbito (§4) |

## 3. Elegir la ruta: local o servicio externo, por tarea

**Tareas:** `escena-3d`, `fotograma-clave`, `foto`, `clip-pelicula`, `foto-viva`, `grafico-vivo`,
`revision-texto` y `comprobacion`.

**Candidatos** (catálogo de datos con `verificado` y `fuente`; lo no medido va «por-verificar»):

| Tarea | Local | Externo |
|---|---|---|
| `escena-3d` | Three.js (átomo `escena3d`) · Blender en una neurona capaz (el A1) | Spline por MCP (`https://mcp.spline.design/mcp`, con su cuenta; plan Pro: 200 llamadas al día que se reinician a las 00:00 UTC; una escena propia gasta ~6–10) · escena de la comunidad de Spline embebida, con crédito al autor |
| `fotograma-clave` y `foto` | modelos de imagen locales de la neurona (`areas/generacion-imagenes`: ComfyUI, FLUX, Qwen-Image según licencia) | Higgsfield Nano Banana 2 (2 créditos por imagen) · Google Flow (cuenta de Alex) |
| `clip-pelicula` | solo una neurona con GPU suficiente (por-verificar) | Higgsfield Seedance 2.0: 1080p y 5 s ≈ 60 créditos, 720p ≈ 30; con los dos extremos fijados y sin audio · Google Flow (Veo) |
| `foto-viva` | bucle de ida y vuelta con ffmpeg sobre un clip con inicio igual al final | el clip, de cualquiera de los de arriba |
| `grafico-vivo` | **siempre local**: código, HyperFrames y recetas propias; 0 créditos | — |
| `revision-texto` y `comprobacion` | **siempre local** | — |

**Puntuación de cada candidato** (función pura, con la razón escrita):
- encaje con la tarea (calidad conocida);
- coste en créditos frente al plan de la cuenta y al tope del ámbito;
- privacidad: nada de alcance personal va a un servicio externo sin permiso;
- disponibilidad: conectado, con cupo hoy, en una neurona capaz;
- licencia (comercial o no);
- latencia.

**Reglas de la elección:**
- **Local primero** si empata o si el externo no aporta lo que la tarea pide.
- **Externo** cuando gana con claridad (p. ej. una película fotorrealista).
- La comparación y la razón se muestran siempre.
- **Nunca se gastan créditos sin cotización y sin un «sí».**
- Si el servicio no está conectado, se ofrece el enlace para conectarlo a esa cuenta, página o grupo.

## 4. Ajustes por ámbito (cuenta, página y grupo)

- `localPrimero` (activado por defecto).
- Servicios externos permitidos (Spline, Higgsfield, Flow…).
- Tope de créditos al mes.
- Quién aprueba un gasto. En grupos y páginas sigue las reglas de su Protomolécula (`protomolecula-gobierno.md`):
  - propuesta democrática;
  - o personas con permiso.
- Libro de créditos por ámbito: fecha, servicio, modelo, créditos, tarea y quién lo aprobó.

## 5. Puertas

- **Comprobador propio** `scripts/contenido_vivo/comprobar.py`, más `comprobar_adn.py`. Comprueba:
  - que están los niveles;
  - un escudo sobre cada iframe 3D, para que la rueda siempre desplace la página;
  - movimiento reducido o interruptor;
  - sin oyentes de scroll sin `requestAnimationFrame` o `passive`;
  - que los recursos locales existen;
  - sin cajas de relleno;
  - logos reales, y una marca ficticia lo dice;
  - `window.__ready`.
- **Película:** `scripts/contenido_vivo/cortes.py` busca cortes dentro de cada clip y la continuidad de toda la
  película. Usa la SSIM de pares vecinos con ffmpeg, cada par juzgado contra su mediana local, nunca contra un
  umbral fijo.

## 6. Lo que NO se hace

- Copiar el código de la skill al repo o a la Biblioteca (no tiene licencia).
- Gastar créditos sin cotizar y sin un «sí».
- Mandar contenido personal a un servicio externo sin permiso de su alcance.
- Editar escenas de Spline ajenas: solo embeber o remezclar.
- Mostrar enlaces de afiliado.

## 7. Ola CVV1028 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola: `starseed_memory_root/olas/cola-contenido-vivo-1028.json`.

| Tarea | Qué |
|---|---|
| A | tipos y catálogo de rutas |
| B | elegir ruta (puntuación y razón) |
| C | ajustes por ámbito y libro de créditos |
| D | escudo 3D e interruptor de movimiento |
| E | película de scroll en canvas |
| F | átomo de la Protomolécula |
| G | `planificar` reconoce las peticiones |
| H | panel «Contenido vivo» con la comparación |
| I | herramienta de Astraura |
| J | conectores Spline y Higgsfield |
| K | botón «Hacerla viva» en el lienzo universal |
| L | comprobador |
| M | cortes y continuidad |

**Verificación:**
- las pruebas de cada tarea;
- en localhost:9002: el panel en una publicación, la comparación de rutas con Spline y Higgsfield sin conectar
  (botón «Conectar»), un gráfico vivo local que se mueve, y el interruptor de movimiento.
