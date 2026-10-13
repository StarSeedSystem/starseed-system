# ProtoGenesis · el proceso multiagéntico que da origen a cada molécula (2026-10-13)

> Petición de Alex (13-10): «la protomolécula debe usar el proceso de protogénesis multiagéntico
> relacionado a PoliGenesis y MetaGenesis». **Contrato escrito ANTES del código** (regla dorada).
> Se apoya en `architecture/protomolecula.md` (molécula, átomos, convergencia, cómputo, seguridad),
> `architecture/genesis-personas-poligenesis.md` (operaciones tipadas, propuesta y voto),
> `architecture/astraura-bots.md` §8 (tareas con director y verificador) y la orquestación de
> MetaGenesis (`memory/orquestacion-economica.md`). No duplica ninguno: los une.

## 0 · Qué es, en una frase

**ProtoGenesis es la génesis de una molécula**: una persona o un grupo dice qué quiere crear, un
**director** lo convierte en un **plan de pasos** sobre los átomos de la Protomolécula, **varios
agentes** trabajan a la vez los pasos independientes, sus resultados **convergen** en la molécula,
un **verificador** distinto comprueba cada criterio y **decide quien manda en ese ámbito**: la
persona (Genesis), el gobierno del grupo (PoliGenesis) o, si hace falta código nuevo del OS, los
desarrolladores (MetaGenesis). En el fundamento de StarSeed (`memory/principles.md` §0) es la
**alquimia** aplicada a la creación: el proceso que transforma la intención en obra.

## 1 · La familia Genesis, completa

| Nivel | Qué crea o cambia | Quién decide | Motor |
|---|---|---|---|
| **MetaGenesis** | el código del OS | desarrolladores (Alex); director + revisor + tres puertas | enjambre, colas, medios (Mac, A1, nube) |
| **PoliGenesis** | lo de una entidad (grupo, página) | su gobierno: jerárquico (rol de gestión) o democrático (propuesta y voto) | operaciones tipadas, `decidirAplicacion` |
| **Genesis** | lo de una persona | la persona | operaciones tipadas con vista previa y deshacer |
| **ProtoGenesis** | una **molécula** (creación audiovisual, 3D, sonido, código de la molécula…) | el de su ámbito: personal → Genesis; grupo → PoliGenesis; código del OS → MetaGenesis | director + agentes por átomo + verificador, sobre la Protomolécula |

ProtoGenesis no es un cuarto poder: **hereda las reglas del nivel donde vive la molécula**.

## 2 · El proceso, paso a paso

1. **Encargo** (`Encargo`): `{id, moleculaId, ambito, intencion, criterios[], autor, origen}`.
   Llega por texto, dictado, un agente (`[[ACCION: protomolecula {"accion":"encargar",…}]]`) o un
   miembro del grupo. **Sin criterios comprobables no hay encargo**: si faltan, el director los
   propone y quien encarga los confirma (misma regla que las tareas con director).
2. **Plan** (`Plan`): el director lo devuelve como **datos**, nunca como código: pasos
   `{id, atomo (herramientaId del catálogo), entradas (refs a capas o a salidas de otros pasos),
   salida {formato}, depende[], criterios[], computo?}`. Se valida: grafo sin ciclos, como mucho
   24 pasos, cada átomo existe en el catálogo y corre en algún medio (si es `solo-enlace`, el paso
   dice «próximamente: <motivo>»), y cada arista tiene conversión (`rutaDeConversion`); si no la
   hay, el paso se marca «falta conversor de X a Y» (y puede pedirse a MetaGenesis, §4).
3. **Reparto multiagéntico**: los pasos cuyas dependencias están hechas se reparten **a la vez**,
   tantos como agentes y cómputo haya (`repartirPasos`), cada uno con su agente (del taller o el
   bot del grupo), su modelo (`reparto-de-modelo.ts`: local primero, gratis después) y su destino
   de cómputo (§7 de la Protomolécula: privado solo en neuronas de la cuenta). Un agente nunca
   recibe dos pasos a la vez; un paso nunca va a dos agentes.
4. **Ejecución = propuesta**: cada agente solo produce **operaciones de la Protomolécula**
   (`mover`, `dictar`, `proponer-codigo`, exportar una salida como entidad de la Biblioteca) en la
   **rama del encargo**; la molécula original no se toca hasta la decisión.
5. **Convergencia**: las salidas se citan, no se copian (§3.3 de la Protomolécula); el director
   compone la capa «Resultado» en la rama.
