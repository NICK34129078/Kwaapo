-- Hotfix op de PII-lockdown (20260709100200): `is_private` ontbrak in de
-- kolom-allowlist, terwijl clients die kolom nodig hebben voor privacy-UI:
--   - ProfileScreen (eigen profielheader + ontvanger-privacycheck)
--   - profilePrivacyService (lezen/togglen van eigen privacy)
--   - profileService.PROFILE_COLUMNS (NotificationCenter, MyShop, fulfillment)
-- Column-level privileges laten de HELE query falen zodra één geselecteerde
-- kolom geen grant heeft, dus deze paden gaven "permission denied".
-- `is_private` is geen PII: het is de publieke zichtbaarheidsvlag (slotje).

grant select (is_private) on public.profiles to authenticated;
