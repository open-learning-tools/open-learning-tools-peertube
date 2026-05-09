# OLT PeerTube Local-Dev Assets

This folder contains mount-ready PeerTube configuration for the OLT local Docker stack. It keeps the local hostname, shared Postgres, Redis, local SMTP target, and OIDC bootstrap wiring together without storing real secrets.

## Intended Local Settings

- Public URL: `http://peertube.localhost`
- Internal app port: `9000`
- Database: Postgres service `postgres`, database `olt_peertube`
- Cache/queue: Redis service `redis`, port `6379`
- SMTP target: `maildev:1025`, no TLS or STARTTLS
- User-facing label in OLT: `Videos`

PeerTube treats the public hostname as effectively permanent after first boot. Use `peertube.localhost` before creating local data.

## Files

- `config/production.yaml`: minimal local defaults that can be mounted at `/config/production.yaml`.
- `config/custom-environment-variables.yaml`: node-config mappings so root `.env` values override the local defaults.
- `bootstrap-plugin.sh`: installs and configures the OpenID Connect auth plugin in the shared PeerTube data volume.
- `env.local.example`: PeerTube-specific environment keys to mirror in the root `.env`.

## Parent Integration Notes

To activate these assets, the parent stack should mount this config directory into the PeerTube container:

```yaml
volumes:
  - peertube_assets:/app/client/dist
  - peertube_data:/data
  - ./docker/peertube/config:/config:ro
```

The parent Compose environment should use `PEERTUBE_DB_NAME` for the database name. PeerTube's Docker environment mapping reads `PEERTUBE_DB_NAME`; `PEERTUBE_DB_DATABASE` is not used by the official mapping.

If a local SMTP service is added later, expose it as `maildev` on the Docker network or change `PEERTUBE_SMTP_HOSTNAME` in the root `.env`.

## OIDC Notes

The parent Compose stack runs `peertube-bootstrap` before PeerTube starts. That helper installs `peertube-plugin-auth-openid-connect` and writes plugin settings for:

- Issuer: `http://olt.localhost`
- Client ID: `PEERTUBE_OIDC_CLIENT_ID`
- Client secret: `PEERTUBE_OIDC_CLIENT_SECRET`
- Scope: `openid profile email`
- Redirect URI: `http://peertube.localhost/plugins/auth-openid-connect/router/code-cb`

Keep real client secrets only in the root `.env`.
