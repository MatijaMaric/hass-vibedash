"""Constants for VibeDash."""

DOMAIN = "vibedash"

CONF_AI_TASK_ENTRY = "ai_task_entry"

STORAGE_KEY = "vibedash_entity_cache"
STORAGE_VERSION = 1

PANEL_URL = "/vibedash"
PANEL_TITLE = "VibeDash"
PANEL_ICON = "mdi:creation"
PANEL_FRONTEND_PATH = "vibedash_frontend"

# Card types the LLM can generate
CARD_TYPES = ["chart", "metric", "gauge", "entity_list", "markdown"]

# Time ranges supported for charts
TIME_RANGES = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 168,
    "30d": 720,
}