6. **Verificación**: cada criterio tipado (`formato`, `duracion-max`, `tamano-max`,
   `sin-secretos`, `capas-presentes`, `persona`) lo comprueba **alguien distinto del autor del
   paso**: pruebas automáticas cuando el criterio es medible; si no, otro bot o la persona. Un
   paso no está hecho sin todos sus criterios verdes; un fallo vuelve al paso con el motivo
   (como mucho 2 intentos; luego queda «necesita una mano»).
7. **Decisión** (`decidirResultado`): ámbito personal → la persona **acepta** (dos toques) y la
   rama se fusiona en la molécula, con deshacer; entidad jerárquica → aplica quien tiene rol de
   gestión; entidad democrática → el resultado es una **propuesta que se vota** (PoliGenesis);
   cualquier cambio que no sea de la molécula (un átomo nuevo, un conversor, código del OS) →
   **propuesta de tarea a MetaGenesis** (§4), nunca se aplica desde aquí.
8. **Registro**: cada paso con agente, modelo, cómputo, duración, veredicto y su inverso; se ve en
   la molécula y en Genesis/PoliGenesis («ProtoGenesis de mis moléculas»).

## 3 · Relación con PoliGenesis

- Una molécula de grupo admite **encargos de varios miembros a la vez**, cada uno en su rama; al
  fusionar, `salas/sincronia-sala.ts#fusionarEstados` (determinista, con lápidas) y los conflictos
  por parámetro se enseñan, no se resuelven a escondidas.
- Los agentes de un grupo son los de la entidad, saneados (`agentes-grupo.ts#sanearParaGrupo`) y
  con memoria de grupo solamente (`alcance-memoria.ts`); nunca la memoria personal de quien encarga.
- Rol mínimo para encargar: colaboración (rango ≥ 2 de `rangoDeRol`); observadores solo comentan.

## 4 · Relación con MetaGenesis

- **Capacidad**: los pasos pesados (render, transcodificación, generación) usan los mismos medios
  que la colmena de MetaGenesis —neuronas que consintieron ser contenedor o procesador, el A1
  solo para lo ligero— con su propio cupo: **un encargo nunca quita sitio al enjambre de
  desarrollo** ni al revés (colas separadas; se cuentan juntos solo en los medidores).
- **Evolución**: lo que una molécula no sabe hacer se convierte en una **propuesta de tarea de
  desarrollo** (`propuestaMetaGenesis`: id, título, archivos ≤ 3, prompt con el contexto del
  encargo, sin datos privados) que llega al Diseñador de olas de MetaGenesis como borrador. La
  lanza una persona de MetaGenesis; nunca se lanza sola.
- **Visibilidad**: MetaGenesis ve la carga agregada de ProtoGenesis (encargos, pasos, agentes,
  medios), **nunca el contenido** de las moléculas.

## 5 · Seguridad (lo de la Protomolécula, sin excepciones)

Propone la IA, acepta una persona; el núcleo no ejecuta código ajeno; privado se queda en la
cuenta; datos de salud jamás a un agente; tope de 24 pasos y 8 agentes por encargo; cada coste se
dice (modelos gratis primero; de pago solo por encima de la reserva y con permiso).

## 6 · Código (`src/lib/protogenesis/`, núcleo puro) y cola

| Id | Qué | Archivos |
|---|---|---|
| PG1013A | Tipos y validación de encargo y plan (DAG, límites, criterios, átomos del catálogo) | `encargo.ts` + prueba |
| PG1013B | Pasos listos y reparto multiagéntico determinista | `reparto.ts` + prueba |
| PG1013C | Verificación por criterios (verificador distinto del autor) | `verificacion.ts` + prueba |
| PG1013D | Decisión por ámbito (Genesis / PoliGenesis / MetaGenesis) y propuesta a MetaGenesis | `decision.ts` + prueba |
| PG1013E | Rama del encargo: aplicar operaciones sobre una copia, fusionar y deshacer | `rama.ts` + prueba |
| PG1013F | Director: intención → plan validado (modelo inyectado, un reintento con los errores) | `director.ts` + prueba |
| PG1013G | Almacén de encargos por cuenta (localStorage con try/catch, sin datos de salud) | `almacen-encargos.ts` + prueba |
| PG1013H | Panel ProtoGenesis: encargo, árbol de pasos, agentes, verificación y decisión | `src/components/protogenesis/panel-protogenesis.tsx` + prueba |
| PG1013I | Sección «ProtoGenesis» en Mi Genesis y en PoliGenesis | `mi-genesis.tsx`, `poligenesis.tsx` + prueba |

La acción de agente `encargar` se añade a la herramienta `protomolecula` de `actions.ts` cuando esa
herramienta exista (cola de la Protomolécula, §5.1): hasta entonces un agente encarga desde el panel.

Cola: `starseed_memory_root/olas/cola-protogenesis-1013.json`.
