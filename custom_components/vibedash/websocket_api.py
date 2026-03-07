"""WebSocket API for VibeDash."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import (
    CONF_AI_TASK_ENTRY,
    CONF_STREAMING_API_KEY,
    CONF_STREAMING_BASE_URL,
    CONF_STREAMING_MODEL,
    CONF_STREAMING_PROVIDER,
    DOMAIN,
    PROVIDER_AI_TASK,
    STREAMING_PROVIDER_NONE,
    TIME_RANGES,
)

_LOGGER = logging.getLogger(__name__)

ENTITY_SELECTION_PROMPT = """\
You are a Home Assistant entity selector. Given a user's dashboard request, \
select the most relevant entities from the available list.

{entity_context}

User request: {prompt}

Guidelines:
- Select entities that would be useful for creating a rich dashboard visualization
- Include entities from diverse categories (climate, power, sensors, batteries, etc.) \
for a well-rounded dashboard
- If the request mentions a room/area, select all relevant entities for that area
- Prefer entities that have numeric states (sensors) over binary or text entities
- Include related entities (e.g., if selecting a temperature sensor, also include \
the humidity sensor from the same device/area)
- Limit to 30 most relevant entities

Return a JSON object with a single key "entity_ids" containing an array of \
entity_id strings. Only include entities from the available list above.

Return ONLY valid JSON, no other text."""

DASHBOARD_GENERATION_PROMPT = """\
You are a Home Assistant dashboard generator. Create a visually rich, \
multi-column dashboard layout as a json-render spec based on the user's request.

{entity_details}

Available component types:

Data components:
- "HAMiniGraph": Compact card with current value + sparkline trend. \
Props: title (string), entity (single entity_id), \
timeRange ("1h"|"6h"|"24h"|"7d"|"30d", default "24h"). \
DEFAULT card for individual sensors (temperature, humidity, power, energy, etc.)
- "HAChart": Full time-series chart for comparing multiple entities on one axis. \
Props: title (string), chartType ("line"|"bar"|"area"), \
entities (array of entity_ids, max 10), timeRange ("1h"|"6h"|"24h"|"7d"|"30d"). \
Use ONLY when comparing 2+ related entities together.
- "HAMetric": Single big number without trend. Props: title (string), entity (single entity_id). \
Use for non-numeric or rarely changing values.
- "HAGauge": Semicircle gauge. Props: title (string), entity (single entity_id), \
min (number), max (number). Use for bounded percentages (battery, humidity).
- "HAEntityList": Compact list of entities. Props: title (string), \
entities (array of entity_ids), timeRange (optional). \
Use for groups of similar entities (batteries, lights, doors).
- "HAMarkdown": Text/analysis card. Props: title (string), content (markdown string).

Layout components:
- "Grid": CSS grid container. Props: columns (number, 1-6), gap ("sm"|"md"|"lg"). \
Children: array of element IDs.
- "GridItem": Column-span wrapper for Grid children. Props: span (number, 1-6). \
Children: array of element IDs. Use inside Grid to make a child span multiple columns. \
Example: in a 3-column Grid, span=3 for full-width, span=2 for two-thirds width.
- "Masonry": Masonry layout where cards of different heights pack tightly (Pinterest-style). \
Props: columns (number, 2-4), gap ("sm"|"md"|"lg"). \
Children: array of element IDs (placed directly, no GridItem needed). \
Best for overview dashboards with many mixed-height cards.
- "Stack": Flex container. Props: direction ("horizontal"|"vertical"), \
gap ("none"|"sm"|"md"|"lg"). Children: array of element IDs.
- "Card": Card wrapper. Props: title (string, optional). Children: array of element IDs.
- "Heading": Section heading. Props: text (string), level (1-4).
- "Text": Body text. Props: text (string).

Layout strategy — choose the best approach for the content:

GRID + GRIDITEM (structured layouts with emphasis):
Use when you want precise control over card widths. Place cards in a Grid (typically \
columns=3 or columns=4) and wrap each child in GridItem with the appropriate span. \
Wide cards like HAChart or HAEntityList get span=2 or span=3. \
Compact cards like HAMiniGraph, HAMetric, HAGauge MUST use span=1 so that \
multiple cards appear side-by-side in a single row. NEVER place compact cards \
at full grid width — they should always share a row with other cards.

