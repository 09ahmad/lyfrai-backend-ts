up:
	docker compose up -d --build

down:
	docker compose down -v

logs:
	docker compose logs -f api

test:
	bun test

run:
	WEBHOOK_SECRET=testsecret DATABASE_URL=sqlite:./data/app.db bun run app/main.ts

build:
	docker compose build

