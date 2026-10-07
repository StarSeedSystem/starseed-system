# Puente de Mando para todos: enjambres propios para cada persona, grupo y página (Olas 1007P → 1009P)

> Petición de Alex (2026-10-06): «Todo el puente de mando debe estar diseñado para funcionar de
> forma autónoma 24/7 y ser un sistema vivo y activo para los usuarios de Starseed OS, adaptado a
> cada contexto, pero con las mismas características, formatos, estructuras y funciones que ya
> hemos desarrollado. Así, cualquier usuario podrá crear sus enjambres de agentes vinculados a
> Starseed OS, con control total de sus perfiles y cuenta dentro de Starseed OS, de manera segura,
> funcional y con todas las características del puente de mando que hemos desarrollado. Y también
> diseñados para grupos y páginas públicas y privadas de todo tipo de todo Starseed OS para
> cualquier comunidad, grupo o individuo utilizando las páginas y características de todo
> Starseed OS.»

Este documento es el CONTRATO. Lo que no esté aquí no se inventa; si choca con el código real,
gana el código y se anota la diferencia. Complementa (no sustituye) a CLAUDE.md §«El OS
universal, libre y seguro», `architecture/protocolo-comun-agentes.md`,
`architecture/puente-economico-verificable.md`, `architecture/servidor-propio-protocolo.md`,
`architecture/vinculos-entre-cuentas.md` y `architecture/medidores-credito.md`.

## 0. De dónde partimos (mapa del 2026-10-06)

- El Mando de hoy es la consola de UNA máquina: ~50 rutas `src/app/api/mando/*` y ~75
  componentes `src/components/mando/*` leen el disco de la Mac (`starseed_memory_root/olas/*`,
  `~/.starseed/*`, git, launchd). `guardianMando` deja pasar sin sesión en local y, en producción
  no local, a cualquiera con sesión: no mira de quién es el Mando.
- Ya existen las piezas de un OS con muchos dueños, pero el Mando no las usa: 9 tipos de entidad
  (`src/lib/entity-kinds.ts`: personal, comunidad, ef, partido, asamblea, grupo, evento, pagina,
  proyecto) con sus kits; roles y gobierno democrático/jerárquico
  (`governance/membership.ts`, `governance/permissions.ts`, `os_memberships`, `os_entity_roles`);
  salas (`salas/sala.ts`); agentes de grupo con límites que nacen cerrados
  (`agents/agentes-grupo.ts`); alcance de la memoria (`nucleo/alcance-memoria.ts`); núcleo
  intocable e «interfaz como dato» (`nucleo/invariantes.ts`, `nucleo/ui-spec.ts`,
  `paquete-sistema.ts`); roles del Mando (`mando/permisos.ts`).
- Huecos de seguridad que este diseño cierra ANTES de abrir nada a nadie (§6.4):
  `os_is_group_member()` cuenta como miembro a quien está `pending`; `relevo_eventos` deja leer y
  escribir a `anon`; `guardianMando` no comprueba el dueño en producción; los límites de los
  agentes de grupo solo existen como contrato probado, nadie los aplica.

## 1. Reglas que no se negocian

1. **Tu enjambre, tus claves, tu máquina.** Las claves de proveedores de IA de un usuario NUNCA
   salen de su motor (su ordenador o su servidor) ni de su navegador (`ai/client/keyStorage.ts`).
   El servidor de StarSeed no las guarda, no las ve y no las pide. El Mando enseña nombres,
   huellas y medidores; nunca valores.
2. **Un solo Mando.** Mismas tarjetas, mismos medidores, mismo Chat Director, mismas olas,
   mismos formatos de tarea (`{id, ola, depende, titulo, archivos, prompt}`), mismos directores.
   Lo que cambia es DE QUIÉN es (el ámbito) y DÓNDE corre (el motor). El Mando de Alex en su Mac
   sigue funcionando exactamente igual: es el ámbito «local» con motor local sin token.
3. **Ámbitos aislados.** Todo dato del Mando lleva `ambito_id`. Las políticas RLS impiden leer o
   escribir fuera del propio ámbito; la vista pública es una lista blanca (§5).
