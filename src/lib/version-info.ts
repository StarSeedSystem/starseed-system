export interface VersionInfo {
  build: string;
  at: string;
  sha: string | null;
  rama: string | null;
  version: string;
}

export function generateVersionInfo(packageVersion: string): VersionInfo {
  const build = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    build,
    at: new Date().toISOString(),
    sha: null,
    rama: null,
    version: packageVersion,
  };
}