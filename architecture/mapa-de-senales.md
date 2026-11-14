# Mapa de señales — pestaña «Mapa» en Señales: mapa geográfico de nodos y señales (MAP1114)

> **Petición de Alex (2026-11-13, 19:00; `claude/peticion-mapa-senales-1113.md`):** una pestaña nueva, «Mapa»,
> dentro de la sección Señales: un mapa global interactivo, en tiempo real, de los nodos y señales activos de todo
> StarSeed OS —neuronas móviles y nodos fijos, de cualquier medio, aparato, sistema y versión, en su ubicación
> real—, con colores de intensidad/calidad de señal y de capacidades ofrecidas, capas conmutables como las de un
> mapa del tiempo o de cobertura de telefonía, y la opción de añadir y configurar nodos públicos con permisos y
> preferencias por tipo de capa de conciencia.

> **SOP de esta ola (contrato, antes de construir).** Este documento fija de DÓNDE salen los datos, QUÉ falta,
> cómo se MUESTRAN y cómo se CONFIGURAN. **El modelo de «nodo» y la semántica de permisos/gobierno NO son de este
> contrato:** son de `architecture/control-remoto-entre-neuronas.md` (CRN1114, en paralelo). Aquí se referencia; no
> se redefine qué es un nodo, ni los niveles (ver/controlar/modificar/administrar), ni las solicitudes ni el
> consenso. Este contrato define la VISTA y la CONFIGURACIÓN sobre el mapa.

---

## 0. Qué hay ya (y qué no es esto)

Leaflet ya está instalado y en uso real: `react-leaflet@5` + `leaflet@1.9.4` (`package.json`). El patrón de mapa
geográfico vive en `src/components/maps/network-map.tsx` (`MapContainer`/`TileLayer`/`Marker`/`Popup`/`useMap`,
teselas `basemaps.cartocdn.com/dark_nolabels`, el arreglo del icono por defecto de Leaflet desde cdnjs, carga con
`dynamic(..., { ssr:false })`, botón «mi ubicación» por `navigator.geolocation`, capas conmutables por checkbox,
estado vacío honesto cuando nada tiene geografía) y en `src/components/maps/place-picker.tsx` (geocodificador
gratis Photon/Nominatim con debounce y AbortController, para COLOCAR un punto a mano). El Mapa reutiliza los dos.

**Lo que ya existe en Señales NO es esto.** `src/components/mesh/mapa-senales/mapa-senales.tsx` (`MapaSenales`,
SOP `architecture/mapa-3d-senales-reales.md`) es un **radar egocéntrico**: «Tú» en el centro y lo que esta neurona
oye, colocado por ángulo/fracción de radio, no por latitud/longitud (`SignalPlacement` es `angleRad`/`radiusFrac`,
`src/ai/astraura/mesh/signals.ts:311-325`). No tiene base geográfica. El Mapa es una vista **nueva y
complementaria**: el radar responde «qué oigo yo»; el Mapa responde «dónde está, en el mundo, lo que la red
publica y yo tengo permiso de ver». El radar sigue siendo el fallback sin base geográfica (§6).

La sección Señales son pestañas en `src/components/mesh/signals-center.tsx` (`tab: "antenas" | "redmesh" |
"router"`, línea 113). «Mapa» se añade como un valor más, de forma aditiva (§7, fase 1).

---

## 1. De dónde salen los datos (y qué falta)

Cada neurona ya publica, y el Mapa consume (solo lectura; módulos puros donde se pueda):

| Qué | Dónde está hoy | Lo usa el Mapa para |
|---|---|---|
| Identidad del aparato (equipo, SO, versión, arquitectura, huella, **build web** ACT1113F) | `src/lib/neurons/aparato-registro.ts` (`AparatoRegistro`, `capabilities.aparato`) | La ficha: aparato/SO/versión |
| Neuronas de mi cuenta y su enlace (estado, latencia, ruta) | `src/lib/network/malla-neuronas.ts` (`DispositivoMallaRow`) — **modelo de nodo, de CRN1114** | Marcas de mis aparatos y líneas de enlace |
| Presencia en vivo por medio (activa/segundo plano/en línea) | `src/lib/neurons/presencia.ts` (`usePresenciaNeuronas`, canal `neur:<token>`) | Estado vivo de cada marca |
| Señales medidas por medio (internet tipo/mbps, malla pares, LoRa estado/nodos, Bluetooth, serie) | `src/lib/neurons/senales-medio.ts` (`SenalesMedio`) | Capa Señal y antenas de la ficha |
| Señales oídas con su calidad real y su fuente | `src/ai/astraura/mesh/signals.ts` (`DetectedSignal`, `AntennaKind`, `quality`, `qualityFromSnr/Rssi/Rtt`) | Color del anillo, métricas de la ficha |
| Capas de conciencia encendidas y anunciadas | `src/lib/astraura/capas-conciencia.ts` (`local/mesh/nube/colectiva`), `src/lib/malla/anuncio-capas.ts` (`capa:*`) | Capa «Capas de conciencia» y ficha |
| Capacidades públicas declaradas y si ofrece internet | `StarseedIdentity.capabilities` (string[]), `offersPublic`, `port`, `region`, `preset` (`signals.ts:344-379`) | Capa Capacidades, tamaño de marca |

