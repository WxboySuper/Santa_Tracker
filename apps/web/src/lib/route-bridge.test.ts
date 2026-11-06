import { expect, it } from "vitest";
import { routeNodesToContractRoute } from "./route-bridge";

it("accepts legacy stop identifiers that are not public contract IDs", () => {
  const result = routeNodesToContractRoute([{
    id: "node_011_waitemat_", type: "DELIVERY", location: { name: "Waitematā", lat: -36, lng: 174 },
    schedule: { arrival_utc: "2026-12-24T10:00:00Z", departure_utc: "2026-12-24T10:01:00Z" },
  }]);
  expect(result.route.stops).toHaveLength(1);
  expect(result.timedNodes[0]?.id).toBe("node_011_waitemat_");
});
