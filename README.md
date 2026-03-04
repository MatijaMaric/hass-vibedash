# VibeDash

LLM-powered dashboard for Home Assistant. Describe what you want to see in natural language, and AI generates interactive charts, metrics, and insights from your smart home data.

## Features

- **Natural language prompts** - "Show me temperature trends for the last 24 hours", "Battery levels for all devices", etc.
- **Two-pass AI** - Smart entity selection followed by dashboard generation for accurate results even in large installations
- **Multiple card types** - Charts (line/bar), metrics, gauges, entity lists, and markdown analysis
- **Real-time updates** - Metric and gauge cards update live as entity states change
- **Any AI provider** - Works with any Home Assistant AI Task integration (OpenAI, Google, Anthropic, Ollama, etc.)
- **Entity awareness** - Caches and indexes all your entities with rich metadata (areas, devices, device classes, units)

## Requirements

- Home Assistant 2025.3 or later
- An [AI Task](https://www.home-assistant.io/integrations/ai_task/) integration configured (e.g., OpenAI, Google AI, Anthropic, Ollama)

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant
2. Click the three dots menu → **Custom repositories**
3. Add `https://github.com/MatijaMaric/hass-vibedash` as an **Integration**
4. Search for "VibeDash" and install
5. Restart Home Assistant

### Manual

1. Copy the `custom_components/vibedash` folder to your `config/custom_components/` directory
2. Restart Home Assistant

## Setup

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **VibeDash**
3. Select your AI Task provider
4. VibeDash will appear in the sidebar

## How It Works

1. You type a natural language prompt describing what dashboard you want
2. VibeDash pre-filters your entity catalog by keyword matching
3. **Pass 1**: The AI selects the most relevant entities from the filtered list
4. **Pass 2**: The AI generates a dashboard layout using detailed entity context
5. The frontend renders interactive cards with live data and historical charts

## Card Types

| Type | Description |
|------|-------------|
| **Chart** | Time-series line or bar chart with configurable time ranges (1h - 30d) |
| **Metric** | Big number display showing current entity value |
| **Gauge** | Circular gauge for bounded values (battery, humidity, etc.) |
| **Entity List** | Table showing multiple entities with current states |
| **Markdown** | AI-generated analysis and insights |
