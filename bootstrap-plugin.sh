#!/bin/sh
set -eu

PLUGIN_VERSION="${PEERTUBE_OIDC_PLUGIN_VERSION:-1.1.0}"
PLUGIN_DIR="/data/plugins"

if ! command -v psql >/dev/null 2>&1; then
  apk add --no-cache postgresql-client
fi

mkdir -p "$PLUGIN_DIR"
cd "$PLUGIN_DIR"

if [ ! -f package.json ]; then
  printf '{"private":true,"dependencies":{}}\n' > package.json
fi

npm install --omit=dev --no-audit --no-fund "peertube-plugin-auth-openid-connect@${PLUGIN_VERSION}"

SETTINGS_JSON="$(node <<'NODE'
const settings = {
  "scope": process.env.PEERTUBE_OIDC_SCOPE || "openid email profile",
  "client-id": process.env.PEERTUBE_OIDC_CLIENT_ID,
  "discover-url": process.env.PEERTUBE_OIDC_DISCOVER_URL || "http://olt.localhost",
  "allowed-group": "",
  "client-secret": process.env.PEERTUBE_OIDC_CLIENT_SECRET,
  "mail-property": "email",
  "role-property": "",
  "group-property": "",
  "auth-display-name": "Open Learning Tools",
  "username-property": "email",
  "logout-redirect-uri": "",
  "signature-algorithm": "RS256",
  "display-name-property": "email",
  "allowed-external-redirect-uris": "~^peertube://joinpeertube.org/.*$,~^http://peertube\\.localhost(/.*)?$"
};

for (const key of ["client-id", "client-secret"]) {
  if (!settings[key]) {
    throw new Error(`Missing ${key} setting`);
  }
}

console.log(JSON.stringify(settings));
NODE
)"

psql "$PEERTUBE_DATABASE_URL" <<SQL
INSERT INTO plugin (
  name,
  type,
  version,
  "latestVersion",
  enabled,
  uninstalled,
  "peertubeEngine",
  description,
  homepage,
  settings,
  storage,
  "createdAt",
  "updatedAt"
) VALUES (
  'auth-openid-connect',
  1,
  '${PLUGIN_VERSION}',
  NULL,
  TRUE,
  FALSE,
  '>=2.2.0',
  'Add OpenID connect support to login form in PeerTube.',
  'https://framagit.org/framasoft/peertube/official-plugins/tree/master/peertube-plugin-auth-openid-connect',
  \$olt\$${SETTINGS_JSON}\$olt\$::jsonb,
  NULL,
  now(),
  now()
)
ON CONFLICT (name, type) DO UPDATE SET
  version = EXCLUDED.version,
  enabled = TRUE,
  uninstalled = FALSE,
  settings = EXCLUDED.settings,
  "updatedAt" = now();
SQL

chown -R 999:999 "$PLUGIN_DIR"
