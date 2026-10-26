# Protomolécula · el gobierno de cada grupo, comunidad y página (2026-10-26 · Ola 1026P · PRO1026P2)

> Petición de Alex del 2026-10-26: opciones para los grupos, las comunidades y las páginas sobre **la privacidad y las
> reglas de su Protomolécula, con permisos y accesos de modificación**; los cambios de cualquier tipo **se sugieren
> democráticamente**, o se dan **permisos a ciertas personas para modificar o acceder sin los pasos democráticos**; y todo
> relativo a las preferencias **principalmente democráticas del OS, pero privadas**, respetando lo propio y lo comunal.
>
> Contrato de `decidirCambio` en `src/lib/protomolecula/peticion/contrato.ts` (`ContextoProto`, `ActorProto`,
> `TipoCambioProto`, `VeredictoGobierno`). Este documento cubre lo que hay detrás del veredicto.

## 0 · Las reglas que mandan (no se pueden quitar)

1. **Transparencia del poder ejercido.** Las reglas de una entidad las ve cualquier persona que pueda abrir su
   Protomolécula; cada uso de un permiso directo queda anotado a la vista; todo veredicto lleva su motivo en lenguaje claro
   y `transparente: true`. **No existe ningún campo, ni en el modelo ni en lo que se lee de la cuenta, que permita apagarlo.**
2. **Ninguna IA aprueba sola.** Si el origen del actor es `ia` o `agente`, el veredicto lleva `confirmar: true` siempre
   (también con un permiso directo, también siendo la dueña quien lo pidió). Una IA o un agente sin una persona detrás
   (sin `usuarioId` ni dueña) se **deniega**: actúan en nombre de alguien o no actúan.
3. **Lo personal es siempre del dueño.** En los ámbitos `personal` y `perfil` no hay entidad que decida: manda
   `decidirResultado` (la dueña acepta, nadie más cambia).
4. **Las reglas y los permisos nunca se saltan por un permiso directo.** Un permiso directo solo cubre contenido,
   diseño, funciones y creación. Cambiar las reglas o los permisos sigue su propia regla (por defecto, votación).
5. **«Propuesta» no vale para reglas ni permisos.** En modo propuesta decide quien gestiona y la votación es
   orientativa; para tocar las reglas mismas solo caben «directo» (quien tenga rol) o «votación». Si algo guardado trae
   «propuesta» ahí, se corrige al leerlo.
6. **El acceso nunca es más abierto que la visibilidad.** Privada → solo quien gestiona; solo miembros → miembros;
   pública → cualquiera. Y «usar» nunca es más abierto que «abrir».
7. **Quien solo observa, mira.** Un rol de observación no cambia nada (salvo que una persona concreta le haya dado un
   permiso directo a su nombre). Un rol «pendiente» o «ninguno» no es pertenencia.
8. **Una ficha no promete lo que no hace.** La interfaz dice dónde se guarda cada cosa (cuenta o solo este aparato) y
   el registro de usos dice que vive en el aparato.

## 1 · El modelo (`src/lib/protomolecula/gobierno/reglas.ts`, puro)

`ReglasProtomolecula` por entidad (grupo · comunidad · página; `EntidadProto.id` es el slug del `scopeRef` del motor
de gobernanza):

| Campo | Valores |
|---|---|
| `visibilidad` | `privada` · `miembros` · `publica` |
| `cambios[tipo]` | `directo` · `propuesta` · `votacion`, para cada `TipoCambioProto` (contenido · diseno · funciones · permisos · reglas · creacion) |
| `permisosDirectos[]` | `{ id, sujeto, tipos, concedidoPor, concedidoEn, caduca?, motivo? }`, máximo 50 |
| `acceso` | `{ abrir, usar }`: `cualquiera` · `miembros` · `colaboracion` · `gestion` · `dueno` |

`sujeto` es un **rol mínimo** (`miembros`, `colaboracion`, `gestion`: «desde ese rol hacia arriba», nunca el
observador) o una **persona** (`usuarioId`; vale aunque no sea miembro ni observe). Un permiso caducado no vale y la
razón del veredicto lo dice («Tu permiso directo caducó el …»).

