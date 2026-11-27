import { describe, expect, it } from "vitest";
import { SnapshotSchema } from "@santa-tracker/contracts";
import { createDeterministicSnapshot } from "@santa-tracker/test-fixtures";

describe("server contracts", () => {
  it("accepts the deterministic published snapshot fixture", () => {
    expect(SnapshotSchema.safeParse(createDeterministicSnapshot()).success).toBe(true);
  });

  it("requires registered seasonal configuration inside canonical snapshots", () => {
    const snapshot = createDeterministicSnapshot();
    const { seasonalConfig: _seasonalConfig, ...missingConfig } = snapshot;
    expect(SnapshotSchema.safeParse(missingConfig).success).toBe(false);
    expect(SnapshotSchema.safeParse({
      ...snapshot,
      seasonalConfig: { ...snapshot.seasonalConfig, flags: { ...snapshot.seasonalConfig.flags, unknownFlag: true } },
    }).success).toBe(false);
  });
});
