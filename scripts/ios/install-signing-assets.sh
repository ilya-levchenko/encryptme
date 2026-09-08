#!/usr/bin/env bash
set -euo pipefail

: "${IOS_DISTRIBUTION_CERTIFICATE_BASE64:?Missing iOS certificate secret}"
: "${IOS_CERTIFICATE_PASSWORD:?Missing certificate password secret}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?Missing provisioning profile secret}"

certificate_path="$RUNNER_TEMP/encryptme-distribution.p12"
profile_path="$RUNNER_TEMP/encryptme.mobileprovision"
profile_plist="$RUNNER_TEMP/encryptme-profile.plist"
keychain_path="$RUNNER_TEMP/encryptme-signing.keychain-db"
keychain_password="$(openssl rand -hex 24)"

echo "$IOS_DISTRIBUTION_CERTIFICATE_BASE64" | base64 --decode > "$certificate_path"
echo "$IOS_PROVISIONING_PROFILE_BASE64" | base64 --decode > "$profile_path"

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain_path"
security set-key-partition-list -S apple-tool:,apple: -k "$keychain_password" "$keychain_path"
security list-keychains -d user -s "$keychain_path"

security cms -D -i "$profile_path" > "$profile_plist"
profile_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$profile_plist")"
profile_name="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$profile_plist")"
team_id="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$profile_plist")"
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$profile_path" "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"

{
  echo "profile_name=$profile_name"
  echo "team_id=$team_id"
  echo "keychain_path=$keychain_path"
} >> "$GITHUB_OUTPUT"
