#!/bin/sh
set -eu

PLUGIN_VERSION="${PEERTUBE_OIDC_PLUGIN_VERSION:-1.1.0}"
XAPI_PLUGIN_VERSION="${PEERTUBE_OLT_XAPI_PLUGIN_VERSION:-0.1.0}"
XAPI_PLUGIN_SOURCE="${PEERTUBE_OLT_XAPI_PLUGIN_SOURCE:-/bootstrap/plugins/peertube-plugin-olt-xapi}"
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

if [ -d "$XAPI_PLUGIN_SOURCE" ]; then
  npm install --omit=dev --no-audit --no-fund "$XAPI_PLUGIN_SOURCE"
else
  echo "OLT xAPI plugin source not found at $XAPI_PLUGIN_SOURCE; skipping install." >&2
fi

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

if [ -d "$XAPI_PLUGIN_SOURCE" ]; then
  XAPI_SETTINGS_JSON="$(node <<'NODE'
const settings = {
  "enabled": process.env.PEERTUBE_OLT_XAPI_ENABLED !== "false",
  "internal-ingest-url": process.env.OLT_XAPI_INTERNAL_INGEST_URL || "",
  "public-ingest-url": process.env.OLT_XAPI_PUBLIC_INGEST_URL || "",
  "activity-prefix": process.env.OLT_XAPI_ACTIVITY_PREFIX || "http://peertube.localhost/xapi"
};

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
  'olt-xapi',
  1,
  '${XAPI_PLUGIN_VERSION}',
  NULL,
  TRUE,
  FALSE,
  '>=5.0.0',
  'Local OLT xAPI demo instrumentation for PeerTube.',
  'https://openlearningtools.local',
  \$olt\$${XAPI_SETTINGS_JSON}\$olt\$::jsonb,
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
fi

chown -R 999:999 "$PLUGIN_DIR"