4. **Núcleo intocable.** Un enjambre de usuario trabaja en los destinos de SU ámbito (sus
   repositorios, sus espacios, su página) y nunca en el código ni en la producción de StarSeed
   OS. Contribuir al OS es una propuesta (rama + revisión de los directores + palabra de Alex),
   nunca una escritura directa.
5. **Editable sí, ejecutable no.** Lo que se comparte entre ámbitos (plantillas de ola,
   configuraciones de directores, paquetes de Mando) es DATO revisado por `paquete-sistema.ts`
   (invariantes + rastreo de claves). Ningún motor ejecuta código que su dueño no aceptó.
6. **Pendiente no es miembro; el silencio no es aprobación; Jev frena, nunca empuja.**
7. **Salida siempre.** Quien administra un ámbito puede frenarlo en cualquier momento (freno por
   ámbito, además del freno global `os_freno`); el dueño de un motor puede revocarlo siempre.
8. **Datos honestos.** Cada cifra dice su fuente y su edad; desconocido no es ilimitado.
9. **Presupuesto común.** El plan gratuito de Supabase (≈25 000 peticiones y 150 MB al día,
   `memory/orquestacion-economica.md` §15) es de todos: ningún ámbito puede agotarlo (§6.3).
10. **Todo detrás de una bandera.** `STARSEED_MANDO_TODOS=1` (servidor) enciende el Mando
    multiusuario; sin ella, el comportamiento es el de hoy. Encenderla en producción es de Alex.

## 2. Conceptos

- **Ámbito** (`AmbitoMando`): el dueño de un Mando. `{id, tipo: "persona" | "entidad",
  entidad_tipo?: EntityKind, entidad_ref?: slug o uuid, perfil_id?: uuid, visibilidad: "privado" |
  "miembros" | "publico", modo_gobierno: "jerarquico" | "democratico", creado_por}`. Un perfil de
  persona tiene su ámbito; cada entidad (comunidad, grupo, partido, asamblea, evento, página,
  proyecto, entidad federativa) puede tener el suyo. El ámbito `local` es el de la máquina donde
  corre el Mando sin bandera (el de Alex).
- **Motor**: dónde corre un enjambre. `local` (la app de StarSeed o `starseed-nodo` en el
  ordenador del usuario), `nube-propia` (las Actions de un repositorio DEL USUARIO, como
  `nube-gh` hoy) o `servidor-propio` (`servidor-propio-protocolo.md`). Cada motor pertenece a un
  ámbito y a la cuenta que lo registró, se identifica con un **token de motor** (se enseña una
  vez, se guarda solo su hash) y tiene un subconjunto de capacidades.
- **Enjambre**: configuración con nombre dentro de un ámbito: motor, proveedores preferidos
  (solo nombres; el motor sabe cuáles tiene), directores activos (chat, optimizador, diseño,
  producción, nube, medidores), presupuesto (tokens/día, ¿pago permitido?), horario (24/7 o
  ventana), alcance de memoria (`perfil` | `grupo` | `publica`) y destinos de trabajo.
- **Ola y tarea**: el mismo formato de hoy más `ambito_id`. **Eventos, latidos, progreso, chat y
  medidores**: los mismos documentos que ya escribe el orquestador, con `ambito_id` y `motor_id`.

## 3. Roles → capacidades por ámbito

Capacidades del Mando por ámbito: `ver-resumen`, `ver-detalle`, `chatear`, `encolar`,
`aprobar`, `lanzar-olas`, `usar-apis`, `publicar`, `gestionar-motores`, `gestionar-accesos`,
`frenar`, `administrar`.

