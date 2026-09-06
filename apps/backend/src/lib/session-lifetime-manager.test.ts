import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const getSessionLifetime = vi.fn();
vi.mock("./config.service", () => ({
  configService: {
    getSessionLifetime: (...args: unknown[]) => getSessionLifetime(...args),
  },
}));

import { SessionLifetimeManagerImpl } from "./session-lifetime-manager";

describe("SessionLifetimeManagerImpl", () => {
  let manager: SessionLifetimeManagerImpl<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    getSessionLifetime.mockReset();
    manager = new SessionLifetimeManagerImpl<string>("Test");
  });

  it("sets a timestamp when a session is added", () => {
    manager.addSession("s1", "session-data");
    expect(manager.getSessionAge("s1")).toBe(0);
  });

  it("touches the timestamp on every successful getSession call (idle timeout, not hard TTL)", () => {
    manager.addSession("s1", "session-data");

    vi.setSystemTime(10_000);
    expect(manager.getSession("s1")).toBe("session-data");
    expect(manager.getSessionAge("s1")).toBe(0);

    vi.setSystemTime(20_000);
    expect(manager.getSessionAge("s1")).toBe(10_000);
  });

  it("does not create a timestamp entry for a lookup on an unknown session", () => {
    expect(manager.getSession("missing")).toBeUndefined();
    expect(manager.getSessionAge("missing")).toBeUndefined();
  });

  it("expires a session that is added but never accessed again", async () => {
    getSessionLifetime.mockResolvedValue(5_000);
    manager.addSession("s1", "session-data");

    vi.setSystemTime(10_000);
    const cleanupCallback = vi.fn().mockResolvedValue(undefined);
    await manager.cleanupExpiredSessions(cleanupCallback);

    expect(cleanupCallback).toHaveBeenCalledWith("s1", "session-data");
  });

  it("does not expire a session that is actively polled within the lifetime window, even once its total age exceeds it", async () => {
    getSessionLifetime.mockResolvedValue(5_000);
    manager.addSession("s1", "session-data");

    // Poll every 2s, well under the 5s lifetime, past the point where total
    // age since creation would have exceeded it under a hard-TTL scheme.
    for (const t of [2_000, 4_000, 6_000, 8_000, 10_000]) {
      vi.setSystemTime(t);
      manager.getSession("s1");
    }

    const cleanupCallback = vi.fn().mockResolvedValue(undefined);
    await manager.cleanupExpiredSessions(cleanupCallback);

    expect(cleanupCallback).not.toHaveBeenCalled();
    expect(manager.getSession("s1")).toBe("session-data");
  });

  it("skips cleanup entirely when session lifetime is null (infinite sessions)", async () => {
    getSessionLifetime.mockResolvedValue(null);
    manager.addSession("s1", "session-data");

    vi.setSystemTime(1_000_000_000);
    const cleanupCallback = vi.fn().mockResolvedValue(undefined);
    await manager.cleanupExpiredSessions(cleanupCallback);

    expect(cleanupCallback).not.toHaveBeenCalled();
  });

  it("isSessionExpired reflects idle time, not just creation time", async () => {
    getSessionLifetime.mockResolvedValue(5_000);
    manager.addSession("s1", "session-data");

    vi.setSystemTime(4_000);
    manager.getSession("s1"); // touch

    vi.setSystemTime(8_000);
    expect(await manager.isSessionExpired("s1")).toBe(false);

    vi.setSystemTime(10_000);
    expect(await manager.isSessionExpired("s1")).toBe(true);
  });
});
