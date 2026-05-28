# Deployment

## Target flow

`git push -> CI -> Docker build in GitHub -> push GHCR + Aliyun ACR -> server pull -> migrate -> start -> health check`

Production server must not build images locally.

## Target server

- Host: `82.157.22.93`
- Domain: `edu.futuredecade.com`
- Suggested path: `/opt/fd-edu-system`
- Health check: `https://edu.futuredecade.com/ready`

## Required GitHub Secrets

- `ACR_REGISTRY`
- `ACR_NAMESPACE`
- `ACR_USERNAME`
- `ACR_PASSWORD`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_HEALTHCHECK_URL`

Expected values for this project:

```text
DEPLOY_HOST=82.157.22.93
DEPLOY_PATH=/opt/fd-edu-system
DEPLOY_HEALTHCHECK_URL=https://edu.futuredecade.com/ready
```

## Server bootstrap

```bash
sudo mkdir -p /opt/fd-edu-system
sudo chown -R "$USER":"$USER" /opt/fd-edu-system
git clone git@github.com:FutureDecade/fd-edu-system.git /opt/fd-edu-system
cd /opt/fd-edu-system
cp .env.example .env
```

Production `.env` must use:

```text
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=8090
CORS_ORIGIN=https://edu.futuredecade.com
CADDY_SITE_ADDRESS=:80
FD_EDU_HTTP_PORT=18090
FD_EDU_HTTPS_PORT=18446
DATABASE_URL=postgres://fd_edu:<password>@postgres:5432/fd_edu
REDIS_URL=redis://redis:6379
```
