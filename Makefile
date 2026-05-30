.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: up
up: ## Start the full stack (dev)
	$(COMPOSE) up -d --build

.PHONY: down
down: ## Stop the stack
	$(COMPOSE) down

.PHONY: logs
logs: ## Tail logs (svc=api|worker|...)
	$(COMPOSE) logs -f $(svc)

.PHONY: ps
ps: ## Show running services
	$(COMPOSE) ps

.PHONY: migrate
migrate: ## Apply DB migrations
	$(COMPOSE) exec api alembic upgrade head

.PHONY: makemigration
makemigration: ## Autogenerate a migration (m="message")
	$(COMPOSE) exec api alembic revision --autogenerate -m "$(m)"

.PHONY: seed
seed: ## Seed roles/permissions + demo tenant
	$(COMPOSE) exec api python -m app.scripts.seed

.PHONY: test
test: ## Run backend tests
	$(COMPOSE) exec api pytest -q

.PHONY: lint
lint: ## Lint + type-check backend
	$(COMPOSE) exec api ruff check . && $(COMPOSE) exec api mypy app

.PHONY: shell
shell: ## Open a shell in the api container
	$(COMPOSE) exec api bash

.PHONY: psql
psql: ## Open psql
	$(COMPOSE) exec postgres psql -U rag -d rag
