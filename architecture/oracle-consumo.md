# Medidor de Oracle Cloud en «Consumo y créditos» (OC1010 · 2026-10-10)

> Alex (2026-10-10): «en MetaGenesis, en Consumo y créditos, añade un medidor del consumo y
> créditos del servicio de Oracle Cloud que estamos usando, completamente sincronizado, con todo
> integrado y vinculado y aprovechado lo mejor posible por todos los directores y agentes para lo
> que corresponda, incluyendo la administración de sus servicios y sus usos en todo StarSeed OS».

Contrato de la cuenta: `architecture/oracle-nube.md` (límites §1, reparto §3, estado real §11).
Este documento cubre SOLO cómo se mide, dónde se ve y quién lo usa. Si el código choca con él,
gana el código y se anota aquí.

## 1. Qué se mide y de dónde sale (todo SOLO LECTURA, con la CLI `oci`)

Comprobado en la Mac el 2026-10-10 con `oci` 3.94.1, perfil `DEFAULT` (el de
`~/.starseed/oracle.json`), región `mx-queretaro-1`. Una pasada completa son unas 13 órdenes y
**tarda ~11 s** en la Mac.

| Medida | Orden | Límite gratis | Lectura real del 2026-10-10 |
|---|---|---|---|
| Gasto del mes y previsto | `oci budgets budget budget list --compartment-id <cuenta> --all` (`actual-spend`, `forecasted-spend`, `amount`) | presupuesto `starseed-alerta-1usd` | 0,00 de 1,00 · previsto 0,00 |
| Gasto por día y por SKU, horas del A1, salida de datos | `oci usage-api usage-summary request-summarized-usages --granularity DAILY --query-type COST --group-by '["service","skuName","unit"]'` | A1 1.500 OCPU·h y 9.000 GB·h al mes · salida 10 TB | 96,6 OCPU·h · 579,8 GB·h · salida 0,005 |
| Crédito de la prueba | `oci organizations subscription list` + `… get --subscription-id` (`promotion[]`) | 30 días | 6.150 MXN, ACTIVE, vence 2026-11-05 |
| Instancias y forma | `oci compute instance list` | A1 2 OCPU / 12 GB · 2 micro | `starseed-a1` 2/12 RUNNING · 0 micro |
| Disco | `oci bv boot-volume list` + `oci bv volume list` | 200 GB | 100 GB (arranque) |
| Object Storage | `oci os bucket list` + `oci os bucket get --fields approximateSize` | 20 GB | 0 cubos |
| CPU, memoria y red de 7 días | `oci monitoring metric-data summarize-metrics-data --namespace oci_computeagent` con `CpuUtilization[1h].mean()`, `MemoryUtilization[1h].mean()`, `NetworksBytesIn/Out[1h].rate()` | umbral de reclamación 20 % | CPU p95 0,52 % · memoria p95 5,26 % · red 0,0015 % |

Lo que la CLI dice de verdad y conviene saber:

- **La moneda de la cuenta es MXN**, no USD. El presupuesto «de 1 USD» que se creó el 2026-10-07
  tiene `amount: 1.0` en la moneda de la cuenta: es **1 MXN** (≈ 0,05 USD), más estricto todavía.
  El medidor enseña siempre la moneda que da Oracle.
- `budgets` está bajo `oci budgets budget budget …` (no `oci budgets budget list`: esa orden no
  existe en la 3.94.1).
- El crédito de la prueba NO trae saldo: Oracle da el importe (`promotion.amount`) y las fechas.
  **Restante = crédito − gasto medido desde el inicio de la prueba** (suma de `computed-amount`
  de la API de uso); se rotula así, nunca como saldo oficial.
- La API de uso etiqueta la salida de datos («Outbound Data Transfer Zone 1») con la unidad
  `GB Months`; el valor es la cantidad de GB del SKU y se compara con 10 TB (10.240 GB).
- La suscripción se relee como mucho una vez al día (cambia poco); el resto, en cada pasada.
- Una cuenta sin cubos ni volúmenes de bloques devuelve salida VACÍA (no `{"data": []}`): se lee
  como «cero, medido».

## 2. Reclamación por inactividad (riesgo sí/no)

Regla de Oracle (§1 de oracle-nube.md): una máquina Always Free se puede reclamar si en 7 días
CPU p95 < 20 %, red < 20 % y, solo en A1, memoria < 20 %. El medidor calcula con puntos de 1 h:

- `cpu_p95`, `mem_p95` (A1) y `red_p95_pct` = máx(p95 entrada, p95 salida) × 8 / ancho de banda
  de la forma (A1: 1 Gbps por OCPU; micro: 480 Mbps);
- `riesgo` = todo por debajo del 20 %; `nivel` = `aviso` si hay menos de 7 días de datos, `alto`
  con 7 días; `reclamable_desde` = primer punto + 7 días.

**Hallazgo del 2026-10-10:** el A1 está OCIOSO (CPU p95 0,5 %, memoria 5,3 %): los servicios de
`compose-a1.yml` todavía no corren allí. Si sigue así, **Oracle puede reclamarlo desde el
2026-10-14 23:00 UTC**. Darle trabajo (desplegar los servicios o un agente del enjambre) lo evita.

## 3. Archivo y cadencia

