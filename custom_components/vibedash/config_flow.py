"""Config flow for VibeDash."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.selector import selector

from .const import (
    CONF_AI_TASK_ENTRY,
    CONF_STREAMING_API_KEY,
    CONF_STREAMING_BASE_URL,
    CONF_STREAMING_MODEL,
    CONF_STREAMING_PROVIDER,
    DEFAULT_BASE_URLS,
    DEFAULT_MODELS,
    DOMAIN,
    STREAMING_PROVIDER_NONE,
    STREAMING_PROVIDER_OLLAMA,
    STREAMING_PROVIDERS,
)


def _streaming_schema(
    provider: str = STREAMING_PROVIDER_NONE,
    api_key: str = "",
    model: str = "",
    base_url: str = "",
) -> vol.Schema:
    """Build the schema for the streaming configuration step."""
    provider_options = [
        {"value": k, "label": v} for k, v in STREAMING_PROVIDERS.items()
    ]

    schema: dict[vol.Marker, Any] = {
        vol.Required(CONF_STREAMING_PROVIDER, default=provider): selector(
            {"select": {"options": provider_options, "mode": "dropdown"}}
        ),
    }

    # Only show additional fields when a provider is selected
    if provider != STREAMING_PROVIDER_NONE:
        # Ollama doesn't need an API key
        if provider != STREAMING_PROVIDER_OLLAMA:
            schema[vol.Required(CONF_STREAMING_API_KEY, default=api_key)] = str

        schema[
            vol.Optional(
                CONF_STREAMING_MODEL,
                default=model or DEFAULT_MODELS.get(provider, ""),
            )
        ] = str
        schema[
            vol.Optional(
                CONF_STREAMING_BASE_URL,
                default=base_url or DEFAULT_BASE_URLS.get(provider, ""),
            )
        ] = str

    return vol.Schema(schema)


class VibeDashConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for VibeDash."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._data: dict[str, Any] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> VibeDashOptionsFlow:
        """Return the options flow handler."""
        return VibeDashOptionsFlow(config_entry)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step — select AI Task provider."""
        # Only allow a single instance
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_streaming()

        # Find available AI Task entities
        ai_task_entities = self.hass.states.async_entity_ids("ai_task")
        if not ai_task_entities:
            return self.async_abort(reason="no_ai_task")

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_AI_TASK_ENTRY): selector(
                        {"entity": {"domain": "ai_task"}}
                    ),
                }
            ),
        )

    async def async_step_streaming(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the optional streaming provider configuration."""
        errors: dict[str, str] = {}

        if user_input is not None:
            provider = user_input.get(CONF_STREAMING_PROVIDER, STREAMING_PROVIDER_NONE)

            if provider == STREAMING_PROVIDER_NONE:
                # No streaming — just save and finish
                self._data[CONF_STREAMING_PROVIDER] = STREAMING_PROVIDER_NONE
                return self.async_create_entry(title="VibeDash", data=self._data)

            # If provider selected but more fields needed, show expanded form
            if (
                CONF_STREAMING_API_KEY not in user_input
                and provider != STREAMING_PROVIDER_OLLAMA
            ):
                return self.async_show_form(
                    step_id="streaming",
                    data_schema=_streaming_schema(provider=provider),
                    errors=errors,
                )

            # Validate the streaming configuration
            from .streaming import validate_provider

            api_key = user_input.get(CONF_STREAMING_API_KEY, "")
            model = user_input.get(CONF_STREAMING_MODEL)
            base_url = user_input.get(CONF_STREAMING_BASE_URL)

            valid, error_msg = await validate_provider(
                provider, api_key, model=model, base_url=base_url
            )

            if not valid:
                errors["base"] = "streaming_validation_failed"
                return self.async_show_form(
                    step_id="streaming",
                    data_schema=_streaming_schema(
                        provider=provider,
                        api_key=api_key,
                        model=model or "",
                        base_url=base_url or "",
                    ),
                    errors=errors,
                    description_placeholders={"error_detail": error_msg},
                )

            self._data.update(user_input)
            return self.async_create_entry(title="VibeDash", data=self._data)

        return self.async_show_form(
            step_id="streaming",
            data_schema=_streaming_schema(),
            errors=errors,
        )


class VibeDashOptionsFlow(OptionsFlow):
    """Handle VibeDash options (e.g. switching the AI Task provider)."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the options — AI Task provider selection."""
        if user_input is not None:
            return await self.async_step_streaming(user_input=None)

        current = self._config_entry.data.get(
            CONF_AI_TASK_ENTRY
        ) or self._config_entry.options.get(CONF_AI_TASK_ENTRY)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_AI_TASK_ENTRY, default=current): selector(
                        {"entity": {"domain": "ai_task"}}
                    ),
                }
            ),
        )

    async def async_step_streaming(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage streaming provider options."""
        errors: dict[str, str] = {}

        # Get current values from entry data/options
        current_data = {**self._config_entry.data, **self._config_entry.options}

        if user_input is not None:
            provider = user_input.get(CONF_STREAMING_PROVIDER, STREAMING_PROVIDER_NONE)

            if provider == STREAMING_PROVIDER_NONE:
                # Clear streaming config
                result_data = {
                    CONF_AI_TASK_ENTRY: current_data.get(CONF_AI_TASK_ENTRY),
                    CONF_STREAMING_PROVIDER: STREAMING_PROVIDER_NONE,
                }
                return self.async_create_entry(title="", data=result_data)

            # If provider selected but more fields needed, show expanded form
            if (
                CONF_STREAMING_API_KEY not in user_input
                and provider != STREAMING_PROVIDER_OLLAMA
            ):
                return self.async_show_form(
                    step_id="streaming",
                    data_schema=_streaming_schema(provider=provider),
                    errors=errors,
                )

            # Validate
            from .streaming import validate_provider

            api_key = user_input.get(CONF_STREAMING_API_KEY, "")
            model = user_input.get(CONF_STREAMING_MODEL)
            base_url = user_input.get(CONF_STREAMING_BASE_URL)

            valid, error_msg = await validate_provider(
                provider, api_key, model=model, base_url=base_url
            )

            if not valid:
                errors["base"] = "streaming_validation_failed"
                return self.async_show_form(
                    step_id="streaming",
                    data_schema=_streaming_schema(
                        provider=provider,
                        api_key=api_key,
                        model=model or "",
                        base_url=base_url or "",
                    ),
                    errors=errors,
                    description_placeholders={"error_detail": error_msg},
                )

            result_data = {
                CONF_AI_TASK_ENTRY: current_data.get(CONF_AI_TASK_ENTRY),
                **user_input,
            }
            return self.async_create_entry(title="", data=result_data)

        # Show form with current values
        return self.async_show_form(
            step_id="streaming",
            data_schema=_streaming_schema(
                provider=current_data.get(
                    CONF_STREAMING_PROVIDER, STREAMING_PROVIDER_NONE
                ),
                api_key=current_data.get(CONF_STREAMING_API_KEY, ""),
                model=current_data.get(CONF_STREAMING_MODEL, ""),
                base_url=current_data.get(CONF_STREAMING_BASE_URL, ""),
            ),
            errors=errors,
        )