Funciones: `reglasPorDefecto`, `normalizarReglas` (lo que viene de fuera se sanea e impone las invariantes de arriba;
nunca lanza), `serializarReglas`, `crearPermiso`/`conPermiso`/`sinPermiso`, `permisoVigente`, `acotarAcceso`,
`tiposTocados(antes, después)` y `describirCambios` (para explicar un cambio antes de pedirlo).

### Valores por defecto (derivados de las preferencias del OS, democrático primero)

| Tipo | Democrático (por defecto) | Jerárquico (solo si la entidad lo eligió) |
|---|---|---|
| contenido | directo (quien tenga rol de colaboración o más) | directo |
| diseño · funciones · creación | **propuesta** | directo |
| permisos · reglas | **votación** | directo |

Visibilidad `miembros`; acceso `{ abrir: miembros, usar: miembros }`. Las **páginas** siguen el `GovernanceMode` de su
configuración (`governance_configs.mode`); un grupo o comunidad sin configuración se trata como democrático.

## 2 · Cómo se decide (`decision.ts`, puro · `index.ts`)

`decidirCambio(contexto, actor, tipo, entorno?)` (misma firma de tres argumentos que el esqueleto; el cuarto es
opcional) completa el entorno con la caché del almacén y llama a `decidirCambioConReglas`, que devuelve un
`VeredictoDetallado` (extiende `VeredictoGobierno` con `via`, `reglas` —`entidad` | `por-defecto` | `ninguna`—, `modo`,
`permisoId`, `transparente`). Orden de las comprobaciones:

1. Tipo inválido → **denegar**.
2. IA o agente sin persona detrás → **denegar** (`sin-persona`).
3. Ámbito personal o perfil → `decidirResultado`: la dueña **aplica**, el resto **deniega**.
4. Sin entidad gobernante (algo de ámbito grupo/público sin gobierno propio) → la dueña aplica; si no, `decidirResultado`
   (democrático: **votar** sin borrador, con la nota de que se redacta en Decisiones).
5. **Acceso «usar»**: si el rol no alcanza y no hay permiso directo → **denegar** (`sin-acceso`).
6. **Rango según el modo** (`rangoDeRol`/`decidirAplicacion` de PoliGenesis, sin reimplementar el mapa de roles):
   contenido y creación piden colaboración (rango 2); diseño, funciones y permisos, gestión (3); reglas, dueña (4).
   En modo `directo` basta ese rango; en `propuesta` decide quien gestiona (al menos rango 3); en `votacion` **nadie**
   aplica por rango: todas las personas pasan por el voto. Si alcanza → **aplicar** (`via: rango`).
7. **Permiso directo vigente** para ese tipo (solo tipos delegables) → **aplicar** (`via: permiso-directo`, con el
   `permisoId` para anotar el uso).
8. No miembro → **denegar**; observador → **denegar**.
9. Modo `propuesta` → **proponer**; el resto → **votar**. Los dos llevan el borrador `proposalForChange`
   (`set_config`) para el compositor existente (`ProposalComposer`).

`confirmar` es `true` siempre que el origen sea IA o agente y el veredicto no sea denegar. Los tests recorren los
ámbitos, los roles, los tres modos, los permisos vigentes y caducados, y la IA que no aprueba sola.

### El borrador de propuesta

Para reglas y permisos, la clave es `protomolecula.reglas` y el valor, las reglas completas serializadas: al
aprobarse, el motor existente las aplica solo (`gov_apply_approved_config`, en el servidor). Para los demás tipos, la
clave es `protomolecula.cambio.<tipo>`: aprobarlo **autoriza** el cambio, que se aplica desde la Protomolécula (el
texto del borrador no promete aplicación automática). La nota dice si se vota con umbral y quórum o si decide quien
gestiona.

## 3 · Dónde se guardan las reglas (`almacen.ts`, `entorno.ts`, `registro.ts`)

- **Cuenta (vía existente):** `governance_configs.params.config["protomolecula.reglas"]`, como texto JSON, en el
  ámbito `group` / `community` / `page`. Se lee con `getConfig`; la escritura directa pasa por `saveConfig` y su
  **verja de propiedad** (solo la cuenta dueña escribe directamente; el error contiene «propietario»). El resto de
  personas lleva el cambio a propuesta o votación. Se importan a demanda (`import()`) para que la orbe, que puede
  colgar del layout raíz, no arrastre Supabase ni el motor de gobernanza.
