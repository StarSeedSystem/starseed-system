#!/bin/bash
curl -s -X POST 'https://nxstilnyidvkqeosofuh.supabase.co/rest/v1/os_account_profiles' \
-H "apikey: sb_publishable_tNfP2UU0trF1XeDgw8N1zA_JSdePtzy" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54c3RpbG55aWR2a3Flb3NvZnVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNTIyMSwiZXhwIjoyMDk3ODExMjIxfQ.4C51JMRc8GnN6KLtZf0nTQ299XzbkcgYzhY09BdVpjg" \
-H "Content-Type: application/json" \
-H "Prefer: return=representation" \
-d '{
  "account": "136b77cd-fa83-4a65-8b85-5b4cfdc756b5",
  "name": "Test Profile",
  "handle": "test_profile_2",
  "kind": "personal",
  "visibility": "public"
}'
