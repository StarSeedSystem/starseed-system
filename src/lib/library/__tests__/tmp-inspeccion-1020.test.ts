import { describe, it } from "vitest";
import { REPO_EXTERNOS_1020 } from "../repos-externos-1020";

describe("inspección", () => {
  it("volca los 14 paquetes", () => {
    for (const p of REPO_EXTERNOS_1020.packages) {
      console.log(JSON.stringify({
        id: p.id,
        kind: p.kind,
        icon: p.icon,
        author: p.author,
        version: p.version,
        tags: p.tags,
        description: p.description.slice(0, 90),
        payload: p.payload,
        comingSoon: p.comingSoon,
        free: p.free,
        sourceRepoId: p.sourceRepoId,
      }));
    }
  });
});
