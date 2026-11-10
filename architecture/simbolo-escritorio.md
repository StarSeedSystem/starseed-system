# Símbolo del escritorio — archivo de símbolo (ESC1110B)

El símbolo del escritorio vacío es un **archivo**: un JSON abierto y versionado que describe la forma, el
material, las luces, la pose de reposo y los comportamientos. El símbolo oficial StarSeed es el archivo por
defecto que trae la app; el componente `SimboloStarSeed3D` pinta el archivo que reciba. Cada perfil, página y
grupo puede elegir el suyo, exportarlo, transformarlo en la Protomolécula o volver al oficial.

Código: `src/components/brand/simbolo-archivo.ts` (formato y validador), `simbolo-registro.ts` (ajuste por
ámbito y migración), `simbolo-almacen.ts` (nube y ganchos), `simbolo-ajustes.tsx` (UI),
`simbolo-personalizado.ts` (carga de GLB/SVG/imagen), `src/lib/protomolecula/atomos/simbolo-escritorio.ts`
(átomo de la Protomolécula).

## 1. Formato `starseed-simbolo` v1

Tipo MIME `application/vnd.starseed.simbolo+json`, extensión `.simbolo.json`.

```json
{
  "formato": "starseed-simbolo",
  "version": 1,
  "nombre": "Símbolo oficial StarSeed",
  "fuente": { "tipo": "oficial" },
  "material": { "color": "#EAEAEA", "rugosidad": 0.4, "metalico": 0, "laca": 0.4 },
  "luces": {
    "clave":   { "intensidad": 3.2, "color": "#FFF4E6" },
    "relleno": { "intensidad": 0.4, "color": "#CFE0FF" },
    "contra":  { "intensidad": 3.0, "color": "#BFE8FF" },
    "entorno": 0.4
  },
  "pose": { "guinada": 16, "cabeceo": 6, "escala": 1, "flotacion": 1 },
  "comportamientos": {
    "seguirCursor": true, "parpadeo": true, "parpadeoOcioso": true,
    "rotacionFlor": true, "fusionFlor": true, "velocidadFlor": 1, "pausaFlor": 7
  }
}
```

Todo campo es opcional salvo `formato` y `version`: lo que falte se hereda del oficial. Los campos
desconocidos se descartan.

### `fuente`

| tipo      | datos                                                                 | extra                         |
|-----------|-----------------------------------------------------------------------|-------------------------------|
| `oficial` | —                                                                     | —                             |
| `gltf`    | `data:model/gltf-binary;base64,…` o `data:model/gltf+json;base64,…`    | —                             |
| `svg`     | el SVG en texto                                                        | `profundidad` 0,01–0,4 (extrusión) |
| `imagen`  | `data:image/png|jpeg|webp;base64,…`                                    | `relieve` 0–0,3 (desplazamiento por luminancia) |

Un símbolo propio se encaja en la caja del oficial (1 × 1,497 unidades, centrado en el ojo) con escala
uniforme: nada se deforma. Los símbolos propios no tienen ojo: «seguir el cursor» inclina la pieza entera.

### Rangos

`pose.guinada` −45…45° · `pose.cabeceo` −30…30° · `pose.escala` 0,5…1,5 · `pose.flotacion` 0…1 ·
`luces.clave` 0…6 · `luces.relleno` 0…3 · `luces.contra` 0…6 · `luces.entorno` 0…2 ·
`material.rugosidad|metalico|laca` 0…1 · `velocidadFlor` 0…3 (0 = sin giro automático) · `pausaFlor` 1…30 s.
Fuera de rango se acota y se avisa; un número que no lo es toma el del oficial.

## 2. Seguridad (validación estricta)

- Solo recursos incrustados `data:`; ninguna URL remota ni relativa (tampoco dentro de un glTF: `buffers[].uri`
  e `images[].uri` deben ser `data:`; un GLB se comprueba por cabecera, versión 2, longitud y trozo JSON).
