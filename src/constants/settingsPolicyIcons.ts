import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { PolicyId } from "./appPolicies";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export const SETTINGS_POLICY_ICONS: Record<PolicyId, IoniconName> = {
  privacy: "shield-checkmark-outline",
  terms: "document-text-outline",
  community: "people-outline",
  marketplace: "bag-handle-outline",
  seller: "pricetag-outline",
  prohibited: "ban-outline",
  refunds: "swap-horizontal-outline",
  copyright: "ribbon-outline",
  contact: "mail-unread-outline",
  account_deletion: "trash-outline",
};