MASONRY (dense overview layouts):
Use when you have many cards of different heights and want them to pack tightly. \
Place cards directly as children of Masonry — no GridItem needed. \
Best for "show me everything" dashboards with lots of sensors.

MIX BOTH: Use Grid+GridItem for a hero section at the top (e.g., a full-width chart), \
then Masonry for the detail cards below.

Layout rules:
1. The ROOT element must be a Stack with direction="vertical" and gap="lg".
2. Group entities by category with level-2 Heading elements.
3. After each Heading, place cards in a Grid or Masonry layout.
4. VARY card sizes to create visual hierarchy — important data gets more space \
(e.g., a key chart at span=3 in a 3-column grid, while metrics are span=1).
5. EVERY row of GridItem children inside a Grid MUST have spans that add up to exactly \
the Grid's columns value. For example, in a 3-column Grid, valid rows are: \
[span=3], [span=2, span=1], [span=1, span=1, span=1]. \
Never leave a partially-filled row — widen one card in that row to fill it.
6. COMPACT CARD GRID RULE: When you have 3+ compact cards (HAMiniGraph, HAMetric, \
HAGauge), ALWAYS place them inside ONE Grid with columns=3 (or columns=4 if 4+ cards). \
Each compact card gets its own GridItem with span=1. Do NOT stack compact cards \
in separate full-width rows — group them together in a multi-column Grid.
7. HAMiniGraph is the DEFAULT for individual sensor entities.
8. Use HAChart ONLY for comparing 2+ related entities on one axis.
9. Use HAEntityList for groups of similar entities (batteries, lights).
10. Use HAGauge for bounded percentages when visual emphasis is needed.
11. Use HAMarkdown sparingly — only for brief summaries if the request implies analysis.
12. Create 10-30 total elements for a rich, informative dashboard.
13. Give each card a short, clear title (e.g., "Living Room Temp").

EXAMPLE — correct layout for 6 sensor entities in a category:
"grid_sensors": {{"type": "Grid", "props": {{"columns": 3, "gap": "md"}}, \
"children": ["gi_1", "gi_2", "gi_3", "gi_4", "gi_5", "gi_6"]}},
"gi_1": {{"type": "GridItem", "props": {{"span": 1}}, "children": ["mini_1"]}},
"gi_2": {{"type": "GridItem", "props": {{"span": 1}}, "children": ["mini_2"]}},
...
This produces 2 rows of 3 compact cards each.
WRONG: putting each HAMiniGraph in a span=3 GridItem (full width).
RIGHT: span=1 so 3 cards fit per row.

User request: {prompt}

Return ONLY a valid JSON object with "root" and "elements" keys. \
Each element has a unique string ID, "type", "props", and optional "children" array.
No other text, just the JSON."""

DASHBOARD_GENERATION_STREAMING_PROMPT = """\
You are a Home Assistant dashboard generator. Create a visually rich, \
multi-column dashboard layout using the SpecStream format (JSONL patches) \
based on the user's request.

{entity_details}

Available component types:

Data components:
- "HAMiniGraph": Compact card with current value + sparkline trend. \
Props: title (string), entity (single entity_id), \
timeRange ("1h"|"6h"|"24h"|"7d"|"30d", default "24h"). \
DEFAULT card for individual sensors (temperature, humidity, power, energy, etc.)
- "HAChart": Full time-series chart for comparing multiple entities on one axis. \
Props: title (string), chartType ("line"|"bar"|"area"), \
entities (array of entity_ids, max 10), timeRange ("1h"|"6h"|"24h"|"7d"|"30d"). \
Use ONLY when comparing 2+ related entities together.
- "HAMetric": Single big number without trend. Props: title (string), entity (single entity_id). \
Use for non-numeric or rarely changing values.
- "HAGauge": Semicircle gauge. Props: title (string), entity (single entity_id), \
min (number), max (number). Use for bounded percentages (battery, humidity).
- "HAEntityList": Compact list of entities. Props: title (string), \
entities (array of entity_ids), timeRange (optional). \
Use for groups of similar entities (batteries, lights, doors).
- "HAMarkdown": Text/analysis card. Props: title (string), content (markdown string).

