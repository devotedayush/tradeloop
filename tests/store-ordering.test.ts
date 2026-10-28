import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { seed } from "../src/core/seed";
import type { State } from "../src/core/types";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DynamoDBDocumentClient: { from: () => ({ send: mocks.send }) },
}));
import { Store } from "../src/adapters/store";

const byAt = ["messages", "audit", "processed"] as const;
const byCreated = ["cases", "requests", "outbox"] as const;
const timestamps = [
  {
    id: "a-new",
    at: "2026-10-28T22:14:00.000Z",
    createdAt: "2026-10-28T22:14:00.000Z",
  },
  {
    id: "b-tie",
    at: "2026-10-28T16:22:00.000Z",
    createdAt: "2026-10-28T16:22:00.000Z",
  },
  {
    id: "c-old",
    at: "2026-10-28T10:00:00.000Z",
    createdAt: "2026-10-28T10:00:00.000Z",
  },
  {
    id: "a-tie",
    at: "2026-10-28T16:22:00.000Z",
    createdAt: "2026-10-28T16:22:00.000Z",
  },
];
const expected = ["c-old", "a-tie", "b-tie", "a-new"];
const fixture = () => {
  const state = seed();
  for (const key of [...byAt, ...byCreated])
    (state as unknown as Record<string, unknown>)[key] =
      structuredClone(timestamps);
  return state;
};
const assertOrdering = (state: State) => {
  for (const key of [...byAt, ...byCreated])
    expect(
      state[key].map((item) => item.id),
      key,
    ).toEqual(expected);
};

describe("Store chronological reconstruction", () => {
  const directories: string[] = [];
  beforeEach(() => mocks.send.mockReset());
  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("orders paginated DynamoDB rows by event time instead of random entity keys", async () => {
    const source = fixture();
    const rows = [...byAt, ...byCreated].flatMap((key) =>
      source[key].map((value) => ({ SK: `${key}#${value.id}`, value })),
    );
    rows.sort((a, b) => a.SK.localeCompare(b.SK));
    const middle = Math.floor(rows.length / 2);
    mocks.send
      .mockResolvedValueOnce({
        Item: { revision: 7, business: source.business },
      })
      .mockResolvedValueOnce({
        Items: rows.slice(0, middle),
        LastEvaluatedKey: { PK: "TENANT#demofoods", SK: rows[middle - 1].SK },
      })
      .mockResolvedValueOnce({ Items: rows.slice(middle) })
      .mockResolvedValueOnce({
        Item: { revision: 7, business: source.business },
      });
    const loaded = await new Store("mock-table").load("demofoods");
    assertOrdering(loaded);
    expect(loaded.revision).toBe(7);
    expect(
      mocks.send.mock.calls.map(([command]) => command.constructor.name),
    ).toEqual(["GetCommand", "QueryCommand", "QueryCommand", "GetCommand"]);
  });

  it("applies the same timestamp ordering to local persisted state", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "tradeloop-ordering-"),
    );
    directories.push(directory);
    await writeFile(
      path.join(directory, "demofoods.json"),
      JSON.stringify(fixture()),
    );
    const loaded = await new Store(undefined, directory).load("demofoods");
    assertOrdering(loaded);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