- `scripts/puente/medidor_oracle.py` escribe `~/.starseed/oracle-consumo.json` (0600, escritura
  atómica, cerrojo `~/.starseed/cerrojos/oracle-consumo.lock`). Sin ids: lista blanca de campos y
  una pasada final que borra todo lo que empiece por `ocid1.` y las claves `id`, `tenancy`, `user`,
  `fingerprint`, `compartment-id`, `tenant-id`.
- Cada parte se mide aislada; un fallo se dice en `errores[]` con texto legible
  (`detalle_error`) y la parte conserva la última lectura buena con `obsoleto: true` (lista en
  `obsoletas`). Nunca un cero inventado: lo no medido no aparece.
- **Cadencia: cada 30 min** (nunca menos de 15) a través del recolector de medidores de crédito
  (`medidores_credito.py`, servicio `com.starseed.medidores`, cada 10 min): adaptador nuevo
  `oracle_cli`, que se añade solo si existe la CLI y el perfil tiene cuenta (`medidor_oracle.disponible()`),
  con tope de 200 s. Se apaga con `{"id": "oracle", "activo": false}` en `~/.starseed/medidores.json`.
- **«Actualizar ahora»**: `POST /api/mando/oracle/consumo` → `medidor_oracle.py medir --forzar`
  (una a la vez y como mucho una por minuto).
- A mano: `python3 scripts/puente/medidor_oracle.py medir [--forzar] [--json] [--salida RUTA]` y
  `… ver`. Con `--salida` no se toca `~/.starseed` ni se avisa a nadie (para probar).
- **Avisos al Chat Director** (`avisos_de_cambio`, de `director-nube`, tarea `OC1010`): UNO por
  cambio, no en cada pasada — se enciende o se levanta el freno (gasto > 0), o el riesgo de
  reclamación pasa a `aviso`/`alto` o vuelve a `no`. Solo desde el archivo de verdad.

## 4. Dónde se ve

- **Genesis › MetaGenesis › «Consumo y créditos»** (`src/components/mando/medidor-consumo.tsx`,
  `FilaOracle`): tarjeta «Oracle Cloud · Always Free» con una barra por medida frente a su límite
  gratis (gasto y previsión frente al presupuesto, crédito de la prueba, A1, horas A1, disco,
  Object Storage, salida), el riesgo de reclamación con su fecha, qué hacen directores y agentes,
  los errores legibles, «Actualizar ahora» y el enlace a la consola
  (<https://cloud.oracle.com/?region=mx-queretaro-1>). Lee `GET /api/mando/oracle/consumo` cada
  2 min con la pestaña visible. Ruta solo con `guardianMando`.
- **Pastillas de créditos de Genesis** (las de Claude y Codex): el adaptador `oracle_cli` añade el
  medidor `oracle` a `~/.starseed/medidores-credito.json` con ventanas `gasto`, `salida` y
  `objetos`, saldo = crédito restante de la prueba y extras `freno`, `riesgo_reclamacion`,
  `reclamable_desde`, `a1_estado`, `margen_apto` (`textoExtras` los dice en palabras).
- Tipos y vista PUROS: `src/lib/mando/oracle-consumo-tipos.ts` (`leerConsumoOracle`,
  `esConsumoOracle`, `vistaOracle`).

## 5. Quién lo usa y para qué (directores y agentes)

- **Medios** (`medios_disponibles.clasificar_oracle(…, consumo)`): con gasto > 0 Oracle pasa a
  `requiere_alex` con «freno: …» y el enlace a la consola → `contenedores_nube` le da 0 agentes
  libres y «Buscar más capacidad» no le manda trabajo. Sin freno, la capacidad lleva «libre ahora:
  X % CPU · Y GB» y el detalle el riesgo de reclamación. Así el reparto del enjambre y los
  directores que leen los medios enrutan al A1 cuando hay margen gratis.
- **Contexto común de los agentes** (`contexto_agente.py`, sección `nube`, roles supervisor y
  subagente): 2-4 líneas con el A1, su margen, el gasto frente al presupuesto, la prueba, la regla
  (con margen, lo pesado y lo 24/7 va al A1; con gasto > 0, FRENO) y el riesgo de reclamación. Y la
  regla permanente `oracle-gratis` de este §.
- **Regla**: Oracle es SOLO Always Free. Con margen medido (A1 RUNNING, CPU p95 < 70 % y ≥ 2,5 GB
  libres) lo pesado y lo 24/7 va al A1: es gratis y además lo libra de la reclamación. Si el gasto
  del mes o el previsto pasan de 0: freno — no se manda trabajo ni se crea nada, y se avisa en el
  canal para que Alex lo revise. Nunca se crea, cambia ni borra un recurso desde el medidor.

## 6. Pruebas

- `scripts/puente/test_medidor_oracle.py` (20, unittest; datos con la forma real y sin ids).
- `scripts/puente/test_medios_disponibles.py` (+2), `test_contexto_agente.py` (+3).
- `src/lib/mando/__tests__/oracle-consumo-tipos.test.ts` (9) y
  `src/components/mando/__tests__/medidor-oracle.test.tsx` (3).
- Verificación real en la Mac (2026-10-10): `medir --forzar --salida .transfer/oracle-1010/…`
  → `ok: true`, sin errores, 10,8 s, sin ningún `ocid` en el JSON.