Layout components:
- "Grid": CSS grid container. Props: columns (number, 1-6), gap ("sm"|"md"|"lg"). \
Children: array of element IDs.
- "GridItem": Column-span wrapper for Grid children. Props: span (number, 1-6). \
Children: array of element IDs. Use inside Grid to make a child span multiple columns. \
Example: in a 3-column Grid, span=3 for full-width, span=2 for two-thirds width.
- "Masonry": Masonry layout where cards of different heights pack tightly (Pinterest-style). \
Props: columns (number, 2-4), gap ("sm"|"md"|"lg"). \
Children: array of element IDs (placed directly, no GridItem needed). \
Best for overview dashboards with many mixed-height cards.
- "Stack": Flex container. Props: direction ("horizontal"|"vertical"), \
gap ("none"|"sm"|"md"|"lg"). Children: array of element IDs.
- "Card": Card wrapper. Props: title (string, optional). Children: array of element IDs.
- "Heading": Section heading. Props: text (string), level (1-4).
- "Text": Body text. Props: text (string).

Layout strategy — choose the best approach for the content:

GRID + GRIDITEM (structured layouts with emphasis):
Use when you want precise control over card widths. Place cards in a Grid (typically \
columns=3 or columns=4) and wrap each child in GridItem with the appropriate span. \
Wide cards like HAChart or HAEntityList get span=2 or span=3. \
Compact cards like HAMiniGraph, HAMetric, HAGauge MUST use span=1 so that \
multiple cards appear side-by-side in a single row. NEVER place compact cards \
at full grid width — they should always share a row with other cards.

MASONRY (dense overview layouts):
Use when you have many cards of different heights and want them to pack tightly. \
Place cards directly as children of Masonry — no GridItem needed. \
Best for "show me everything" dashboards with lots of sensors.

MIX BOTH: Use Grid+GridItem for a hero section at the top (e.g., a full-width chart), \
then Masonry for the detail cards below.

Layout rules:
1. The ROOT element must be a Stack with direction="vertical" and gap="lg".
2. Group entities by category with level-2 Heading elements.
3. After each Heading, place cards in a Grid or Masonry layout.
4. VARY card sizes to create visual hierarchy — important data gets more space \
(e.g., a key chart at span=3 in a 3-column grid, while metrics are span=1).
5. EVERY row of GridItem children inside a Grid MUST have spans that add up to exactly \
the Grid's columns value. For example, in a 3-column Grid, valid rows are: \
[span=3], [span=2, span=1], [span=1, span=1, span=1]. \
Never leave a partially-filled row — widen one card in that row to fill it.
6. COMPACT CARD GRID RULE: When you have 3+ compact cards (HAMiniGraph, HAMetric, \
HAGauge), ALWAYS place them inside ONE Grid with columns=3 (or columns=4 if 4+ cards). \
Each compact card gets its own GridItem with span=1. Do NOT stack compact cards \
in separate full-width rows — group them together in a multi-column Grid.
7. HAMiniGraph is the DEFAULT for individual sensor entities.
8. Use HAChart ONLY for comparing 2+ related entities on one axis.
9. Use HAEntityList for groups of similar entities (batteries, lights).
10. Use HAGauge for bounded percentages when visual emphasis is needed.
11. Use HAMarkdown sparingly — only for brief summaries if the request implies analysis.
12. Create 10-30 total elements for a rich, informative dashboard.
13. Give each card a short, clear title (e.g., "Living Room Temp").

EXAMPLE — correct SpecStream for 3 sensor entities in a row:
{{"op":"add","path":"/elements/grid_sensors","value":{{"type":"Grid","props":{{"columns":3,"gap":"md"}},"children":["gi_1","gi_2","gi_3"]}}}}
{{"op":"add","path":"/elements/gi_1","value":{{"type":"GridItem","props":{{"span":1}},"children":["mini_1"]}}}}
{{"op":"add","path":"/elements/gi_2","value":{{"type":"GridItem","props":{{"span":1}},"children":["mini_2"]}}}}
{{"op":"add","path":"/elements/gi_3","value":{{"type":"GridItem","props":{{"span":1}},"children":["mini_3"]}}}}
This produces 1 row of 3 compact cards.
WRONG: putting each HAMiniGraph in a span=3 GridItem (full width).
RIGHT: span=1 so 3 cards fit per row.