- **Este aparato (con aviso):** si la cuenta no responde, las reglas quedan **solo en el aparato** y la interfaz
  lo dice («las demás personas todavía no lo ven»). Espejo local en `starseed.protomolecula.gobierno.v1` (máximo 40
  entidades, saneado al leer; nunca se fía de lo que haya guardado).
- **Registro de usos de permisos directos:** `starseed.protomolecula.gobierno.usos.v1` (máximo 200). Solo anota cuando
  el veredicto es `aplicar` por `permiso-directo`. **Es local al aparato**: para que todas las personas lo vean hace
  falta una tabla compartida que aún no existe (propuesta: `protomolecula_gobierno_usos`, con RLS por entidad). La
  interfaz lo dice.
- Evento `starseed:protomolecula-gobierno` (`EVENTO_GOBIERNO_PROTO`) cuando algo cambia: el hook y las listas se
  refrescan.

## 4 · Interfaz (`src/components/protomolecula/gobierno/`)

- **`SeccionGobiernoProto`** (`kind`, `slug`, `name`, `accent`): título «Protomolécula del grupo / de la comunidad / de la
  página»; visibilidad (radiogrupo), acceso (abrir/usar), tabla tipo × modo con la columna «Para ti» (qué pasaría con tu
  rol y con las reglas que estás editando), `PermisosDirectos` con vigencia (sin caducidad · 7 · 30 · 90 días) y
  `RegistroUsos`. **Cambiar las reglas sigue su propia regla:** el botón guarda (rol suficiente), propone o lleva a
  votación según el veredicto más estricto de los tipos que toca el cambio; con votación o propuesta abre el
  `ProposalComposer` ya relleno en un diálogo. Si la verja de propiedad lo bloquea, ofrece el borrador de votación en
  lugar de rendirse. Quien no forma parte, quien observa y quien no tiene sesión ve todo en solo lectura, con el motivo.
- **Montaje:** al final de `DecisionesSection` (`src/components/governance/decisiones-section.tsx`), que ya cuelga de la
  pestaña «Gobernanza» de `/grupo/[slug]`, `/pagina/[slug]` y de los toolkits de comunidad, EF, partido y asamblea.
- **`GobiernoProtoResumen`** (`contexto`): resumen compacto para la pestaña «Gobierno» de la ventana de la orbe (lo monta
  P1). Ligero a propósito: sin compositor ni motor de gobernanza. Sin entidad gobernante dice que lo personal es de
  su dueño; con ella, chips, acceso, la fila de cada tipo con lo que puedes hacer y un enlace a los ajustes
  (`/grupo/<id>` para grupos y comunidades, `/pagina/<id>` para páginas).
- **`useGobiernoProto(contexto)`**: carga reglas, rol y modo, y ofrece `decidir(tipo, origen?, cambio?)`.
- Estilo cristal líquido StarSeed, objetivos táctiles de 44 px (`min-h-11`), 360 px de ancho, transiciones de 200 ms
  solo en color y `motion-reduce`, iconos Lucide.

## 5 · Límites honestos

- El registro de usos es del aparato (ver §3).
- «Propuesta» es, con el motor actual, una propuesta visible cuya votación es orientativa: el motor no tiene una vía de
  «aprueba quien gestiona». Quien gestiona aplica el cambio; por eso no se admite para reglas ni permisos.
- La verja de propiedad de `saveConfig` limita la escritura directa de las reglas a la cuenta dueña; una persona con
  rol de gestión pasa por la propuesta aunque el veredicto de rango sea favorable.
- No hay enlace profundo a la pestaña «Gobernanza» (`?tab=`): los enlaces van a la página de la entidad.
- Los permisos directos por rol se evalúan con el rol que devuelve `roleOf`; un cambio de rol se nota al recargar.

## 6 · Pruebas

`src/lib/protomolecula/gobierno/__tests__/` (puras: reglas, decisión exhaustiva, almacén y registro, entorno con
Supabase y gobernanza simulados) y `src/components/protomolecula/gobierno/__tests__/` (Testing Library: la sección, los
permisos directos, el registro y el resumen). Añadir un tipo de cambio o un modo nuevo = tocar `reglas.ts` (modelo,
etiquetas y saneado), `decision.ts` (rango y flujo) y una fila en cada tabla de pruebas; nada más.
