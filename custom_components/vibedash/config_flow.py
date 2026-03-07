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
    PROVIDER_AI_TASK,
    STREAMING_PROVIDER_NONE,
    STREAMING_PROVIDER_OLLAMA,
    STREAMING_PROVIDERS,
)


def _provider_schema(
    provider: str = PROVIDER_AI_TASK,
    ai_task_entry: str = "",
    api_key: str = "",
    model: str = "",
    base_url: str = "",
) -> vol.Schema:
    """Build the schema for the unified provider configuration step."""
    provider_options = [
        {"value": k, "label": v} for k, v in STREAMING_PROVIDERS.items()
    ]

    schema: dict[vol.Marker, Any] = {
        vol.Required(CONF_STREAMING_PROVIDER, default=provider): selector(
            {"select": {"options": provider_options, "mode": "dropdown"}}
        ),
    }

    if provider == PROVIDER_AI_TASK:
        # Show AI Task entity picker
        schema[vol.Required(CONF_AI_TASK_ENTRY, default=ai_task_entry)] = selector(
            {"entity": {"domain": "ai_task"}}
        )
    else:
        # Show streaming provider fields
        if provider != STREAMING_PROVIDER_OLLAMA:
            schema[vol.Required(CONF_STREAMING_API_KEY, default=api_key)] = selector(
                {"text": {"type": "password"}}
            )

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
        """Handle provider configuration in a single step."""
        # Only allow a single instance
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        errors: dict[str, str] = {}

        if user_input is not None:
            provider = user_input.get(CONF_STREAMING_PROVIDER, PROVIDER_AI_TASK)

            if provider == PROVIDER_AI_TASK:
                # AI Task path — need entity picker
                if CONF_AI_TASK_ENTRY not in user_input:
                    # Re-render with AI Task entity picker
                    return self.async_show_form(
                        step_id="user",
                        data_schema=_provider_schema(provider=PROVIDER_AI_TASK),
                        errors=errors,
                    )

                # Validate that an entity was selected
                self._data.update(user_input)
                self._data[CONF_STREAMING_PROVIDER] = PROVIDER_AI_TASK
                return self.async_create_entry(title="VibeDash", data=self._data)

            # Streaming provider path
            if (
                CONF_STREAMING_API_KEY not in user_input
                and provider != STREAMING_PROVIDER_OLLAMA
            ):
                # Re-render with streaming fields
                return self.async_show_form(
                    step_id="user",
                    data_schema=_provider_schema(provider=provider),
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
                    step_id="user",
                    data_schema=_provider_schema(
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

        # Initial render — show provider dropdown only (defaults to AI Task)
        return self.async_show_form(
            step_id="user",
            data_schema=_provider_schema(),
            errors=errors,
        )


class VibeDashOptionsFlow(OptionsFlow):
    """Handle VibeDash options."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage all options in a single step."""
        errors: dict[str, str] = {}

        # Get current values from entry data/options
        current_data = {**self._config_entry.data, **self._config_entry.options}

        # Treat legacy "none" as "ai_task"
        current_provider = current_data.get(CONF_STREAMING_PROVIDER, PROVIDER_AI_TASK)
        if current_provider == STREAMING_PROVIDER_NONE:
            current_provider = PROVIDER_AI_TASK

        if user_input is not None:
            provider = user_input.get(CONF_STREAMING_PROVIDER, PROVIDER_AI_TASK)

            if provider == PROVIDER_AI_TASK:
                if CONF_AI_TASK_ENTRY not in user_input:
                    return self.async_show_form(
                        step_id="init",
                        data_schema=_provider_schema(
                            provider=PROVIDER_AI_TASK,
                            ai_task_entry=current_data.get(CONF_AI_TASK_ENTRY, ""),
                        ),
                        errors=errors,
                    )

                result_data = {
                    CONF_STREAMING_PROVIDER: PROVIDER_AI_TASK,
                    CONF_AI_TASK_ENTRY: user_input[CONF_AI_TASK_ENTRY],
                }
                return self.async_create_entry(title="", data=result_data)

            # Streaming provider path
            if (
                CONF_STREAMING_API_KEY not in user_input
                and provider != STREAMING_PROVIDER_OLLAMA
            ):
                return self.async_show_form(
                    step_id="init",
                    data_schema=_provider_schema(
                        provider=provider,
                        api_key=current_data.get(CONF_STREAMING_API_KEY, ""),
                        model=current_data.get(CONF_STREAMING_MODEL, ""),
                        base_url=current_data.get(CONF_STREAMING_BASE_URL, ""),
                    ),
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
                    step_id="init",
                    data_schema=_provider_schema(
                        provider=provider,
                        api_key=api_key,
                        model=model or "",
                        base_url=base_url or "",
                    ),
                    errors=errors,
                    description_placeholders={"error_detail": error_msg},
                )

            result_data = {
                CONF_STREAMING_PROVIDER: provider,
                CONF_STREAMING_API_KEY: api_key,
                CONF_STREAMING_MODEL: model or "",
                CONF_STREAMING_BASE_URL: base_url or "",
            }
            return self.async_create_entry(title="", data=result_data)

        # Show form with current values
        return self.async_show_form(
            step_id="init",
            data_schema=_provider_schema(
                provider=current_provider,
                ai_task_entry=current_data.get(CONF_AI_TASK_ENTRY, ""),
                api_key=current_data.get(CONF_STREAMING_API_KEY, ""),
                model=current_data.get(CONF_STREAMING_MODEL, ""),
                base_url=current_data.get(CONF_STREAMING_BASE_URL, ""),
            ),
            errors=errors,
        )