- Topes: archivo entero 1 MB · modelo 768 KB · SVG 128 KB · imagen 512 KB · nombre 60 caracteres (sin `<>`).
- SVG: sin `script`, `foreignObject`, `iframe`, `embed`, `object`, `image`, `audio`, `video`, sin manejadores
  `on…`, sin `javascript:`/`vbscript:`/`data:text/html`, sin `@import`, sin DOCTYPE ni entidades, y toda
  referencia (`href`, `xlink:href`, `url(…)`) interna (`#id`).
- Se revalida al cargar el modelo (defensa en profundidad) y al migrar lo guardado.
- Un archivo malo cae al **oficial** con un motivo claro; nunca se pinta a medias.

## 3. Regla de marca

El símbolo OFICIAL no se deforma ni se recolorea: con `fuente.tipo = "oficial"` se ignoran `material` y el
color de las luces, y la intensidad de cada luz solo se matiza dentro de ±40 % de la de marca. La escala es
uniforme. Un símbolo propio es de su dueño y se rotula «Símbolo propio de …» en la bienvenida y en los ajustes.

## 4. Dónde se guarda por ámbito (sin migraciones)

| Ámbito  | Nube (`entity_state`)                                         | Ajuste en la UI                                  |
|---------|---------------------------------------------------------------|--------------------------------------------------|
| perfil  | `{kind:"user", id:uid}`, clave `simbolo-escritorio.perfil.<perfilId>` | Ajustes del escritorio → «Símbolo del escritorio» (perfil activo) |
| página  | `{kind:"page", id:slug}`, clave `simbolo-escritorio`          | Página → Personalizar formato → «Símbolo del escritorio» |
| grupo   | `{kind:"group", id:slug}`, clave `simbolo-escritorio`         | Grupo → Personalizar formato → «Símbolo del escritorio» |

Copia local (local primero, sin conexión): `localStorage["starseed.escritorio.simbolo.v1"]` =
`{ v: 1, entradas: { "<ámbito>:<id>": Registro } }`. Tiempo real con `subscribeEntityState`. Gana el más
reciente (`actualizado`).

Registro v1: `{ v: 1, archivo: ArchivoSimbolo | null (= oficial), actualizado: ms, protomolecula?: id }`.
Migración (`migrarRegistro`): nada u `"oficial"` → oficial; un archivo suelto (v0) → se envuelve; v1 → se
revalida; otra versión o basura → oficial con motivo.

Resolución en el escritorio: **página o grupo › perfil activo › oficial**. `DesktopCanvas` acepta
`entidadSimbolo` para cuando un escritorio pertenezca a una página o un grupo; hoy los escritorios son del
perfil (los espacios compartidos no tienen aún una página o grupo dueño), así que el ajuste de página y grupo se
guarda y se edita, y el gancho está listo para el escritorio de esa entidad.

## 5. Protomolécula (ida y vuelta)

«Abrir en la Protomolécula» crea una molécula del núcleo (`simbolo-<ámbito>-<id>`) con una capa `escena3d`
que **cita** el símbolo (`referencia {tipo:"simbolo-escritorio", id:"<ámbito>:<id>"}`) y un átomo «Símbolo
del escritorio» con 17 parámetros (pose, luces, comportamientos y, en uno propio, rugosidad y metálico). La
guarda en el almacén de moléculas y abre la orbe sobre ella (`starseed:protomolecula-abrir`). La vista del
átomo pinta el símbolo vivo con los valores del panel. Mientras el ajuste está enlazado, cada vez que la
molécula se guarda sus valores vuelven al archivo del dueño (validados) solos.

Lo que aún no hace: la forma (vértices, extrusión del SVG, modelo) no se edita en la Protomolécula; sus
herramientas 3D trabajan sobre parámetros. La forma de un símbolo propio se cambia eligiendo otro archivo o
editando el `.simbolo.json` exportado.
