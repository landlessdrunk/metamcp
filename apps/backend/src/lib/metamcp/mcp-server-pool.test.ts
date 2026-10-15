import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The pool singleton starts cleanup/health timers and pulls in config and
// connection modules at import; stub them so only cleanupSession is exercised.
vi.mock("../config.service", () => ({
  configService: { getSessionLifetime: vi.fn().mockResolvedValue(null) },
}));
vi.mock("./client", () => ({ connectMetaMcpClient: vi.fn() }));
vi.mock("./log-store", () => ({ metamcpLogStore: { addLog: vi.fn() } }));
vi.mock("./server-error-tracker", () => ({ serverErrorTracker: {} }));

import { ConnectedClient } from "./client";
import { mcpServerPool } from "./mcp-server-pool";

type PoolInternals = {
  idleSessions: Record<string, ConnectedClient>;
  activeSessions: Record<string, Record<string, ConnectedClient>>;
  sessionToServers: Record<string, Set<string>>;
  sessionTimestamps: Record<string, number>;
};

const internals = () => mcpServerPool as unknown as PoolInternals;

const makeClient = () =>
  ({ cleanup: vi.fn().mockResolvedValue(undefined) }) as unknown as ConnectedClient & {
    cleanup: ReturnType<typeof vi.fn>;
  };

const addActive = (
  sessionId: string,
  serverUuid: string,
  client: ConnectedClient,
) => {
  const pool = internals();
  pool.activeSessions[sessionId] ??= {};
  pool.activeSessions[sessionId][serverUuid] = client;
  pool.sessionToServers[sessionId] ??= new Set();
  pool.sessionToServers[sessionId].add(serverUuid);
  pool.sessionTimestamps[sessionId] = Date.now();
};

describe("McpServerPool.cleanupSession", () => {
  beforeEach(() => {
    const pool = internals();
    pool.idleSessions = {};
    pool.activeSessions = {};
    pool.sessionToServers = {};
    pool.sessionTimestamps = {};
  });

  afterAll(async () => {
    await mcpServerPool.cleanupAll();
  });

  it("does not destroy a connection still shared with another session", async () => {
    // At the per-server cap, getSession() hands session B the same client
    // session A already holds.
    const shared = makeClient();
    addActive("session-a", "server-1", shared);
    addActive("session-b", "server-1", shared);
    internals().idleSessions["server-1"] = makeClient();

    await mcpServerPool.cleanupSession("session-b");

    expect(shared.cleanup).not.toHaveBeenCalled();
    expect(internals().activeSessions["session-a"]["server-1"]).toBe(shared);
    expect(internals().activeSessions["session-b"]).toBeUndefined();
  });

  it("does not recycle a shared connection into the idle pool", async () => {
    const shared = makeClient();
    addActive("session-a", "server-1", shared);
    addActive("session-b", "server-1", shared);

    await mcpServerPool.cleanupSession("session-b");

    expect(internals().idleSessions["server-1"]).toBeUndefined();
    expect(shared.cleanup).not.toHaveBeenCalled();
  });

  it("still destroys an unshared extra connection when idle is full", async () => {
    const own = makeClient();
    addActive("session-a", "server-1", own);
    internals().idleSessions["server-1"] = makeClient();

    await mcpServerPool.cleanupSession("session-a");

    expect(own.cleanup).toHaveBeenCalledTimes(1);
  });

  it("still recycles an unshared connection when idle is empty", async () => {
    const own = makeClient();
    addActive("session-a", "server-1", own);

    await mcpServerPool.cleanupSession("session-a");

    expect(internals().idleSessions["server-1"]).toBe(own);
    expect(own.cleanup).not.toHaveBeenCalled();
  });
});
