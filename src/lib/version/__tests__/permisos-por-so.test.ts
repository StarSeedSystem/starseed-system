import { describe, it, expect } from 'vitest';
import { permisosDe, TODOS } from '../permisos-por-so';

const capabilityIds = [
  'core:default','core:app:default','core:window:default','core:webview:default','core:event:default','core:path:default','core:resources:default','core:menu:default','core:tray:default','core:window:allow-set-title','core:window:allow-minimize','core:window:allow-maximize','core:window:allow-unmaximize','core:window:allow-close','core:window:allow-start-dragging','shell:allow-execute','shell:allow-spawn','shell:allow-kill','shell:allow-stdin-write','shell:allow-open','fs:allow-read-text-file','fs:allow-write-text-file','fs:allow-read-dir','fs:allow-mkdir','fs:scope','fs:default','os:allow-platform','os:allow-version','os:allow-os-type','os:allow-family','os:allow-arch','os:allow-hostname','os:allow-locale','os:allow-exe-extension','process:allow-exit','process:allow-restart','notification:default','notification:allow-notify','notification:allow-request-permission','notification:allow-is-permission-granted','dialog:default','dialog:allow-open','dialog:allow-save','dialog:allow-message','dialog:allow-ask','dialog:allow-confirm','deep-link:default','autostart:default','autostart:allow-enable','autostart:allow-disable','autostart:allow-is-enabled','updater:default','updater:allow-check','updater:allow-download-and-install'
];

describe('permisos-por-so', () => {
  it('exporta permisosDe y devuelve info por SO', () => {
    const mac = permisosDe('macos');
    expect(mac).toBeDefined();
    expect(mac?.versionMinima).toBe('10.15');
    expect(mac?.arquitecturas).toContain('arm64');
  });

  it('cada identificador de capability aparece en JSON', () => {
    const idsEnJson = new Set<string>();
    Object.values(TODOS).forEach(so => {
      so.permisos.forEach(p => idsEnJson.add(p.id));
    });
    capabilityIds.forEach(id => {
      expect(idsEnJson.has(id)).toBe(true);
    });
  });

  it('android contiene permisos declarados', () => {
    const android = permisosDe('android');
    expect(android).toBeDefined();
    const ids = android?.permisos.map(p => p.id) ?? [];
    expect(ids).toContain('FOREGROUND_SERVICE');
    expect(ids).toContain('POST_NOTIFICATIONS');
  });
});
