# 14 repos en la Biblioteca como publicaciones autoactualizables (Ola 1020)

> **Petición de Alex (2026-10-20), resumida:** agregar e instalar 14 repositorios en StarSeed OS
> donde correspondan y en su Biblioteca como publicaciones autoactualizables, integradas en todos
> los contextos de la red; instalarlas también para nosotros en Claude y para MetaGenesis,
> PoliGenesis, Genesis, la Protomolécula y Astraura, autoactualizables desde sus publicaciones de la
> Biblioteca. **Todas las repos de la Biblioteca deben autobuscar en sus páginas de releases y en las
> repos correspondientes.** (La repo nº 15, `zhaoxuya520/reverse-skill`, queda EXCLUIDA por seguridad:
> es enrutado de ingeniería inversa / pentest; no se instala ni se integra.)

Amplía `libreria-biblioteca-sync.md` y usa el catálogo verificado `config/repos-libreria-1020.json`
(licencias comprobadas el 2026-10-20 contra `api.github.com/repos/<r>/license`).

## 1. Lo que ya existe (no se duplica)

La Biblioteca ya tiene **dos** caminos de novedades, los dos reales y sin claves:

- `src/lib/notifications/available-updates.ts` — para cada paquete **instalado** lee
  `payload.externalUrl` (o `payload.url`), saca `owner/repo` y consulta
  `GET /repos/{r}/releases/latest` **y** `/tags`. Es decir, **cualquier paquete con un
  `payload.externalUrl` de GitHub ya autobusca releases.** Tolera 403 (límite anónimo) y 404 (sin
  releases) sin romper; cachea 6 h. → Es el motor que cumple «autobuscar en releases».
- `src/lib/library/actualizaciones.ts` + `/api/library/actualizaciones` — módulo PURO que hoy solo
  mira el **último commit** (`/commits?per_page=1`) o la ficha de Hugging Face. Le falta el canal
  releases para dar paridad con el de arriba (tarea 2).

Y el sondeo por neurona `scripts/puente/mejoras_neurona.py` ya consulta releases/commits/HF/PyPI/npm
para Genesis y las capas de Astraura. No se crea ningún motor nuevo: se **alimentan** estos.

## 2. Canal de cada repo (declarado en el catálogo)

Cada entrada declara su upstream y su `canal`: `releases` (tiene releases estables), `tags` (versiona
por tag sin releases) o `commits` (aún sin versiones; se sigue el último commit). El motor elige la
consulta por ese canal. Catálogo (14):

| id | repo | kind | canal | área del OS | licencia (resumen) |
|---|---|---|---|---|---|
| lib-wordcraft | storytold/wordcraft | app | releases | Documentos, Protomolécula | Apache-2.0 · joven: fijar SHA |
| lib-artemis | google/artemis | ai-source | commits | Astraura, Genesis | Apache-2.0 · MCP Android |
| lib-openterminal | ErTasselli/OpenTerminal | app | releases | Economía, widgets | MIT |
| lib-anatomy | wheresryan22/anatomy | function | releases | Estudio, Protomolécula, Biblioteca | MIT · **skill de agente** |
| lib-solidcraft | tangency-labs/solidcraft | app | releases | Protomolécula, StarSeed XR | Apache-2.0 · MCP CAD · joven |
| lib-xerj | xerj-org/xerj | ai-source | releases | Astraura, Genesis, cerebros | Apache-2.0 · MCP · joven |
| lib-itsaplan | croffasia/itsaplan | app | releases | Genesis, MetaGenesis | AGPL-3.0 · MCP gestión |
| lib-unsloth | unslothai/unsloth | ai-source | commits | capas-astraura, colmena | Apache-2.0 |
| lib-gods-eye | bilawalsidhu/gods-eye-view | app | releases | **mapas**, StarSeed XR | MIT código / datos NC → externo |
| lib-detectron2 | facebookresearch/detectron2 | ai-source | commits | avatares-3d, imágenes, Protomolécula | Apache-2.0 · pesos por modelo |
| lib-ods | Osmantic/ODS | app | releases | colmena, Oracle A1 | Apache-2.0 (+ Pixel source-available) |
| lib-wechaty | wechaty/wechaty | ai-source | tags | Hermes, Astraura, mensajería | Apache-2.0 |
| lib-airllm | lyogavin/airllm | ai-source | releases | capas-astraura, colmena | Apache-2.0 |
| lib-mesh2motion | Mesh2Motion/mesh2motion-app | app | commits | avatares-3d, Protomolécula | MIT código / assets CC0 |

