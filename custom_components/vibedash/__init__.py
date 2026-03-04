"""VibeDash - LLM-powered dashboard for Home Assistant."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_FRONTEND_PATH, PANEL_ICON, PANEL_TITLE, PANEL_URL
from .entity_cache import VibeDashEntityCache
from .websocket_api import async_register_commands

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up VibeDash from YAML (not used, config flow only)."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up VibeDash from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Initialize entity cache
    entity_cache = VibeDashEntityCache(hass)
    await entity_cache.async_initialize()
    hass.data[DOMAIN]["entity_cache"] = entity_cache

    # Register WebSocket API commands
    async_register_commands(hass)

    # Register frontend panel
    frontend_path = str(FRONTEND_DIR)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"/{PANEL_FRONTEND_PATH}", frontend_path, cache_headers=True)]
    )

    frontend.async_register_built_in_panel(
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL.lstrip("/"),
        config={
            "_panel_custom": {
                "name": "vibedash-panel",
                "module_url": f"/{PANEL_FRONTEND_PATH}/vibedash-panel.js",
                "embed_iframe": False,
            }
        },
        require_admin=False,
    )

    _LOGGER.info("VibeDash panel registered at %s", PANEL_URL)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload VibeDash config entry."""
    # Clean up entity cache
    entity_cache = hass.data[DOMAIN].get("entity_cache")
    if entity_cache:
        entity_cache.cleanup()

    # Remove panel
    frontend.async_remove_panel(PANEL_URL.lstrip("/"))

    hass.data.pop(DOMAIN, None)
    return True
