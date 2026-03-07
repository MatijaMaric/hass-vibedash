"""Constants for VibeDash."""

DOMAIN = "vibedash"

CONF_AI_TASK_ENTRY = "ai_task_entry"

# Streaming provider configuration
CONF_STREAMING_PROVIDER = "streaming_provider"
CONF_STREAMING_API_KEY = "streaming_api_key"
CONF_STREAMING_MODEL = "streaming_model"
CONF_STREAMING_BASE_URL = "streaming_base_url"

PROVIDER_AI_TASK = "ai_task"
STREAMING_PROVIDER_NONE = "none"  # backward compat only
STREAMING_PROVIDER_OPENAI = "openai"
STREAMING_PROVIDER_ANTHROPIC = "anthropic"
STREAMING_PROVIDER_GEMINI = "gemini"
STREAMING_PROVIDER_OLLAMA = "ollama"
STREAMING_PROVIDER_OPENROUTER = "openrouter"

STREAMING_PROVIDERS = {
    PROVIDER_AI_TASK: "AI Task (Home Assistant)",
    STREAMING_PROVIDER_OPENAI: "OpenAI",
    STREAMING_PROVIDER_ANTHROPIC: "Anthropic",
    STREAMING_PROVIDER_GEMINI: "Google Gemini",
    STREAMING_PROVIDER_OLLAMA: "Ollama (local)",
    STREAMING_PROVIDER_OPENROUTER: "OpenRouter",
}

# Default models per provider
DEFAULT_MODELS = {
    STREAMING_PROVIDER_OPENAI: "gpt-4o",
    STREAMING_PROVIDER_ANTHROPIC: "claude-sonnet-4-20250514",
    STREAMING_PROVIDER_GEMINI: "gemini-2.0-flash",
    STREAMING_PROVIDER_OLLAMA: "llama3.1",
    STREAMING_PROVIDER_OPENROUTER: "anthropic/claude-sonnet-4",
}

# Default base URLs per provider
DEFAULT_BASE_URLS = {
    STREAMING_PROVIDER_OPENAI: "https://api.openai.com/v1",
    STREAMING_PROVIDER_ANTHROPIC: "https://api.anthropic.com",
    STREAMING_PROVIDER_GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    STREAMING_PROVIDER_OLLAMA: "http://localhost:11434",
    STREAMING_PROVIDER_OPENROUTER: "https://openrouter.ai/api/v1",
}

STORAGE_KEY = "vibedash_entity_cache"
STORAGE_VERSION = 1

DASHBOARDS_STORAGE_KEY = "vibedash_dashboards"
DASHBOARDS_STORAGE_VERSION = 1

PANEL_URL = "/vibedash"
PANEL_TITLE = "VibeDash"
PANEL_ICON = "mdi:creation"
PANEL_FRONTEND_PATH = "vibedash_frontend"

# Component types the LLM can generate (json-render spec format)
COMPONENT_TYPES = ["HAChart", "HAMetric", "HAGauge", "HAEntityList", "HAMarkdown"]

# Time ranges supported for charts
TIME_RANGES = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 168,
    "30d": 720,
}
