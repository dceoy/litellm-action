#!/usr/bin/env bash

set -euox pipefail

cd "$(git rev-parse --show-toplevel)"

# TypeScript
pnpm install --no-frozen-lockfile
pnpm run build
pnpm run format
pnpm run audit:fix
pnpm run lint:fix
pnpm run typecheck
pnpm run test

# Shell
git ls-files -z -- '*.sh' '*.bash' '*.bats' | xargs -0 -t shellcheck

# YAML
git ls-files -z -- '*.yml' '*.yaml' | xargs -0 -t yamllint -d '{"extends": "relaxed", "rules": {"line-length": "disable"}}'

# GitHub Actions
zizmor --fix=safe .github/workflows
git ls-files -z -- '.github/workflows/*.yml' '.github/workflows/*.yaml' | xargs -0 -t actionlint
checkov --framework=all --output=github_failed_only --directory=.
trivy filesystem --scanners vuln,secret,misconfig --skip-dirs node_modules --skip-dirs .git .
