// THE FRONT deploy arm (docs/INFESTATION.md §front) — session-scoped, like loopFlow: the
// map's Deploy button arms ONE run with its sector's region warp, and the next eligible run
// boot consumes it (GameView threads RunOptions.sectorWarp; dailies/Arena/tutorial excluded
// there — fair shared boards). Never saved: a reload disarms, and nothing here touches the
// sim beyond the single composed warp (absent ⇒ byte-identical golden path).

import { ALL_SECTORS, deployWarp, regionOfSector } from '../core/infestation';
import type { DoctrineWarp } from '../core/doctrines';

let armed: string | null = null;

export const frontDeploy = {
  /** Arm the next eligible run with `sectorId`'s region warp (junk ids disarm). */
  arm(sectorId: string): void {
    armed = ALL_SECTORS.some((x) => x.id === sectorId) ? sectorId : null;
  },
  disarm(): void {
    armed = null;
  },
  /** The armed sector id (deploy banners read it), or null. */
  armedSector(): string | null {
    return armed;
  },
  /** The armed sector's region name for copy ('' when nothing is armed). */
  armedRegionName(): string {
    return armed ? regionOfSector(armed)?.name ?? '' : '';
  },
  /** Consume the arm into RunOptions extras — exactly one boot. */
  consumeWarp(): { sectorWarp: DoctrineWarp } | Record<string, never> {
    if (!armed) return {};
    const warp = deployWarp(armed);
    armed = null;
    return warp ? { sectorWarp: warp } : {};
  },
};
