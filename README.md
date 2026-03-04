# litellm-action

GitHub Action to install and run a local
[LiteLLM](https://docs.litellm.ai/) proxy server in a workflow job.

[![CI](https://github.com/dceoy/litellm-action/actions/workflows/ci.yml/badge.svg)](https://github.com/dceoy/litellm-action/actions/workflows/ci.yml)

## Usage

### Quick start with a single model

```yaml
steps:
  - uses: dceoy/litellm-action@v0
    env:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    with:
      model: gemini/gemini-3.1-pro-preview
  - run: |
      curl http://localhost:4000/v1/chat/completions \
        -H "Content-Type: application/json" \
        -d '{"model": "gemini-3.1-pro-preview", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Using a config file

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: dceoy/litellm-action@v0
    env:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    with:
      config-path: litellm-config.yaml
```

### Inline configuration

```yaml
steps:
  - uses: dceoy/litellm-action@v0
    env:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    with:
      config: |
        model_list:
          - model_name: gemini-3.1-pro-preview
            litellm_params:
              model: gemini/gemini-3.1-pro-preview
              api_key: os.environ/GEMINI_API_KEY
          - model_name: gemini-3-flash-preview
            litellm_params:
              model: gemini/gemini-3-flash-preview
              api_key: os.environ/GEMINI_API_KEY
      port: '8080'
```

## Behavior

This action currently does the following:

1. Installs `litellm[proxy]` with `pip` (`version` is optional).
2. Resolves configuration:
   - Uses `config-path` when provided.
   - Otherwise, when `config` is set, writes it to a temporary YAML file.
   - Adds `--model <value>` when `model` is set.
3. Starts `litellm` in the background and saves `pid` + log file path as action
   state.
4. Polls `http://localhost:<port>/health/readiness` every 2 seconds until
   ready or timeout.
5. Exposes `base-url` and `pid` outputs.
6. In the post step, terminates the spawned process and prints proxy logs.

## Inputs

| Input              | Description                                                                                                                                      | Required | Default |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- |
| `version`          | LiteLLM version to install (e.g., `1.55.0`). Empty means latest `litellm[proxy]`.                                                                | No       | `''`    |
| `config-path`      | Path to a LiteLLM `config.yaml` file. When set, this takes precedence over `config`.                                                             | No       | `''`    |
| `config`           | Inline LiteLLM configuration (YAML string). Used only when `config-path` is not set.                                                             | No       | `''`    |
| `model`            | Model passed as `--model` (e.g., `gemini/gemini-3.1-pro-preview`).                                                                               | No       | `''`    |
| `port`             | Port passed as `--port`.                                                                                                                         | No       | `4000`  |
| `log-level`        | Sets `LITELLM_LOG`. If set to `DEBUG`, also adds `--detailed_debug`.                                                                             | No       | `INFO`  |
| `api-key`          | Master API key for the proxy. Sets `LITELLM_MASTER_KEY`.                                                                                         | No       | `''`    |
| `timeout`          | Timeout in seconds to wait for readiness at `/health/readiness`.                                                                                 | No       | `120`   |
| `extra-args`       | Additional CLI arguments for `litellm`, split on whitespace and appended as-is.                                                                  | No       | `''`    |
| `pip-install-args` | Extra arguments for `pip install`, split on whitespace and appended after `litellm[proxy]` or `litellm[proxy]==<version>` (for example indexes). | No       | `''`    |

## Outputs

| Output     | Description                                  |
| ---------- | -------------------------------------------- |
| `base-url` | Base URL of the running LiteLLM proxy server |
| `pid`      | Process ID of the LiteLLM proxy server       |

## Development

### Project layout

- `src/main.ts`: main entrypoint, calls `run()`.
- `src/run.ts`: input handling, installation, process spawn, readiness wait, and
  outputs.
- `src/post.ts`: post entrypoint, calls `cleanup()`.
- `src/cleanup.ts`: process termination and log printing.
- `src/wait-for-ready.ts`: readiness polling helper.
- `src/__tests__/*.test.ts`: Jest unit tests.

### Local commands

```bash
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

`dist/main` and `dist/post` are generated with `@vercel/ncc` and should stay in
sync with source changes.

## License

[AGPL-3.0](LICENSE)
