import React, { useEffect, useRef } from "react";
import {
  NavigationContainerRef,
  CommonActions,
} from "@react-navigation/native";

import { useAuth } from "../context/AuthContext";
import { shouldOpenPasswordRecoveryScreen } from "../utils/authRecoveryState";

/** Navigeert naar ResetPassword wanneer een recovery-sessie actief is (ook na cold start). */
export function PasswordRecoveryNavigator({
  navigationRef,
  navigationReady,
}: {
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
  navigationReady: boolean;
}) {
  const { loading, session, passwordRecoveryPending } = useAuth();
  const openedRef = useRef(false);

  useEffect(() => {
    if (
      !navigationReady ||
      loading ||
      !navigationRef.current ||
      !shouldOpenPasswordRecoveryScreen({ passwordRecoveryPending, session })
    ) {
      if (!passwordRecoveryPending) {
        openedRef.current = false;
      }
      return;
    }
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    navigationRef.current.dispatch(
      CommonActions.navigate({ name: "ResetPassword" })
    );
  }, [
    loading,
    navigationReady,
    navigationRef,
    passwordRecoveryPending,
    session,
  ]);

  return null;
}