| Quién | Capacidades |
|---|---|
| Persona: dueño del perfil | todas |
| Persona: delegado (vínculo con consentimiento de ambos, `vinculos-entre-cuentas.md`) | las concedidas; nunca `gestionar-accesos` ni `administrar` |
| Entidad: owner | todas |
| Entidad: admin | todas menos `administrar` (borrar el ámbito) |
| Entidad: moderator / editor | `ver-resumen`, `ver-detalle`, `chatear`, `encolar`, `aprobar`, `frenar` |
| Entidad: member / viewer | `ver-resumen`, `ver-detalle`, `chatear`; `encolar` si el ámbito lo permite |
| Entidad: pending | ninguna |
| Visitante sin rol | `ver-resumen` solo si `visibilidad = "publico"` |

- En modo **democrático**, `lanzar-olas`, `publicar`, `gestionar-motores` y `usar-apis`
  requieren una propuesta aprobada (`governance/permissions.ts::proposalForChange`); `frenar`
  nunca requiere votación.
- `usar-apis` en una entidad significa usar el MOTOR que alguien registró para ella, con SUS
  claves. Ese miembro puede revocarlo siempre; el grupo nunca recibe las claves.
- Los roles salen de `os_memberships` (excluyendo `pending`) y de `os_entity_roles`; el rol más
  alto gana. El servidor decide; el navegador solo pinta lo que el servidor permite.

## 4. Motor 24/7

- **Mismo orquestador, mismos directores.** El motor es el código de hoy
  (`scripts/enjambre/starseed-enjambre.py`, vigilante, directores) con un conector de ámbito
  (`scripts/enjambre/motor_ambito.py`). Sin `STARSEED_MOTOR_TOKEN` en su entorno, el conector no
  hace nada: así sigue la Mac de Alex.
- **Conector**: reúne eventos, latidos, progreso y medidores y los sube en LOTES por RPC
  (`mando_motor_reportar`), y recoge órdenes y tareas nuevas (`mando_motor_pendiente`). Cadencia
  adaptable: cada 60 s con trabajo en marcha, cada 10 min en reposo, y lo que diga el servidor
  si el presupuesto aprieta (§6.3). Sin red, encola en `~/.starseed/motor/pendiente.jsonl`
  (≤ 5 MB, lo más viejo cae primero) y reintenta con espera creciente. Obedece el freno.
- **Supervisor por sistema**: launchd (macOS, ya existe), unidad de usuario de systemd (Linux),
  Programador de tareas (Windows); la app de escritorio podrá llevarlo como proceso propio.
- **Se pausa y se reanuda solo**: con la sonda de escritores y los medidores de crédito
  (`medidores-credito.md`) sabe cuándo no queda cupo y cuándo vuelve; nunca quema un proveedor.
- **Seguridad del motor**: árboles de trabajo aislados, escritura solo en los destinos del
  ámbito, rastreo de secretos antes de cualquier subida, nunca empuja al repositorio de StarSeed.

## 5. Visibilidad y vista pública

- `privado`: solo dueño (persona) u owner/admins (entidad). `miembros`: miembros activos.
  `publico`: además, cualquiera ve la **vista pública**.
- Vista pública = función pura de lista blanca `vistaPublica(estado)`: nombre del ámbito, olas
  (título y avance), tareas integradas (título y fecha), medidores AGREGADOS (porcentajes de
  avance y salud del motor; nunca proveedores concretos, saldos ni créditos) y el canal público
  del Chat Director. Nunca prompts, registros, rutas, nombres de archivos privados, chat interno
  ni nada que no esté escrito en la lista.

## 6. Datos, transporte y presupuesto

### 6.1 Tablas (una migración ADITIVA; nada se borra ni se renombra)

`mando_ambitos`, `mando_motores` (`token_hash`, `capacidades`, `ultimo_reporte`, `estado`,
`creado_por`), `mando_enjambres`, `mando_tareas` (cola + estado compacto), `mando_eventos`
(solo añadir; como mucho 2 000 filas por ámbito: un disparador borra las más viejas),
`mando_chat` (`canal`, `autor`, `rol`, `texto` ≤ 4 000, saneado), `mando_medidores` (documento
de `medidores-credito.md` §3, ≤ 32 KB, sin claves), `mando_presupuesto` (peticiones por día y
ámbito).

### 6.2 Acceso

