-- Custom SQL migration file, put your code below! --
-- #235: verification identifiers are now stored hashed (storeIdentifier: 'hashed'). Better Auth falls back to a plain
-- identifier when it reads a row, but not when it deletes one, so a trusted device recorded before hashing could no
-- longer be revoked. Purge those rows: each trusted device asks for its second factor once more. Plain emailed codes
-- (2fa-otp-) no longer verify and expire within minutes anyway. Reset-password rows stay: they still work through the
-- read fallback and are deleted on use. A hashed identifier is always 43 base64url characters (unpadded SHA-256), and
-- a plain trust-device identifier is 45, so the length check keeps any hashed row out of reach.
DELETE FROM "verifications"
WHERE ("identifier" LIKE 'trust-device-%' OR "identifier" LIKE '2fa-otp-%')
  AND length("identifier") <> 43;