**Posición geográfica — lo único que existe hoy en lat/lon:**
- **Este aparato**: `navigator.geolocation` con permiso (fuente GPS de `signals.ts`; igual que `network-map`/`place-picker`).
- **Nodos LoRa**: `src/ai/astraura/mesh/meshtastic-adapter.ts:153-154` extrae `lat/lon` de los paquetes de posición del nodo.
- **Pares de la federación**: `src/ai/astraura/mesh/federation.ts:156-158` adjunta `self.lat/lon` al empujar la topología a `os_mesh_topology`, **solo con `privacy.sharePosition` encendido** (apagado por defecto, `privacy.ts:75`).

**Lo que FALTA y hay que añadir (nombrando módulos):**
1. **No hay una posición geográfica por neurona que llegue al Mapa.** `DetectedSignal.placement` es relativo al radar, no geográfico. Hace falta un modelo puro nuevo `src/lib/senales/geo/modelo-geo.ts` que una las tres fuentes de lat/lon de arriba con el aparato, la calidad, las capas y las capacidades, y un campo de posición en la presencia/anuncio (opt-in, §2) para las neuronas de la propia cuenta.
2. **No existe la «zona aproximada»**: la posición hoy viaja como punto crudo o no viaja. Hace falta `src/lib/senales/geo/zona.ts` (geohash truncado / desenfoque a rejilla) que produzca SIEMPRE una zona para la capa pública, nunca el punto.
3. **No hay registro geográfico de nodos fijos públicos.** Se define junto con el modelo de nodo de CRN1114 (no aquí): el Mapa solo lo lee y lo dibuja.
4. **La cadencia casi en tiempo real** hoy es el push de topología (45 s) + presencia Realtime. Para el Mapa basta reutilizarlos (decisión de Alex en §9 si se quiere más rápido). **Solo se pinta lo medido, con su hora; lo que no se sabe se dibuja como «desconocido», nunca con un número bonito** (regla heredada de `tipos-vivo.ts`).

---

## 2. Privacidad de la ubicación — regla dura, no opcional

1. **La posición exacta y en vivo de una neurona personal NO es pública por defecto:** la ve su dueño y solo quien él autorice (cuenta, página, grupo); en la capa pública una neurona móvil aparece como **zona aproximada**, salvo que su dueño publique el punto exacto, y un nodo fijo público muestra su punto solo si su operador lo publica.
2. **La posición la da cada sistema con permiso del usuario** (`navigator.geolocation`, GPS del radio LoRa); una máquina sin GPS da posición aproximada o colocada a mano con `place-picker`. Nada se deduce ni se rastrea por su cuenta.
3. **El modelo lo hace imposible de saltar**, no solo la UI: la posición cruda vive en el aparato y solo sale por un opt-in explícito y POR ÁMBITO (`privacy.sharePosition`, hoy un único booleano global, se amplía a ámbitos en coordinación con CRN1114); el faro/anuncio público jamás lleva el punto crudo, solo la zona de `zona.ts`; «publicar punto exacto» es otra opción, aparte, y el emisor ve en todo momento qué nivel comparte (reutiliza `src/lib/senales/radar-publico.ts`, que ya traduce la privacidad a frases). No hay ninguna vista ni campo que entregue un punto vivo a un ámbito que el dueño no autorizó: **un mapa con la posición exacta y en vivo de los aparatos de las personas es una herramienta de vigilancia, y eso es justo lo que este contrato prohíbe.**

---

## 3. Capas (conmutables como las del clima) y su color