User request: {prompt}

OUTPUT FORMAT — SpecStream (JSONL patches):
Output one JSON patch operation per line. Each line is a JSON object with \
"op", "path", and "value" keys. Use "add" operations to build the spec.

Start with the root:
{{"op":"add","path":"/root","value":"<root_element_id>"}}
{{"op":"add","path":"/elements","value":{{}}}}

Then add each element one per line:
{{"op":"add","path":"/elements/<element_id>","value":{{"type":"<Type>","props":{{...}},"children":[...]}}}}

Output ONLY the JSONL patch lines, one per line, no other text. \
Do not wrap in code fences. Each line must be valid JSON."""


def _get_streaming_config(hass: HomeAssistant) -> dict[str, Any] | None:
    """Get streaming provider config if configured.

    Returns None if streaming is not configured (AI Task mode).
    """
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return None

    entry = entries[0]
    data = {**entry.data, **entry.options}
    provider = data.get(CONF_STREAMING_PROVIDER, STREAMING_PROVIDER_NONE)

    # "none" (legacy) and "ai_task" both mean no streaming
    if provider in (STREAMING_PROVIDER_NONE, PROVIDER_AI_TASK):
        return None

    return {
        "provider": provider,
        "api_key": data.get(CONF_STREAMING_API_KEY, ""),
        "model": data.get(CONF_STREAMING_MODEL),
        "base_url": data.get(CONF_STREAMING_BASE_URL),
    }


def _get_ai_task_entity(hass: HomeAssistant) -> str | None:
    """Get the configured AI Task entity, or None if using a streaming provider."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return None
    entry = entries[0]
    data = {**entry.data, **entry.options}
    entity = data.get(CONF_AI_TASK_ENTRY, "")
    return entity if entity else None


