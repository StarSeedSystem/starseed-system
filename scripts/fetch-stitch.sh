#!/bin/bash

# fetch-stitch.sh
# Usage: ./fetch-stitch.sh <URL> <OUTPUT_PATH>

URL="$1"
OUTPUT="$2"

if [ -z "$URL" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 <URL> <OUTPUT_PATH>"
  exit 1
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"

# Fetch with curl, following redirects (-L) and handling potential auth headers if needed (though usually signed URLs work directly)
# We user a distinct User-Agent just in case
curl -L -A "Stitch-Fetcher/1.0" -o "$OUTPUT" "$URL"

if [ $? -eq 0 ]; then
  echo "Successfully downloaded to $OUTPUT"
else
  echo "Failed to download $URL"
  exit 1
fi