Selector de capa arriba; una sola capa activa a la vez; leyenda de la capa activa abajo a la izquierda. Solo se pinta
lo medido; cada valor dice su hora y su fuente.

| Capa | Qué pinta | Escala de color / leyenda |
|---|---|---|
| **Señal** | Calidad por medio (Bluetooth, Wi-Fi, red local, internet), como mapa de calor | Gradiente por calidad 0..1 (`qualityFromSnr/Rssi/Rtt`, `signals.ts`): rojo (mala) → ámbar → verde (buena); gris = sin métrica. El medio se elige en un sub-conmutador. |
| **Capacidades** | Qué ofrece cada punto: cómputo, almacenamiento, internet compartido, modelos de Astraura | Categórica, un color por capacidad (de `StarseedIdentity.capabilities`/`offersPublic`); intensidad por cuánto ofrece; sin dato = contorno hueco. |
| **Capas de conciencia** | Qué capas (`local/mesh/nube/colectiva`) alcanza cada zona | Una pastilla/trama por capa activa de `anuncio-capas`; zona sin ninguna = atenuada. |
| **Antenas y medios** | Tipo de antena/medio presente (LoRa, BLE, Wi-Fi, serie, relé, IP) | Reutiliza `ANTENNA_COLOR`/`ANTENNA_LABEL` (`signals.ts:269-289`). |
| **Público / privado** | Qué es público (federación, nodos públicos) y qué es de mi cuenta/privado | Dos tintes (público cálido, privado frío) + el filtro de ámbito. |

Las definiciones de capa, su escala y su leyenda viven en un módulo puro nuevo `src/lib/senales/geo/capas.ts`
(reutiliza `escalas.ts` donde aplique), para que la leyenda y el pintado no puedan discrepar.

---

## 4. Marcas, enlaces y ficha

- **Marcas:** **punto** = neurona móvil; **rombo** = nodo fijo (igual que `network-map`: círculo para comunidad, rombo `rotate-45` para evento). **Anillo de color** = calidad de señal; **tamaño** = capacidad ofrecida. Posición desconocida → marca en «zona» con **halo grande de incertidumbre** (como hace el radar con `accuracyFrac`), nunca un punto falso.
- **Enlaces:** líneas entre marcas por los enlaces activos medidos (`DispositivoMallaRow.enlace`, clases de `tipos-vivo.ts` `ClaseEnlace`), **grosor por caudal** (throughput medido; sin dato = línea fina punteada).
- **Ficha al tocar una marca** (reutiliza `FichaMapa`/`SeccionFicha`/`Dato` de `src/lib/senales/tipos-vivo.ts`, cada valor con su fuente y su estado medido/declarado/estimado/no-medido): nombre, aparato y sistema, versión y build web, antenas y medios con su calidad medida y su hora, capas de conciencia, qué ofrece y a quién, y **los botones que su permiso admita** — ver, pedir acceso, configurar. **Qué habilita cada botón y la máquina de solicitudes/consenso son de CRN1114**; el Mapa solo muestra el botón que CRN1114 dice que corresponde y llama a su API.

---

## 5. «Añadir nodo» (asistente de 3 pasos)

Botón «Añadir nodo» en el Mapa → asistente de tres pasos, **prerrellenado con lo que el aparato ya detecta**:
1. **Qué aparato es** — de `aparato-registro.ts` + `permisos-antenas` (plataforma, antenas disponibles); posición por GPS o colocada a mano con `place-picker`.
2. **Qué ofrece** — cómputo/almacenamiento/internet/modelos y capas de conciencia, de `SenalesMedio` + `capas-conciencia`.
3. **Para quién** — público o privado, por cuenta/página/grupo y por tipo de capa (colectiva y/o privada).

El asistente configura **según el SO del aparato** (lo que cada sistema permite). **La creación del nodo, sus
permisos, su gobierno democrático (nodos públicos) o manual (privados) son de CRN1114**; el asistente reúne los
datos y llama a su API. No se duplica aquí el modelo de nodo.

---

## 6. Sin internet y en el teléfono

- **Sin red:** la base geográfica de Leaflet no carga salvo zonas de teselas ya guardadas. Debe existir **la misma vista como esquema de la malla sin fondo geográfico** — se reutiliza la vista plana del radar (`src/components/mesh/mapa-senales/vista-plana.tsx`) con las mismas marcas y enlaces, colocadas por relación en vez de por coordenadas. El cambio a esquema es automático y se avisa («sin base geográfica: esquema de la malla»), nunca un mapa en blanco.
- **Teléfono:** la ficha sube como **hoja inferior** (bottom sheet); el selector de capa y el filtro van en **una sola fila que se desplaza** en horizontal. Modo compacto como ya hace `useCompacto` en el radar.

