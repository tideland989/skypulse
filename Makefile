SHELL := /bin/bash

.PHONY: help conform conform-python conform-node clean

help:
	@echo "Targets:"
	@echo "  make conform          # run conformance against Python, then Node"
	@echo "  make conform-python   # start Python, run conformance, stop"
	@echo "  make conform-node     # start Node, run conformance, stop"
	@echo "  make clean            # kill stray servers, remove local DBs and logs"

# Run sequentially because both backends bind :3000.
conform: conform-python conform-node

conform-python:
	@./scripts/run-conformance.sh python

conform-node:
	@./scripts/run-conformance.sh node

clean:
	-@pkill -f 'tsx watch' 2>/dev/null || true
	-@pkill -f 'node dist/server.js' 2>/dev/null || true
	-@pkill -f 'python app.py' 2>/dev/null || true
	-@rm -f /tmp/skypulse-*.log
	-@rm -f src/skypulse.db src/skypulse.db-shm src/skypulse.db-wal
	-@rm -f original/skypulse.db original/skypulse.db-shm original/skypulse.db-wal
