import { ConfigKey, ConfigKeyEnum } from "@repo/zod-types";

import { configRepo } from "../db/repositories/config.repo";

// Idle timeout applied to client-facing sessions (StreamableHTTP/SSE) and the
// downstream connection pools when no SESSION_LIFETIME is explicitly
// configured. Without a bound, a client that never sends a session-terminating
// DELETE (e.g. a mobile app that gets backgrounded or force-quit) leaks its
// session, MetaMCP server instance, and downstream connections/processes
// forever. Operators who want the old infinite-session behavior can opt back
// in with SESSION_LIFETIME=-1 (or by explicitly clearing it via the admin
// config UI/tool, which still maps to infinite).
const DEFAULT_SESSION_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes

export const configService = {
  async isSignupDisabled(): Promise<boolean> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.DISABLE_SIGNUP,
    );
    return config?.value === "true";
  },

  async setSignupDisabled(disabled: boolean): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.DISABLE_SIGNUP,
      disabled.toString(),
      "Whether new user signup is disabled",
    );
  },

  async isSsoSignupDisabled(): Promise<boolean> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.DISABLE_SSO_SIGNUP,
    );
    return config?.value === "true";
  },

  async setSsoSignupDisabled(disabled: boolean): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.DISABLE_SSO_SIGNUP,
      disabled.toString(),
      "Whether new user signup via SSO/OAuth is disabled",
    );
  },

  async isBasicAuthDisabled(): Promise<boolean> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.DISABLE_BASIC_AUTH,
    );
    return config?.value === "true";
  },

  async setBasicAuthDisabled(disabled: boolean): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.DISABLE_BASIC_AUTH,
      disabled.toString(),
      "Whether basic email/password authentication is disabled",
    );
  },

  async getMcpResetTimeoutOnProgress(): Promise<boolean> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.MCP_RESET_TIMEOUT_ON_PROGRESS,
    );
    return config?.value === "true" || true;
  },

  async setMcpResetTimeoutOnProgress(enabled: boolean): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.MCP_RESET_TIMEOUT_ON_PROGRESS,
      enabled.toString(),
      "Whether to reset timeout on progress for MCP requests",
    );
  },

  async getMcpTimeout(): Promise<number> {
    const config = await configRepo.getConfig(ConfigKeyEnum.enum.MCP_TIMEOUT);
    return config?.value ? parseInt(config.value, 10) : 60000;
  },

  async setMcpTimeout(timeout: number): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.MCP_TIMEOUT,
      timeout.toString(),
      "MCP request timeout in milliseconds",
    );
  },

  async getMcpMaxTotalTimeout(): Promise<number> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.MCP_MAX_TOTAL_TIMEOUT,
    );
    return config?.value ? parseInt(config.value, 10) : 60000;
  },

  async setMcpMaxTotalTimeout(timeout: number): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.MCP_MAX_TOTAL_TIMEOUT,
      timeout.toString(),
      "MCP maximum total timeout in milliseconds",
    );
  },

  async getMcpMaxAttempts(): Promise<number> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.MCP_MAX_ATTEMPTS,
    );
    // Default to 3: a single transient blip (e.g. a slow cold-cache `uvx`
    // spawn) shouldn't immediately flag a server as ERROR.
    return config?.value ? parseInt(config.value, 10) : 3;
  },

  async setMcpMaxAttempts(maxAttempts: number): Promise<void> {
    await configRepo.setConfig(
      ConfigKeyEnum.enum.MCP_MAX_ATTEMPTS,
      maxAttempts.toString(),
      "Maximum number of crash attempts before marking MCP server as ERROR",
    );
  },

  async getSessionLifetime(): Promise<number | null> {
    const config = await configRepo.getConfig(
      ConfigKeyEnum.enum.SESSION_LIFETIME,
    );
    if (!config?.value) {
      // Fallback to env var (milliseconds), then the default idle timeout.
      const envLifetime = process.env.SESSION_LIFETIME;
      if (envLifetime) {
        const parsed = parseInt(envLifetime, 10);
        if (isNaN(parsed)) return DEFAULT_SESSION_LIFETIME_MS;
        return parsed < 0 ? null : parsed; // negative = infinite (opt-out)
      }
      return DEFAULT_SESSION_LIFETIME_MS;
    }
    const lifetime = parseInt(config.value, 10);
    if (isNaN(lifetime)) return DEFAULT_SESSION_LIFETIME_MS;
    return lifetime < 0 ? null : lifetime; // negative = infinite (opt-out)
  },

  async setSessionLifetime(lifetime?: number | null): Promise<void> {
    if (lifetime === null || lifetime === undefined) {
      // Remove the config to indicate infinite session lifetime
      await configRepo.deleteConfig(ConfigKeyEnum.enum.SESSION_LIFETIME);
    } else {
      await configRepo.setConfig(
        ConfigKeyEnum.enum.SESSION_LIFETIME,
        lifetime.toString(),
        "Session lifetime in milliseconds before automatic cleanup",
      );
    }
  },

  async getConfig(key: ConfigKey): Promise<string | undefined> {
    const config = await configRepo.getConfig(key);
    return config?.value;
  },

  async setConfig(
    key: ConfigKey,
    value: string,
    description?: string,
  ): Promise<void> {
    await configRepo.setConfig(key, value, description);
  },

  async getAllConfigs(): Promise<
    Array<{ id: string; value: string; description?: string | null }>
  > {
    return await configRepo.getAllConfigs();
  },

  async getAuthProviders(): Promise<
    Array<{ id: string; name: string; enabled: boolean }>
  > {
    const providers = [];

    // Check if OIDC is configured
    const isOidcEnabled = !!(
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET &&
      process.env.OIDC_DISCOVERY_URL
    );

    if (isOidcEnabled) {
      providers.push({
        id: "oidc",
        name: "OIDC",
        enabled: true,
      });
    }

    return providers;
  },
};
