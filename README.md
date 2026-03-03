# litellm-action

GitHub Action to run [LiteLLM](https://docs.litellm.ai/) proxy server.

## Usage

### Quick start with a single model

```yaml
steps:
  - uses: dceoy/litellm-action@v0
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    with:
      model: openai/gpt-4o
  - run: |
      curl http://localhost:4000/v1/chat/completions \
        -H "Content-Type: application/json" \
        -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Using a config file

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: dceoy/litellm-action@v0
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    with:
      config-path: litellm-config.yaml
```

### Inline configuration

```yaml
steps:
  - uses: dceoy/litellm-action@v0
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    with:
      config: |
        model_list:
          - model_name: gpt-4o
            litellm_params:
              model: openai/gpt-4o
          - model_name: gpt-4o-mini
            litellm_params:
              model: openai/gpt-4o-mini
      port: '8080'
```

## Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `version` | LiteLLM version to install (e.g., `1.55.0`) | No | Latest |
| `config-path` | Path to a LiteLLM `config.yaml` file | No | |
| `config` | Inline LiteLLM configuration (YAML string) | No | |
| `model` | Model to use for quick start (e.g., `openai/gpt-4o`) | No | |
| `port` | Port for the proxy server | No | `4000` |
| `log-level` | Log level (e.g., `INFO`, `DEBUG`) | No | `INFO` |
| `api-key` | Master API key for the proxy | No | |
| `timeout` | Timeout in seconds to wait for server readiness | No | `120` |
| `extra-args` | Additional CLI arguments for litellm | No | |
| `pip-install-args` | Additional pip install arguments | No | |

## Outputs

| Output | Description |
|---|---|
| `base-url` | Base URL of the running LiteLLM proxy server |
| `pid` | Process ID of the LiteLLM proxy server |

## License

[AGPL-3.0](LICENSE)
