```typescript
const rec: RouteRecord = {
  // ... (otros campos)
  usage: res?.usage, // Si res?.usage es true, recibe el uso de la conversación
};

if (primaryInfo) rec.primary = primaryInfo;
pushRouteRecord(rec);
req.onStatus?.("");
```