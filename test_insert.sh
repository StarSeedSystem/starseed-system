#!/bin/bash
# [REDACTADO:service_role_supabase] — nunca hardcodear la service_role (auditoría de seguridad 2026-07-12).
# Ejecutar con: SUPABASE_SERVICE_ROLE_KEY=... bash test_insert.sh  (la clave vive en .env.local, gitignorada)
curl -s -X POST 'https://nxstilnyidvkqeosofuh.supabase.co/rest/v1/os_account_profiles' \
-H "apikey: sb_publishable_tNfP2UU0trF1XeDgw8N1zA_JSdePtzy" \
-H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
-H "Content-Type: application/json" \
-H "Prefer: return=representation" \
-d '{
  "account": "136b77cd-fa83-4a65-8b85-5b4cfdc756b5",
  "name": "Test Profile",
  "handle": "test_profile_2",
  "kind": "personal",
  "visibility": "public"
}'
