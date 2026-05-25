import type { Token } from "@agentpouch/db";
import type { Policy } from "./types.js";

export type DefaultLimits = {
  maxFileSizeBytes: number;
  allowedExpiryPresets: string[];
  guestMaxFileSizeBytes: number;
  guestMaxTtl: string;
  guestAllowedExpiryPresets: string[];
};

export function resolvePolicy(token: Token, defaults: DefaultLimits): Policy {
  const isGuest = token.kind === "guest_session";
  const isBootstrap = token.kind === "bootstrap";

  if (isGuest) {
    return {
      maxFileSizeBytes: defaults.guestMaxFileSizeBytes,
      allowedMimeTypes: null,
      storageQuotaBytes: null,
      rateLimitRpm: 30,
      allowedExpiryPresets: defaults.guestAllowedExpiryPresets,
      canHardDelete: false,
      isGuest: true,
    };
  }

  return {
    maxFileSizeBytes: token.maxFileSizeBytes
      ? Number(token.maxFileSizeBytes)
      : defaults.maxFileSizeBytes,
    allowedMimeTypes: token.allowedMimeTypes ?? null,
    storageQuotaBytes: token.storageQuotaBytes ? Number(token.storageQuotaBytes) : null,
    rateLimitRpm: token.rateLimitRpm ?? null,
    allowedExpiryPresets: defaults.allowedExpiryPresets,
    canHardDelete: isBootstrap,
    isGuest: false,
  };
}
