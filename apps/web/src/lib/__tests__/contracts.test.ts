import { describe, expect, it } from "vitest";
import { SnapshotSchema } from "@santa-tracker/contracts";
import { createDeterministicSnapshot } from "@santa-tracker/test-fixtures";

describe("server contracts", () => {
  it("accepts the deterministic published snapshot fixture", () => {
    expect(SnapshotSchema.safeParse(createDeterministicSnapshot()).success).toBe(true);
  });
});