---

## 7. Fases (cada una se puede publicar sola) y archivos que posee cada una

**Fase 1 — Mis neuronas y las de mi cuenta.** Posición (GPS de este aparato + federación opt-in de mi cuenta), antenas, calidad de enlace y capas; ficha y filtro; el radar como fallback sin base. Sin nodos públicos todavía. Archivos que posee:
- `architecture/mapa-de-senales.md` (este contrato).
- Modelo puro nuevo: `src/lib/senales/geo/modelo-geo.ts`, `src/lib/senales/geo/capas.ts` (capas + escalas + leyenda), `src/lib/senales/geo/zona.ts` (zona aproximada), `src/lib/senales/geo/marcas.ts` (punto/rombo, anillo, tamaño), `src/lib/senales/geo/ficha-geo.ts` (sobre `FichaMapa`).
- Componentes nuevos bajo `src/components/mesh/mapa-senales/geo/`: `mapa-geo.tsx` (contenedor Leaflet, `dynamic ssr:false`), `capa-selector.tsx`, `leyenda.tsx`, `filtro.tsx` (mis neuronas · mi cuenta · grupos · público), `ficha-geo.tsx` (ficha / hoja inferior), `esquema-sin-base.tsx` (fallback sin red).
- Cableado aditivo de la pestaña «Mapa» en `src/components/mesh/signals-center.tsx`, en un bloque marcado `// MAP1114` (cambio mínimo: añadir el valor `"mapa"` al estado y su `<TabsContent>`).

**Fase 2 — Capas de calor y de capacidades; esquema sin internet.** Capa Señal (calor por medio) y Capa Capacidades completas, y pulido del esquema offline. Archivos: amplía `geo/capas.ts`, `geo/marcas.ts` y añade `src/components/mesh/mapa-senales/geo/capa-calor.tsx`.

**Fase 3 — Nodos públicos: añadir, configurar, permisos y preferencias por capa.** El asistente de §5 y los botones de la ficha. **Se apoya en CRN1114** para el modelo de nodo, los permisos y el gobierno. Archivos del Mapa: `src/components/mesh/mapa-senales/geo/asistente-nodo.tsx` y la lectura del registro geográfico de nodos que defina CRN1114.

**Fase 4 — Grupos, páginas y comunidades y su gobierno.** Ámbitos de visibilidad y consenso democrático, **todo vía CRN1114**; el Mapa añade los ámbitos al filtro y a la zona por ámbito.

---

## 8. Reglas duras (no romper)

- Solo se pinta lo medido, con su hora; lo desconocido se dice «desconocido» y se pinta con halo grande, nunca con un punto o un número inventado.
- La posición cruda no sale del aparato salvo opt-in por ámbito; el faro público solo lleva zona, nunca el punto; «publicar punto exacto» es una decisión separada y reversible al instante.
- Nada de este contrato redefine el modelo de nodo, los niveles de permiso, las solicitudes ni el consenso: eso es de `architecture/control-remoto-entre-neuronas.md` (CRN1114). El Mapa muestra y llama; no decide política.
- Módulos puros (`src/lib/senales/geo/**`) sin React, sin red y sin `node:*` (regla de empaquetado del repo); Leaflet solo en componentes con `dynamic ssr:false`.
- Toda mejora de defaults migra las configs persistidas o las cuentas existentes no la ven (`starseed-os-update-propagation`).

---

## 9. Decisiones que necesitan a Alex

1. **Grano de la zona pública** (precisión del geohash: ~1 km por defecto) y si «publicar punto exacto» es por neurona o por cuenta.
2. **Teselas del mapa**: CartoCDN oscuro (ya en uso) exige atribución; teselas offline solo para zonas guardadas. ¿Se mantiene CartoCDN o se prefiere un proveedor propio/gratuito?
3. **Registro geográfico de nodos fijos**: ¿tabla nueva o montar la geo sobre `os_mesh_topology`/`os_pages`? Se decide con el modelo de nodo de CRN1114.
4. **Cadencia casi en tiempo real**: reutilizar el push de topología (45 s) + presencia Realtime, o abrir un canal más rápido solo para el Mapa.
