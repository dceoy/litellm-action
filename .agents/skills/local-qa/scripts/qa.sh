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

# Semgrep static analysis (same rule set as gha-for-devops).
if [[ -n "$(git ls-files -- '*.py' '*.go' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.ts' '*.tsx' '*.mts' '*.cts')" ]]; then
  uvx semgrep scan --x-parmap --jobs 2 --config p/default \
    --exclude-rule package_managers.bun.bun-missing-minimum-release-age.bun-missing-minimum-release-age \
    --exclude-rule package_managers.dependabot.dependabot-missing-cooldown.dependabot-missing-cooldown \
    --exclude-rule package_managers.npm.npm-missing-minimum-release-age.npm-missing-minimum-release-age \
    --exclude-rule package_managers.pnpm.pnpm-missing-minimum-release-age.pnpm-minimum-release-age \
    --exclude-rule package_managers.poetry.poetry-missing-solver-min-release-age.poetry-missing-solver-min-release-age \
    --exclude-rule package_managers.renovate.renovate-missing-minimum-release-age.renovate-missing-minimum-release-age \
    --exclude-rule package_managers.ruby.bundler-gemfile-missing-cooldown.bundler-gemfile-missing-cooldown \
    --exclude-rule package_managers.uv.uv-missing-dependency-cooldown.uv-missing-dependency-cooldown \
    --exclude-rule package_managers.yarn.yarn-missing-minimal-age-gate.yarn-missing-minimal-age-gate \
    --metrics off --error .
fi
