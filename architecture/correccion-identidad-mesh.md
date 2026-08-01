# SOP — Adenda 123: corrección crítica de la capa de identidad del mesh

> **Regla dorada:** este SOP es la fuente de verdad. Si la lógica cambia, actualiza
> primero este documento y luego el código.

Detectado por el análisis multi-agente (2026-08-01). Corrige un bug de producción que
dejaba INERTE toda la capa de identidad firmada, más una vía de suplantación de cuenta.

## 1. [CRÍTICO] El CHECK de `kind` rechazaba la identidad firmada

La migración `20260728090000_mesh_relay_synaptic.sql` definía
`kind ... check (kind in ('data','beacon'))`. El cliente (`server-relay.ts`) publica
además `kind` = **`identity`** (registro fp→cuenta), **`revocation`** (acta) y
**`revocation-cert`** (cert pre-generado). La BD RECHAZABA esos inserts y el cliente hace
`if (error) return` (degradación silenciosa) → `refreshIdentities` leía 0 filas →
`boundAccountFor()` devolvía siempre `null` y la revocación no se publicaba. Todas las
Adendas 106-122 de identidad/revocación quedaban efectivamente sin efecto en producción.

**Fix:** migración correctiva `20260801120000_mesh_relay_identity_kinds.sql` que amplía el
CHECK a `('data','beacon','identity','revocation','revocation-cert')` + índice parcial.
**Aditiva e idempotente.** ⚠️ **Debe APLICARse** en el proyecto Supabase del OS
(`nxstilnyidvkqeosofuh`) — no se pudo aplicar desde aquí (el MCP de Supabase no tiene
permiso sobre ese proyecto). Hasta aplicarla, la identidad sigue inerte (sin romper nada:
la malla y el feed público funcionan igual; la identidad es una capa de seguridad añadida).

**Observabilidad:** `registerIdentity` ahora captura el error del insert de identidad,
avisa por consola («¿migración de kind sin aplicar?») y permite reintento (antes marcaba
`identityRegistered=true` antes del insert y nunca reintentaba).

## 2. [ALTA seguridad] Suplantación de binding fp→cuenta

`refreshIdentities` seleccionaba solo `payload` y verificaba que la firma sobre `owner`
viniera de `pub` con huella `fp` — pero NO cruzaba `payload.owner` con `row.owner_id`. Como
el RLS de inserción solo exige `owner_id = auth.uid()`, una neurona podía publicar una fila
`kind:'identity'` con `payload.owner = <uuid de la víctima>` firmado con SU propia clave →
`idMap[fpAtacante] = cuentaVíctima` (suplantación de cuenta soberana).

**Fix:** `select("payload, owner_id")` + `if (String(p.owner) !== String(row.owner_id))
continue;`. Como el RLS fija `owner_id = auth.uid()`, exigir `owner === owner_id` obliga a
que la cuenta reclamada sea la del insertor real → solo puedes registrar TU propia cuenta.

**Defensa en profundidad (siguiente ola):** publicar el certificado de dispositivo firmado
por la **clave maestra** (`master-identity.signDeviceCert`, Adenda 121) y validar con
`verifyDeviceCert(cert, expectedMfp)` contra el ancla `account→mfp` fijada (TOFU/pin) antes
de poblar `idMap`.

## Verificación

`tsc` limpio · `test-mesh-core.ts` **89/89** (sin regresión) · `next build` **104/104**.
La corrección del CHECK exige aplicar la migración para verificarse de extremo a extremo en
producción (inserción real de `kind:'identity'`).

## Contexto

Forma parte de la respuesta al encargo de "continuar pendientes + analizar más mejoras con
multiagentes": 5 subagentes analizaron UI/UX, diseño, ajustes, grupos/gobernanza y técnica
(38 propuestas → `claude/roadmap-mejoras-ui-diseno-ajustes-grupos-2026-08-01.md`). Este bug
crítico salió del clúster técnico y se priorizó por encima de #mesh4.
