IMAGE ?= url-shortener
PORT  ?= 3000

.PHONY: help install build test test-coverage typecheck dev run docker-build docker-run compose-up clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies from the lockfile
	npm ci

build: ## Compile TypeScript to dist/
	npm run build

test: ## Install deps and run the full unit + integration suite
	npm ci
	npm test

test-coverage: ## Run tests with a coverage report
	npm run test:coverage

typecheck: ## Type-check without emitting
	npm run typecheck

dev: ## Run in watch mode (tsx)
	npm run dev

run: build ## Build then start the compiled server
	npm start

docker-build: ## Build the Docker image
	docker build -t $(IMAGE) .

docker-run: docker-build ## Build and run the container end-to-end
	docker run --rm -p $(PORT):3000 -v url_shortener_data:/data $(IMAGE)

compose-up: ## Bring the service up via docker compose
	docker compose up --build

clean: ## Remove build output, deps and local data
	rm -rf dist node_modules coverage data
