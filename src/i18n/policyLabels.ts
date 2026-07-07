import type { PolicyId } from "../constants/appPolicies";
import i18n from "./index";

export function getPolicyLinkLabel(policyId: PolicyId): string {
  return i18n.t(`legal.${policyId}`);
}