- RLS con una función `mando_capacidad(ambito uuid, capacidad text) returns boolean` (SECURITY
  DEFINER, `search_path` fijo) que aplica §3 y §5. Lectura: `ver-*`; escritura desde el navegador
  solo de `mando_chat` (`chatear`) y de órdenes (`encolar`, `aprobar`, `frenar`).
- Los motores NO usan la clave de servicio: llaman a RPC SECURITY DEFINER con su token
  (`mando_motor_reportar(p_token, p_lote)`, `mando_motor_pendiente(p_token)`), que comprueban el
  hash, que el motor esté activo, sus capacidades, el tamaño del lote (≤ 64 KB) y la cadencia
  mínima (30 s).

### 6.3 Presupuesto común

`mando_presupuesto` cuenta las RPC del día. Al 70 % del tope diario global las RPC devuelven
`cadencia_min: 600` (los motores pasan a cada 10 min); al 90 %, solo latidos cada 30 min; el tope
por ámbito es una fracción proporcional. Una comunidad grande puede llevar su Mando a su propio
servidor con el mismo protocolo (`servidor-propio-protocolo.md`).

### 6.4 Arreglos de seguridad previos (van ANTES de abrir nada)

1. `os_is_group_member()` excluye `role = 'pending'` (como ya hace `membership.ts`).
2. `guardianMando(req, {ambito, capacidad})`: con la bandera encendida, en producción no local
   exige la capacidad en ese ámbito; sin ámbito, el de la persona que llama. Local: igual que hoy.
3. Los límites de `agentes-grupo.ts` se aplican en el servidor (invocaciones por hora en base de
   datos, no en memoria de una instancia).
4. `relevo_eventos`: antes de cerrarle `anon`, inventario de quién escribe y lee (la Mac lo usa
   como bus); se cierra sin romper ese uso.

## 7. Interfaz (mismas tarjetas, otro dueño)

- Los componentes del Mando leen a través de `AlmacenMando` (`src/lib/mando/almacen.ts`) con dos
  implementaciones: `local` (lo de hoy, archivos de la máquina) y `supabase` (por ámbito). Ninguna
  tarjeta sabe cuál tiene debajo.
- `/mando?ambito=<id>`: selector «Mi Mando · Mis grupos · Mis páginas» con los ámbitos donde
  quien mira tiene al menos `ver-resumen`.
- Asistente «Crear enjambre»: ámbito → motor (este equipo / mi GitHub / mi servidor) →
  proveedores que el motor detecta (gratis primero; medidores de crédito) → directores y
  plantilla de ola → límites (presupuesto, horario, visibilidad, alcance de memoria) → token del
  motor (una vez) y la orden para instalarlo.
- En cada kit de entidad (`components/social/toolkits/index.tsx`) aparece la herramienta
  «Puente de Mando» con su insignia de visibilidad; en una página pública, la vista pública.

## 8. Fases y olas

| Fase | Ola | Qué | Estado |
|---|---|---|---|
| F0 | 1007M | Medidores de crédito por terminal (`medidores-credito.md`) | encolada |
| F1 | 1007P | Cimientos puros: ámbito y capacidades, protocolo y saneadores, vista pública, token de motor, interfaz `AlmacenMando` + adaptador local | encolada |
| F2 | 1008P | Datos y seguridad: migración aditiva + RLS + RPC, arreglos §6.4, conector del motor, almacén Supabase, presupuesto común | encolada (depende de F1) |
| F3 | 1009P | Interfaz: selector de ámbito, asistente, herramienta en los kits, vista pública, aprobación democrática | encolada (depende de F2) |
| F4 | — | Motor multiplataforma (systemd, Windows, app), plantillas compartibles, manuales | se diseña al cerrar F3 |

## 9. Lo que sigue siendo de Alex

Aplicar la migración en el Supabase de producción, encender `STARSEED_MANDO_TODOS` en
producción, publicar, y cualquier decisión sobre precios o cuotas de pago. La dirección (Claude)
revisa cada migración antes de aplicarla en el proyecto de pruebas.