def async_register_commands(hass: HomeAssistant) -> None:
    """Register WebSocket commands."""
    websocket_api.async_register_command(hass, ws_generate)
    websocket_api.async_register_command(hass, ws_generate_stream)
    websocket_api.async_register_command(hass, ws_history)
    websocket_api.async_register_command(hass, ws_entities)
    websocket_api.async_register_command(hass, ws_streaming_status)
    websocket_api.async_register_command(hass, ws_dashboard_list)
    websocket_api.async_register_command(hass, ws_dashboard_save)
    websocket_api.async_register_command(hass, ws_dashboard_delete)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/streaming_status",
    }
)
@callback
def ws_streaming_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return whether streaming is configured."""
    config = _get_streaming_config(hass)
    connection.send_result(
        msg["id"],
        {
            "streaming_available": config is not None,
            "provider": config["provider"] if config else None,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/generate",
        vol.Required("prompt"): str,
    }
)
@websocket_api.async_response
async def ws_generate(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle dashboard generation request (two-pass LLM) with progress events."""
    prompt = msg["prompt"]
    msg_id = msg["id"]

    # Get the config entry
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg_id, "not_configured", "VibeDash is not configured")
        return

    ai_task_entity = _get_ai_task_entity(hass)
    streaming_config = _get_streaming_config(hass)

    if not ai_task_entity and not streaming_config:
        connection.send_error(msg_id, "not_configured", "No AI provider configured")
        return

    entity_cache = hass.data[DOMAIN].get("entity_cache")
    if not entity_cache:
        connection.send_error(msg_id, "no_cache", "Entity cache not initialized")
        return

    try:
        # Send progress: starting entity selection
        connection.send_message(
            websocket_api.event_message(
                msg_id,
                {"stage": "entity_selection", "message": "Analyzing your request..."},
            )
        )

        # Pass 1: Entity selection
        entity_context = entity_cache.get_entity_selection_context(prompt)
        selection_prompt = ENTITY_SELECTION_PROMPT.format(
            entity_context=entity_context,
            prompt=prompt,
        )

        _LOGGER.debug("Pass 1: Entity selection for prompt: %s", prompt)

        if ai_task_entity:
            result = await hass.services.async_call(
                "ai_task",
                "generate_data",
                {
                    "task_name": "vibedash_entity_selection",
                    "entity_id": ai_task_entity,
                    "instructions": selection_prompt,
                },
                blocking=True,
                return_response=True,
            )
            raw_response = result.get("data", "")
        else:
            from .streaming import generate_llm_response

            raw_response = await generate_llm_response(
                provider=streaming_config["provider"],
                api_key=streaming_config["api_key"],
                prompt=selection_prompt,
                model=streaming_config.get("model"),
                base_url=streaming_config.get("base_url"),
            )

        # Parse entity selection response
        entity_ids = _parse_entity_ids(raw_response)

        if not entity_ids:
            connection.send_error(
                msg_id,
                "no_entities",
                "LLM could not identify relevant entities for your request",
            )
            return

        _LOGGER.debug("Pass 1 selected %d entities: %s", len(entity_ids), entity_ids)

        # Send progress: entities found, starting dashboard generation
        connection.send_message(
            websocket_api.event_message(
                msg_id,
                {
                    "stage": "dashboard_generation",
                    "message": f"Found {len(entity_ids)} relevant entities, generating dashboard...",
                    "entity_count": len(entity_ids),
                },
            )
        )

        # Pass 2: Dashboard generation with detailed entity context
        entity_details = entity_cache.get_detailed_context(entity_ids)
        dashboard_prompt = DASHBOARD_GENERATION_PROMPT.format(
            entity_details=entity_details,
            prompt=prompt,
        )

        _LOGGER.debug("Pass 2: Dashboard generation")

        if ai_task_entity:
            result = await hass.services.async_call(
                "ai_task",
                "generate_data",
                {
                    "task_name": "vibedash_dashboard_generation",
                    "entity_id": ai_task_entity,
                    "instructions": dashboard_prompt,
                },
                blocking=True,
                return_response=True,
            )
            raw_response = result.get("data", "")
        else:
            from .streaming import generate_llm_response

            raw_response = await generate_llm_response(
                provider=streaming_config["provider"],
                api_key=streaming_config["api_key"],
                prompt=dashboard_prompt,
                model=streaming_config.get("model"),
                base_url=streaming_config.get("base_url"),
            )

        # Parse dashboard response
        dashboard = _parse_dashboard(raw_response)

        if not dashboard:
            connection.send_error(
                msg_id,
                "parse_error",
                "Failed to parse dashboard from LLM response",
            )
            return

        # Validate entity references exist
        _validate_dashboard_entities(hass, dashboard)

        connection.send_result(msg_id, {"dashboard": dashboard})

    except Exception:
        _LOGGER.exception("Error generating dashboard")
        connection.send_error(
            msg_id, "generation_error", "Failed to generate dashboard"
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/generate_stream",
        vol.Required("prompt"): str,
    }
)
@websocket_api.async_response
async def ws_generate_stream(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle streaming dashboard generation.

    Uses direct LLM API calls for token-by-token streaming.
    Falls back to non-streaming ai_task if streaming is not configured.

    Sends events:
      - {stage: "entity_selection", message: "..."}
      - {stage: "dashboard_generation", message: "..."}
      - {stage: "streaming", chunk: "...", accumulated: "..."} (streaming only)
      - {stage: "complete", dashboard: {...}}
    """
    prompt = msg["prompt"]
    msg_id = msg["id"]

    # Verify config
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg_id, "not_configured", "VibeDash is not configured")
        return

    ai_task_entity = _get_ai_task_entity(hass)
    streaming_config = _get_streaming_config(hass)

    if not ai_task_entity and not streaming_config:
        connection.send_error(msg_id, "not_configured", "No AI provider configured")
        return

    entity_cache = hass.data[DOMAIN].get("entity_cache")
    if not entity_cache:
        connection.send_error(msg_id, "no_cache", "Entity cache not initialized")
        return

    try:
        # --- Pass 1: Entity selection ---
        connection.send_message(
            websocket_api.event_message(
                msg_id,
                {"stage": "entity_selection", "message": "Analyzing your request..."},
            )
        )

        entity_context = entity_cache.get_entity_selection_context(prompt)
        selection_prompt = ENTITY_SELECTION_PROMPT.format(
            entity_context=entity_context,
            prompt=prompt,
        )

        _LOGGER.debug("Stream pass 1: Entity selection for prompt: %s", prompt)

        if ai_task_entity:
            result = await hass.services.async_call(
                "ai_task",
                "generate_data",
                {
                    "task_name": "vibedash_entity_selection",
                    "entity_id": ai_task_entity,
                    "instructions": selection_prompt,
                },
                blocking=True,
                return_response=True,
            )
            raw_response = result.get("data", "")
        else:
            from .streaming import generate_llm_response

            raw_response = await generate_llm_response(
                provider=streaming_config["provider"],
                api_key=streaming_config["api_key"],
                prompt=selection_prompt,
                model=streaming_config.get("model"),
                base_url=streaming_config.get("base_url"),
            )

        entity_ids = _parse_entity_ids(raw_response)

        if not entity_ids:
            connection.send_error(
                msg_id,
                "no_entities",
                "LLM could not identify relevant entities for your request",
            )
            return

        _LOGGER.debug(
            "Stream pass 1 selected %d entities: %s", len(entity_ids), entity_ids
        )

        # --- Pass 2: Dashboard generation ---
        entity_details = entity_cache.get_detailed_context(entity_ids)
        dashboard_prompt = DASHBOARD_GENERATION_PROMPT.format(
            entity_details=entity_details,
            prompt=prompt,
        )

        if streaming_config:
            # Use SpecStream prompt for streaming path
            streaming_prompt = DASHBOARD_GENERATION_STREAMING_PROMPT.format(
                entity_details=entity_details,
                prompt=prompt,
            )

            # Stream the dashboard generation
            connection.send_message(
                websocket_api.event_message(
                    msg_id,
                    {
                        "stage": "dashboard_generation",
                        "message": f"Found {len(entity_ids)} entities, streaming dashboard...",
                        "entity_count": len(entity_ids),
                        "streaming": True,
                    },
                )
            )

            from .streaming import stream_llm_response

            accumulated = ""
            async for chunk in stream_llm_response(
                provider=streaming_config["provider"],
                api_key=streaming_config["api_key"],
                prompt=streaming_prompt,
                model=streaming_config.get("model"),
                base_url=streaming_config.get("base_url"),
            ):
                accumulated += chunk
                connection.send_message(
                    websocket_api.event_message(
                        msg_id,
                        {
                            "stage": "streaming",
                            "chunk": chunk,
                        },
                    )
                )

            # Parse the SpecStream JSONL into a dashboard spec
            dashboard = _parse_specstream_dashboard(accumulated)
            if not dashboard:
                # Fallback: try parsing as regular JSON in case LLM ignored format
                dashboard = _parse_dashboard(accumulated)

        elif ai_task_entity:
            # Non-streaming fallback via ai_task
            connection.send_message(
                websocket_api.event_message(
                    msg_id,
                    {
                        "stage": "dashboard_generation",
                        "message": f"Found {len(entity_ids)} entities, generating dashboard...",
                        "entity_count": len(entity_ids),
                        "streaming": False,
                    },
                )
            )

            result = await hass.services.async_call(
                "ai_task",
                "generate_data",
                {
                    "task_name": "vibedash_dashboard_generation",
                    "entity_id": ai_task_entity,
                    "instructions": dashboard_prompt,
                },
                blocking=True,
                return_response=True,
            )

            dashboard = _parse_dashboard(result.get("data", ""))

        else:
            # No provider available for Pass 2
            connection.send_error(
                msg_id, "not_configured", "No AI provider configured for generation"
            )
            return

        if not dashboard:
            connection.send_error(
                msg_id,
                "parse_error",
                "Failed to parse dashboard from LLM response",
            )
            return

        _validate_dashboard_entities(hass, dashboard)

        # Send final result as an event (not send_result) so frontend
        # knows it came through the streaming pipeline
        connection.send_message(
            websocket_api.event_message(
                msg_id,
                {"stage": "complete", "dashboard": dashboard},
            )
        )

    except Exception:
        _LOGGER.exception("Error in streaming dashboard generation")
        connection.send_error(
            msg_id, "generation_error", "Failed to generate dashboard"
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/history",
        vol.Required("entity_ids"): [str],
        vol.Required("time_range"): vol.In(list(TIME_RANGES.keys())),
    }
)
@websocket_api.async_response
async def ws_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Fetch entity history data for charts."""
    entity_ids = msg["entity_ids"]
    hours = TIME_RANGES[msg["time_range"]]

    end_time = datetime.now()
    start_time = end_time - timedelta(hours=hours)

    try:
        # Use the recorder/history API
        from homeassistant.components.recorder import get_instance

        history_data = await get_instance(hass).async_add_executor_job(
            _get_history, hass, start_time, end_time, entity_ids
        )

        # Format for Recharts (t/y pairs per entity), downsampled to MAX_CHART_POINTS
        MAX_CHART_POINTS = 300
        formatted: dict[str, list[dict[str, Any]]] = {}
        for entity_id, states in history_data.items():
            points = []
            for state in states:
                try:
                    value = float(state["state"])
                    points.append({"t": state["last_changed"], "y": value})
                except (ValueError, TypeError):
                    continue
            formatted[entity_id] = _downsample(points, MAX_CHART_POINTS)

        connection.send_result(msg["id"], {"history": formatted})

    except Exception:
        _LOGGER.exception("Error fetching history")
        connection.send_error(
            msg["id"], "history_error", "Failed to fetch history data"
        )


def _get_history(
    hass: HomeAssistant,
    start_time: datetime,
    end_time: datetime,
    entity_ids: list[str],
) -> dict[str, list[dict[str, Any]]]:
    """Fetch history from recorder (runs in executor)."""
    from homeassistant.components.recorder import history as recorder_history

    # Use the get_significant_states API
    states = recorder_history.get_significant_states(
        hass,
        start_time,
        end_time,
        entity_ids,
        significant_changes_only=False,
    )

    result: dict[str, list[dict[str, Any]]] = {}
    for entity_id, state_list in states.items():
        result[entity_id] = [
            {
                "state": s.state,
                "last_changed": s.last_changed.isoformat(),
            }
            for s in state_list
            if s.state not in ("unknown", "unavailable")
        ]

    return result


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/entities",
    }
)
@callback
def ws_entities(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return cached entity catalog."""
    entity_cache = hass.data[DOMAIN].get("entity_cache")
    if not entity_cache:
        connection.send_error(msg["id"], "no_cache", "Entity cache not initialized")
        return

    cache = entity_cache.cache
    entities = [info.to_dict() for info in cache.entities.values()]
    domains = {k: len(v) for k, v in cache.domains.items()}
    areas = {k: len(v) for k, v in cache.areas.items()}

    connection.send_result(
        msg["id"],
        {
            "entities": entities,
            "domains": domains,
            "areas": areas,
            "total": len(entities),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/dashboard_list",
    }
)
@websocket_api.async_response
async def ws_dashboard_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all saved dashboards."""
    store = hass.data[DOMAIN].get("dashboard_store")
    if not store:
        connection.send_result(msg["id"], {"dashboards": []})
        return

    data = await store.async_load()
    dashboards = data.get("dashboards", []) if data else []
    dashboards.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    connection.send_result(msg["id"], {"dashboards": dashboards})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/dashboard_save",
        vol.Required("name"): str,
        vol.Required("prompt"): str,
        vol.Required("dashboard"): dict,
    }
)
@websocket_api.async_response
async def ws_dashboard_save(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save a dashboard."""
    store = hass.data[DOMAIN].get("dashboard_store")
    if not store:
        connection.send_error(msg["id"], "no_store", "Dashboard store not initialized")
        return

    data = await store.async_load() or {"dashboards": []}
    dashboards = data.get("dashboards", [])

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": uuid.uuid4().hex,
        "name": msg["name"],
        "prompt": msg["prompt"],
        "dashboard": msg["dashboard"],
        "created_at": now,
        "updated_at": now,
    }
    dashboards.append(record)
    await store.async_save({"dashboards": dashboards})
    connection.send_result(msg["id"], {"saved": record})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vibedash/dashboard_delete",
        vol.Required("dashboard_id"): str,
    }
)
@websocket_api.async_response
async def ws_dashboard_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a saved dashboard."""
    store = hass.data[DOMAIN].get("dashboard_store")
    if not store:
        connection.send_error(msg["id"], "no_store", "Dashboard store not initialized")
        return

    data = await store.async_load() or {"dashboards": []}
    dashboards = data.get("dashboards", [])

    original_len = len(dashboards)
    dashboards = [d for d in dashboards if d["id"] != msg["dashboard_id"]]

    if len(dashboards) == original_len:
        connection.send_error(msg["id"], "not_found", "Dashboard not found")
        return

    await store.async_save({"dashboards": dashboards})
    connection.send_result(msg["id"], {"deleted": True})


def _downsample(points: list[dict[str, Any]], max_points: int) -> list[dict[str, Any]]:
    """Uniformly downsample a list of time-series points to at most max_points."""
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(i * step)] for i in range(max_points)]


