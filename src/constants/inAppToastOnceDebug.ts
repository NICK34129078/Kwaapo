export function logInAppToastOnce(
  message: string,
  notificationId?: string,
  extra?: string
): void {
  if (!__DEV__) {
    return;
  }
  const idPart = notificationId ? ` ${notificationId}` : "";
  const extraPart = extra ? ` ${extra}` : "";
  console.log(`[InAppToastOnce] ${message}${idPart}${extraPart}`);
}
