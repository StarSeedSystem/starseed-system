# SOP — Adenda 121: identidad soberana portátil (clave maestra de cuenta)

> **Regla dorada:** este SOP es la fuente de verdad. Si la lógica cambia, actualiza
> primero este documento y luego el código.

Segunda sub-ola de **identidad soberana** (roadmap #mesh5). Módulo criptográfico
nuevo `src/ai/astraura/mesh/master-identity.ts`. Pasó una **revisión adversarial**
(subagente criptográfico) que encontró un fallo ALTO (falsificación de cuenta) y
cuatro MEDIOS; **todos corregidos antes de desplegar**.

## Qué hace

- **Clave maestra de cuenta** (ECDSA P-256, huella `acct:…`): raíz de confianza
  soberana, estable e independiente de cualquier dispositivo. `getOrCreateMasterKey`,
  `masterFingerprint`, `hasMasterKey`.
- **Certificado de dispositivo**: la maestra firma `{deviceFp, account, iat}`
  (`signDeviceCert`) para avalar que una subclave de dispositivo pertenece a la cuenta.
- **Portabilidad**: `exportMasterKeyEncrypted(passphrase)` → blob cifrado (PBKDF2-SHA256
  600k → AES-GCM 256; la privada NUNCA sale en claro). `importMasterKeyEncrypted(blob,
  passphrase)` restaura la identidad en otra neurona. Invariante §6 "identidad portátil".
- Exportado por el barrel `mesh/index.ts`. Sin wiring de UI/registro aún (eso es la
  integración de la siguiente sub-ola).

## Correcciones de la revisión adversarial (aplicadas)

1. **[ALTA] Ancla de confianza en `verifyDeviceCert`.** El diseño inicial verificaba el
   cert contra la clave que el PROPIO cert transportaba → cualquiera generaba su maestra
   y firmaba un cert "reclamando" una cuenta ajena (suplantación total). **Fix:**
   `verifyDeviceCert(cert, expectedMfp)` EXIGE `cert.mfp === expectedMfp`, donde
   `expectedMfp` es la huella de cuenta fijada out-of-band (TOFU/pin o registro
   account→mfp). Sin ancla, el aval es auto-referente e inútil. Test negativo:
   "maestra AJENA rechazada contra la esperada".
2. **[MEDIA] Header sin autenticar en el import.** `importMasterKeyEncrypted` solo
   comprobaba `fpOfMaster(mpub)===mfp` (tautológico); no ligaba la privada descifrada a
   `mpub`. **Fix:** se verifica que `privJwk.{crv,x,y} === mpub.{crv,x,y}` antes de
   aceptar. Test negativo: "blob con mpub intercambiada (priv≠mpub) NO importa".
3. **[MEDIA] Regeneración silenciosa de la raíz.** Si la maestra existía pero su carga
   fallaba (WebCrypto transitorio / storage corrupto), se regeneraba encima → pérdida
   irrecuperable de la identidad soberana. **Fix:** si hay clave almacenada y su carga
   falla, `getOrCreateMasterKey` devuelve null y NO regenera; solo genera cuando NO hay
   ninguna.
4. **[MEDIA] KDF débil + DoS por iteraciones.** **Fix:** PBKDF2 210k→**600k** (OWASP),
   passphrase mínima 8→**12** (aplicada en export E import), e **iteraciones acotadas**
   al importar a [100k, 1M] (un blob hostil no dispara un PBKDF2 gigante).
- Verificado como CORRECTO por la revisión: mensaje canónico estable (misma función
  firma/verifica), `fpOfMaster` (~120 bits, resiste segunda-preimagen dirigida), sin
  reutilización de iv/salt (aleatorios por export), y toda la API degrada a null/false
  sin lanzar.

## Residuales documentados (siguiente sub-ola de integración)

- **Rotación/revocación de la maestra:** aún no existe. Es la clave más sensible; su
  rotación exige el pin `account→mfp` (#1) y re-certificar dispositivos. Un cert es hoy
  un aval *bearer y perpetuo* — `verifyDeviceCert` NO cruza la revocación del `deviceFp`;
  el llamador debe hacerlo con `isRevoked(deviceFp)` de `mesh-identity`.
- **Distribución del ancla `account→mfp`:** la integración publicará la huella maestra de
  la cuenta (firmada / vía registro de identidad) y las neuronas la fijarán (TOFU), para
  poder pasar `expectedMfp` a `verifyDeviceCert` en el flujo real.
- **`iat` no se valida** (los certs no caducan a propósito); la canonicalización JSON es
  intra-módulo (frágil para un verificador cross-lenguaje si algún día se federa).

## Verificación

`test-mesh-core.ts` **81/81** (+13 de identidad portátil, incl. los negativos de #1 y #2)
· `tsc` limpio · `next build` **104/104**.