def _parse_entity_ids(data: Any) -> list[str]:
    """Parse entity IDs from LLM response."""
    text = str(data) if not isinstance(data, str) else data

    # Try to extract JSON from the response
    json_obj = _extract_json(text)
    if json_obj and "entity_ids" in json_obj:
        ids = json_obj["entity_ids"]
        if isinstance(ids, list):
            return [str(eid) for eid in ids if isinstance(eid, str)]

    # Fallback: look for entity_id patterns in text
    import re

    return re.findall(r"[a-z_]+\.[a-z0-9_]+", text)


def _parse_specstream_dashboard(data: Any) -> dict[str, Any] | None:
    """Parse SpecStream JSONL patches into a dashboard spec.

    Each line is an RFC 6902 JSON Patch "add" operation like:
      {"op":"add","path":"/root","value":"stack_main"}
      {"op":"add","path":"/elements/heading_1","value":{"type":"Heading",...}}
    """
    text = str(data) if not isinstance(data, str) else data

    # Strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    result: dict[str, Any] = {}
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            patch = json.loads(line)
        except json.JSONDecodeError:
            continue

        if patch.get("op") != "add" or "path" not in patch or "value" not in patch:
            continue

        path_str = patch["path"].lstrip("/")
        if not path_str:
            continue

        parts = path_str.split("/")
        obj = result
        for part in parts[:-1]:
            if part not in obj:
                obj[part] = {}
            obj = obj[part]
        obj[parts[-1]] = patch["value"]

    if "root" in result and "elements" in result:
        return result
    return None


