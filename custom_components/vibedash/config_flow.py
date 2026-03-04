"""Config flow for VibeDash."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.selector import selector

from .const import CONF_AI_TASK_ENTRY, DOMAIN


class VibeDashConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for VibeDash."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        # Only allow a single instance
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        errors: dict[str, str] = {}

        if user_input is not None:
            return self.async_create_entry(
                title="VibeDash",
                data=user_input,
            )

        # Find available AI Task entities (registered by providers like OpenAI, Ollama, etc.)
        ai_task_entities = self.hass.states.async_entity_ids("ai_task")
        if not ai_task_entities:
            return self.async_abort(reason="no_ai_task")

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_AI_TASK_ENTRY): selector(
                        {
                            "entity": {
                                "domain": "ai_task",
                            }
                        }
                    ),
                }
            ),
            errors=errors,
        )
