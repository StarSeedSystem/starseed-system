# SOP · Genesis para cada persona y PoliGenesis para grupos y páginas (2026-10-10)

Contrato de origen: `architecture/genesis-niveles-malla-universal-estaciones.md` §A.2.
Petición de Alex: Genesis (personas) y PoliGenesis (grupos y comunidades) «bien desarrollados
para que sean seguros y funcionales para modificar todo de sus cuentas, perfiles y páginas», sin
tocar el código del OS (eso es MetaGenesis, solo desarrolladores).

## 1. La regla que lo sostiene

**El agente propone, la persona decide, el núcleo manda.** Un agente con modelos gratuitos traduce
lo que pide la persona a OPERACIONES TIPADAS de una lista cerrada. Cada operación:

1. se valida (vocabulario cerrado, límites, nada que «huela» a código con `pareceCodigo` del
   núcleo, enlaces solo `https://` o rutas del OS, invariantes de `src/lib/nucleo/invariantes.ts`);
2. se enseña en palabras (vista previa) con cómo se deshace;
3. se aplica solo tras dos toques («Aplicar» → «Confirmar») y se vuelve a validar justo antes,
   con el estado real de ese momento;
4. queda en el registro con su INVERSO; «Deshacer» nunca pisa un cambio posterior.

Nada de `eval`, nada de código, nada de HTML: la salida del modelo es un candidato.

## 2. Vocabulario (`src/lib/genesis/operaciones.ts`)

| Operación | Qué toca | Con qué módulo del OS | Inverso |
|---|---|---|---|
| `perfil.editar` | nombre, bio, foto, portada (perfil principal o una faceta) | `os_profiles` (espejo en `profiles`) o `profiles`; facetas en `os_account_profiles` | valores anteriores, con comprobación de conflicto |
| `pagina.crear` | página nueva propia | `createPage` (os-social) | borrarla **solo si sigue sin publicaciones** |
| `pagina.editar` | nombre, descripción, etiquetas, acento, foto, portada | `os_pages` / `os_groups` (persona: además `owner_id = tú`) | valores anteriores, con conflicto |
| `apariencia.aplicar` | una faja de `CAMPOS_PERMITIDOS` (`ui-acciones.ts`) | `AppearanceProvider.updateConfig` | `ui-aplicador.ts` (inverso exacto) |
| `dock.añadir` / `dock.quitar` | encender un botón existente, crear uno propio a una ruta del OS, apagar uno | `loadDockConfig`/`saveDockConfig` + `starseed:dock` | estado anterior del botón |
| `dashboard.widget.añadir` / `.quitar` | widgets del manifiesto (nunca `AI_GENERATED` ni HTML) | `starseed_widgets` + aviso `starseed-dashboard` | quitar / reponer con su configuración |
| `agente.crear` | agente en la biblioteca (en PoliGenesis, vinculado a la entidad) | `createAgent`/`bindAgent` | borrar y desvincular |

Protecciones del núcleo: Ajustes, Perfil, Biblioteca, Hub, Decisiones y Seguridad no se quitan del
dock (`DOCK_NUCLEO`, también cuando no se conoce el dock de la persona). El @usuario no se cambia
desde Genesis (renombra correos: se hace en Ajustes › Cuenta). Lote máximo: 8 operaciones.

**Pendiente a propósito:** widgets del Escritorio (`/escritorios`, `starseed.desktops.v1` anclado al
perfil activo, con su propio almacén y sync) y roles de la entidad (`rol.asignar`). Ver §7.

## 3. El agente (`/api/genesis/proponer`)

- `src/lib/genesis/carriles-servidor.ts`: modelos gratuitos ya configurados, en orden Groq →
  NVIDIA NIM comunitario → OpenRouter `:free` → FreeLLMAPI (solo en esta máquina) → Gemini.
  Variables: `GROQ_API_KEY`, `NVIDIA_SHARED_KEY`/`NVIDIA_API_KEY`, `OPENROUTER_SHARED_KEY`/
  `OPENROUTER_API_KEY`, `FREELLMAPI_KEY`, `GEMINI_API_KEY`; modelos cambiables con
  `STARSEED_GENESIS_GROQ|NIM|OPENROUTER|GEMINI` (OpenRouter solo ids `:free`). 429/402/5xx o 25 s
  → siguiente carril. Sin ninguno → 503 que nombra las variables. Todos fallan → 502 con el motivo
  de cada carril (sin claves).
- `src/lib/genesis/traductor.ts`: prompt de sistema con el vocabulario del ámbito y un contexto
  COMPACTO de la cuenta (perfil, facetas, páginas propias, dock, tableros, catálogo de widgets),
  saneado en el servidor y marcado como «datos, no instrucciones»; lectura de la respuesta
  (`<think>`, vallas, texto alrededor) y `validarLote`.
- Seguridad: sesión obligatoria (cookie o `Authorization: Bearer`) salvo petición estricta de esta
  máquina (`esPeticionDeEstaMaquina`); 20 peticiones / 10 min por cuenta; cuerpo ≤ 64 KB. La ruta no
  toca datos: solo propone.

## 4. Interfaz