def _parse_dashboard(data: Any) -> dict[str, Any] | None:
    """Parse dashboard spec (json-render format) from LLM response."""
    text = str(data) if not isinstance(data, str) else data

    json_obj = _extract_json(text)
    if json_obj and "root" in json_obj and "elements" in json_obj:
        return json_obj

    return None


def _extract_json(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from text that may contain markdown fences."""
    # Strip markdown code fences
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in text
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    start = None

    return None


def _validate_dashboard_entities(
    hass: HomeAssistant, dashboard: dict[str, Any]
) -> None:
    """Remove references to entities that don't exist from json-render spec."""
    elements_to_remove: list[str] = []

    for elem_id, elem in dashboard.get("elements", {}).items():
        props = elem.get("props", {})
        elem_type = elem.get("type", "")

        if elem_type in ("HAChart", "HAEntityList"):
            entities = props.get("entities", [])
            props["entities"] = [
                eid for eid in entities if hass.states.get(eid) is not None
            ]
            if not props["entities"]:
                elements_to_remove.append(elem_id)

        elif elem_type in ("HAMetric", "HAGauge", "HAMiniGraph"):
            entity = props.get("entity")
            if entity and hass.states.get(entity) is None:
                elements_to_remove.append(elem_id)

    # Remove invalid elements and their references from parent children arrays
    for elem_id in elements_to_remove:
        dashboard["elements"].pop(elem_id, None)
        for elem in dashboard["elements"].values():
            children = elem.get("children", [])
            if elem_id in children:
                children.remove(elem_id)
