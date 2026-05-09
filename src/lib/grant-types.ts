export const GRANT_TYPES = [
  "iso",
  "nso",
  "rsu",
  "founder_shares",
  "safe",
  "other",
] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const GRANT_TYPE_LABEL: Record<GrantType, string> = {
  iso: "ISO",
  nso: "NSO",
  rsu: "RSU",
  founder_shares: "Common shares",
  safe: "SAFE",
  other: "Other",
};
