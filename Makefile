dev:
	cp -n .env.example .env || true
	docker compose up --build

dev-down:
	docker compose down

prod:
	cp -n .env.example .env || true
	docker compose -f docker-compose.prod.yml pull
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

logs:
	docker compose logs -f api worker caddy

db-push:
	docker compose exec api npm run db:push
