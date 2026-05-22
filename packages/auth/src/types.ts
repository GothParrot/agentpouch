export type AuthKind = "bootstrap" | "api_key" | "guest_session";

export type Policy = {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[] | null;
  storageQuotaBytes: number | null;
  rateLimitRpm: number | null;
  allowedExpiryPresets: string[];
  canHardDelete: boolean;
  isGuest: boolean;
};

export type AuthContext = {
  kind: AuthKind;
  tokenId: string;
  tenantId: string | null;
  accountId: string | null;
  policy: Policy;
};
