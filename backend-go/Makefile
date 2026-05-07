.PHONY: build run clean test help

BINARY_NAME=server
MAIN_PATH=cmd/server/main.go

help: ## Show this help message
	@echo 'Usage:'
	@echo '  make <target>'
	@echo ''
	@echo 'Targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the Go binary
	go build -o $(BINARY_NAME) $(MAIN_PATH)

build-linux: ## Build the Go binary for Linux AMD64
	GOOS=linux GOARCH=amd64 go build -o $(BINARY_NAME)-linux $(MAIN_PATH)

run: build ## Build and run the server
	./$(BINARY_NAME)

clean: ## Remove the binary and temporary files
	rm -f $(BINARY_NAME)
	rm -f $(BINARY_NAME)-linux
	rm -f server.log

test: ## Run tests
	go test ./... -v