**gods-eye-view (para los mapas):** el código es MIT, pero trae datos empaquetados y en vivo con
licencia propia, varios **CC-BY-NC** (TeleGeography, Vantor). StarSeed es contexto público/comercial,
así que entra como **app externa** (`externalUrl`, se abre o se enlaza), no se aloja su build con
esos datasets. Si algún día se aloja, hay que quitarlos antes (regla: nada no-comercial en uso
comercial). Alimenta la capa de mapas que ya usa Leaflet (`src/components/maps`, `map-widget`).

## 3. Dónde encaja cada una (integración honesta)

- **Instalar NO descarga ni lanza servidores.** Tres efectos, como el resto del catálogo:
  FUNCIONAL (corre ya), CONECTOR (servidor que levanta Alex; instalar registra la capacidad + el
  enlace, el endpoint se pega en Ajustes → Integraciones) o CATÁLOGO/EXTERNO (guarda el enlace y
  abre el repo/app). Las MCP (artemis, solidcraft, itsaplan, xerj) son CONECTOR; wordcraft/
  openterminal/ods/gods-eye son app o externo; detectron2/unsloth/airllm/wechaty son `ai-source`.
- **Área:** el `payload.area` y la `ruta_os`/`externalUrl` del catálogo colocan cada publicación en
  su sección (mapas, Economía, Documentos, avatares-3d, cerebros…). La ficha dice qué hace de verdad
  y, cuando aún no hay efecto, el botón queda deshabilitado (`comingSoon`).
- **Para los agentes (Claude, Genesis, MetaGenesis, PoliGenesis, Protomolécula, Astraura):** las que
  son herramientas de agente se instalan donde el agente las usa. `anatomy` es skill de agente: ya
  instalada por Claude en la Mac (`~/.claude/skills`, `~/.config/opencode/skills`, `~/.agents/skills`)
  y en el A1 (`/home/starseed/.config/opencode/skills`), fijada a v1.1.0. Las MCP quedan listadas
  como conectores a cablear cuando Alex levante su servidor; no se auto-arrancan.

## 4. Autoactualización desde la Biblioteca (lo que cumple la petición)

Un paquete con `payload.externalUrl` de GitHub **ya** autobusca su release más reciente en
`available-updates.ts`. Para que las 14 lo hagan:

1. Entran en un repo builtin nuevo de la Biblioteca con `payload.externalUrl` = su URL de GitHub y
   `payload.githubRepo` = `owner/repo` (tarea 1).
2. `actualizaciones.ts` (módulo puro) gana el canal releases para dar la misma respuesta por la ruta
   `/api/library/actualizaciones` (tarea 2).
3. Las que son herramientas de la Protomolécula (solidcraft CAD, detectron2 visión, mesh2motion
   rigging) entran también en `catalogo-herramientas.ts` con su `actualizacion.fuente` real, para que
   el sondeo por neurona las siga (tarea 3).

Nada se descarga ni se entrena con contenido de terceros; se respeta `canal`/licencia de cada una.

## 5. Tareas del enjambre (ola `repos-libreria-1020`)

1. **Repo builtin externo 1020.** `src/lib/library/repos-externos-1020.ts`: lee
   `config/repos-libreria-1020.json`, mapea a `LibraryPackage[]` (kind, `payload.externalUrl`,
   `payload.githubRepo`, `payload.canal`, `payload.area`, `payload.licencia`, `aviso`→descripción,
   `comingSoon:true` para las sin efecto real), exporta `REPO_EXTERNOS_1020: LibraryRepo`; se añade a
   `listRepos()`. Test: 14 ids únicos, todas con externalUrl de GitHub, `reverse-skill` ausente.
2. **Releases en `actualizaciones.ts`.** Añadir a `urlDeConsulta`/`leerVersion` el canal releases
   (`/releases/latest` → `tag_name`; respaldo `/tags`) según `payload.canal`, sin romper el de
   commits/HF. Test del nuevo canal.
3. **Protomolécula.** Fichas verificadas de `solidcraft`, `detectron2` y `mesh2motion` en
   `catalogo-herramientas.ts` con `actualizacion.fuente` real y avisos de licencia. Test.

Reglas de cada tarea: ≤120 líneas nuevas por archivo, ≤3 archivos, módulos puros sin `node:*` en
cliente, nada de `any`, honestidad radical en cada ficha (qué hace de verdad), y respetar licencias.

## 6. Exclusión permanente

`zhaoxuya520/reverse-skill` — NO se instala, NO se publica, NO se integra. Enrutador de
ingeniería inversa / pentest; queda fuera por seguridad. Registrado en el bloque `excluida` del
catálogo para que ninguna ola futura la reintroduzca.