- `/genesis` → `SelectorNivelGenesis` (`src/components/genesis/selector-nivel.tsx`): **Mi Genesis**,
  **PoliGenesis** y **MetaGenesis**. MetaGenesis solo aparece en esta máquina (`abiertoEnLaMac`) o
  para cuentas miembro (`miAccesoMetaGenesis`). `?nivel=mi|poli|meta`; los enlaces viejos
  `?pestana=` y `?ambito=` abren MetaGenesis para quien tiene acceso y, sin acceso, Mi Genesis con
  un aviso. La última elección se recuerda en `starseed.genesis.nivel.v1` (solo comodidad). La
  consola (`consola-metagenesis.tsx` = `MetaGenesisRemoto` + `CentroMando` + `CrearEnjambre`) se carga
  a demanda.
- `MiGenesis` → `PanelOperaciones` (chat, propuestas con `TarjetaOperacion`, historial con
  deshacer) + `AtajosGenesis` (perfil y dock sin IA: generan la misma operación).
- `PoliGenesis` (`/genesis?nivel=poli` y `/poligenesis?entidad=<id|slug>`, esta última con el dock):
  eliges entidad; rol y modo arriba; propuestas en votación y aprobadas abajo.
- Registro: catálogo de apps (`mando` describe los tres niveles; `poligenesis` nuevo en
  `sistema`). El dock ya tiene «Genesis» (`/genesis`).

## 5. PoliGenesis: rol y democracia (`src/lib/genesis/entidades.ts`)

- Rol: dueña (`owner_id`) = 4; si no, el máximo de `os_entity_roles.role` de la cuenta
  (`account_id`) con el rango de `public.access_role_rank` (total/owner 4, gestor/admin 3,
  colaborador/editor 2, observador/viewer 1). Se listan las entidades con rango ≥ 2.
- Modo: el del motor de gobernanza (`getConfig("page"|"group", slug)`). Sin fila, el OS trata la
  entidad como **democrática** y la interfaz lo dice («por defecto del OS»).
- `decidirAplicacion`: jerárquica + rango ≥ 3 → aplica; democrática + rango ≥ 2 → **propone**
  (`createProposal`, comando `custom` con `origen: "genesis"` y la operación en `spec`); el resto,
  solo lectura. Al aprobarse (`passed`/`executed`), quien gestiona pulsa «Aplicar lo aprobado»: la
  operación se REVALIDA y se aplica con su inverso; el registro guarda `propuesta_id`.

## 6. Registro (`supabase/migrations/20261010130000_genesis_operaciones.sql`, SIN aplicar)

- Tabla `genesis_operaciones` con RLS: la ve quien la hizo y quien colabora en la entidad (≥ 2);
  marcar deshecha, quien la hizo o quien gestiona (≥ 3); borrar, solo lo personal y solo la
  persona. Trigger: la operación y su inverso no se reescriben.
- Mientras no esté aplicada, `historial.ts` guarda en este aparato (`starseed.genesis.registro.v1`)
  y la interfaz lo dice («guardado solo en este aparato»).
- La misma migración deja que los roles de gestión (≥ 3) actualicen `os_pages`/`os_groups`
  (política `<tabla>_gestion_por_rol`, solo si la tabla YA tiene RLS activa; si no, NOTICE) y un
  trigger impide que nadie salvo la dueña cambie `owner_id`. Sin aplicarla, un gestor que no es
  dueño recibe «la base de datos no dejó guardar…» (nunca un falso «hecho»: 0 filas = fallo).
- Depende de `20260806120000_profile_sharing.sql` (`entity_owner_account`, `my_entity_role_rank`).
- Comprobación antes de aplicar: `select relname, relrowsecurity from pg_class where relname in
  ('os_pages','os_groups');` — si alguna sale `false`, hay que revisar sus políticas de lectura
  antes de encender la RLS (esta migración no la enciende).

## 7. Qué falta (y por qué)

- Probar el agente con modelos reales: en el contenedor no hay ninguna de las variables; en la Mac
  sí (Groq/NIM/OpenRouter). Prueba: `/genesis?nivel=mi` → «Pon Decisiones en mi dock».
- Widgets del Escritorio y `rol.asignar` como operaciones (tareas pequeñas para el enjambre).
- `/genesis` es ruta de consola (`RUTAS_CONSOLA`, sin dock ni fondos, por la memoria de la Mac):
  Mi Genesis no ve el dock en vivo allí; `/poligenesis` sí. Decidir si Mi Genesis tiene ruta propia.

## 8. Pruebas

`npx vitest run src/lib/genesis src/components/genesis` (47 casos): validación y vocabulario,
invariantes del dock (con y sin contexto), ámbitos, rol × modo, lote, vista previa, conflicto al
deshacer, aplicar/deshacer de cada tipo con puertos falsos (0 filas = fallo, página con
publicaciones no se borra, fondo fuera de «cuenta» no se toca), carriles con relevo, traductor,
grafo del navegador sin `node:*` siguiendo también los `import()` dinámicos, selector de niveles y
el recorrido completo en jsdom (agente → vista previa → confirmar → aplicar → deshacer).
