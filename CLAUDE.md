# VibeDash - Claude Code Guide

## Project Overview

VibeDash is a Home Assistant custom integration that generates LLM-powered dashboards from natural language prompts. Users describe what they want to see and the AI generates interactive charts, metrics, and insights from smart home data.

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `custom_components/vibedash/__init__.py` | Integration setup/teardown, registers frontend panel |
| `custom_components/vibedash/websocket_api.py` | WebSocket commands for HA frontend communication |
| `custom_components/vibedash/entity_cache.py` | Entity knowledge cache with domain/area indexing |
| `custom_components/vibedash/config_flow.py` | UI config flow for selecting AI Task provider |
| `custom_components/vibedash/const.py` | Domain constants, card types, time ranges |
| `custom_components/vibedash/frontend/vibedash-panel.js` | Single-file frontend panel (vanilla JS) |
| `custom_components/vibedash/manifest.json` | HACS/HA integration manifest |

### Two-Pass LLM Flow

1. **Entity pre-filter** — keyword matching narrows entities by domain/area from the prompt
2. **Pass 1 (entity selection)** — LLM picks the most relevant entity IDs (≤20) from the filtered list
3. **Pass 2 (dashboard generation)** — LLM generates full dashboard JSON using detailed entity context
4. **Frontend render** — JS panel renders cards (chart/metric/gauge/entity_list/markdown)

### WebSocket Commands

- `vibedash/generate` — triggers the two-pass LLM pipeline, returns `{ dashboard }`
- `vibedash/history` — fetches recorder history for chart entities
- `vibedash/entities` — returns the full entity catalog cache

### Card Types

`chart` | `metric` | `gauge` | `entity_list` | `markdown`

### Supported Time Ranges

`1h` | `6h` | `24h` | `7d` | `30d`

## Development

### Requirements

- Home Assistant 2025.3+
- An AI Task integration configured (OpenAI, Anthropic, Ollama, etc.)
- No additional Python dependencies beyond what HA provides

### Linting

```bash
ruff check custom_components/vibedash/
ruff format --check custom_components/vibedash/
```

### Releasing

Use the `release.ps1` script to automate version bumping and tag creation:

```powershell
.\release.ps1 patch    # 0.0.15 → 0.0.16
.\release.ps1 minor    # 0.0.15 → 0.1.0
.\release.ps1 major    # 0.0.15 → 1.0.0
```

The script will:
1. Update version in both `custom_components/vibedash/manifest.json` and `frontend/package.json`
2. Create a commit with conventional commit message: `chore: bump version to X.Y.Z`
3. Create an annotated git tag: `vX.Y.Z`
4. Push both the commit and tag to origin

The GitHub Actions `release.yml` workflow then verifies the manifest version matches the tag and creates a GitHub Release.

## Key Conventions

- **No test suite** — this is a HA custom component; testing requires a running HA instance
- **Single config entry** — only one VibeDash instance allowed per HA installation (`async_set_unique_id(DOMAIN)`)
- **Entity cache** — rebuilt on startup and on `EVENT_ENTITY_REGISTRY_UPDATED`; persisted via HA storage
- **Frontend** — single vanilla JS file, no build step required; served as a static HA panel
- **AI agnostic** — delegates all LLM calls to HA's `ai_task.generate_data` service, works with any configured AI Task provider
- **Conventional commits** — all commits follow the [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat:`, `fix:`, `chore:`, etc.)
