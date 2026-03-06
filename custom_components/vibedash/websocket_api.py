"""WebSocket API for VibeDash."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import CONF_AI_TASK_ENTRY, DOMAIN, TIME_RANGES

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
You are a Home Assistant dashboard generator. Create a well-organized dashboard \
layout as a json-render spec based on the user's request.

{entity_details}

Available component types:

HA data components:
- "HAMiniGraph": Compact card with current value + sparkline trend. \
Props: title (string), entity (single entity_id), \
timeRange ("1h"|"6h"|"24h"|"7d"|"30d", default "24h"). \
THIS IS THE DEFAULT CARD for individual sensors (temperature, humidity, power, energy, etc.)
- "HAChart": Full time-series chart for comparing multiple entities on one axis. \
Props: title (string), chartType ("line"|"bar"|"area"), \
entities (array of entity_ids, max 10), timeRange ("1h"|"6h"|"24h"|"7d"|"30d"). \
Use ONLY when comparing 2+ related entities together.
- "HAMetric": Single big number without trend. Props: title (string), entity (single entity_id). \
Use for non-numeric or rarely changing values, or when sparkline is not useful.
- "HAGauge": Semicircle gauge. Props: title (string), entity (single entity_id), \
min (number), max (number). Use for bounded percentages (battery, humidity).
- "HAEntityList": Compact list of entities. Props: title (string), \
entities (array of entity_ids), timeRange (optional). \
Use for batteries or groups of similar simple entities.
- "HAMarkdown": Text/analysis card. Props: title (string), content (markdown string).

Layout components:
- "Grid": Grid container. Props: columns (number, 1-4), gap (number). \
Children: array of element IDs.
- "Card": Card wrapper. Props: title (string, optional). Children: array of element IDs.
- "Stack": Flex container. Props: direction ("row"|"column"), gap (number). \
Children: array of element IDs.
- "Heading": Section heading. Props: text (string), level (1-4).
- "Text": Body text. Props: text (string).

Dashboard design rules:
1. GROUP entities by category with Heading elements (e.g., "Climate", "Power", \
"Sensors", "Batteries"). Each section gets a level-2 Heading followed by its cards.
2. Use a NESTED layout: root Grid (1 column) → sections, where each section is a \
Stack(direction="column") containing a Heading + Grid of cards for that category.
3. Put HAMiniGraph cards in 2-column Grids within sections for compact layout.
4. HAMiniGraph is the DEFAULT for individual sensor entities. Use it for temperature, \
humidity, power, energy, illuminance, pressure, CO2, TVOC, voltage, current, etc.
5. Use HAChart ONLY when overlaying 2+ related entities (e.g., indoor vs outdoor temp, \
or production vs consumption).
6. Use HAEntityList for batteries (group all battery sensors into one list).
7. Use HAGauge for single bounded percentages when visual emphasis is needed.
8. Use HAMarkdown sparingly — only for a brief summary if the user's request implies analysis.
9. Create 10-25 total elements for a rich, informative dashboard.
10. Give each card a short, clear title (e.g., "Living Room Temperature", not \
"Temperature Sensor for the Living Room Area").

User request: {prompt}

Return ONLY a valid JSON object with "root" and "elements" keys. \
Each element has a unique string ID, "type", "props", and optional "children" array.
No other text, just the JSON."""


def async_register_commands(hass: HomeAssistant) -> None:
    """Register WebSocket commands."""
    websocket_api.async_register_command(hass, ws_generate)
    websocket_api.async_register_command(hass, ws_history)
    websocket_api.async_register_command(hass, ws_entities)


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
    """Handle dashboard generation request (two-pass LLM)."""
    prompt = msg["prompt"]

    # Get the config entry
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_configured", "VibeDash is not configured")
        return

    entry = entries[0]
    # options takes precedence over data so users can switch providers via the options flow
    ai_task_entity = entry.options.get(CONF_AI_TASK_ENTRY) or entry.data.get(
        CONF_AI_TASK_ENTRY
    )
    if not ai_task_entity:
        connection.send_error(msg["id"], "no_ai_task", "No AI Task provider configured")
        return

    entity_cache = hass.data[DOMAIN].get("entity_cache")
    if not entity_cache:
        connection.send_error(msg["id"], "no_cache", "Entity cache not initialized")
        return

    try:
        # Pass 1: Entity selection
        entity_context = entity_cache.get_entity_selection_context(prompt)
        selection_prompt = ENTITY_SELECTION_PROMPT.format(
            entity_context=entity_context,
            prompt=prompt,
        )

        _LOGGER.debug("Pass 1: Entity selection for prompt: %s", prompt)

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

        # Parse entity selection response
        entity_ids = _parse_entity_ids(result.get("data", ""))

        if not entity_ids:
            connection.send_error(
                msg["id"],
                "no_entities",
                "LLM could not identify relevant entities for your request",
            )
            return

        _LOGGER.debug("Pass 1 selected %d entities: %s", len(entity_ids), entity_ids)

        # Pass 2: Dashboard generation with detailed entity context
        entity_details = entity_cache.get_detailed_context(entity_ids)
        dashboard_prompt = DASHBOARD_GENERATION_PROMPT.format(
            entity_details=entity_details,
            prompt=prompt,
        )

        _LOGGER.debug("Pass 2: Dashboard generation")

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

        # Parse dashboard response
        dashboard = _parse_dashboard(result.get("data", ""))

        if not dashboard:
            connection.send_error(
                msg["id"],
                "parse_error",
                "Failed to parse dashboard from LLM response",
            )
            return

        # Validate entity references exist
        _validate_dashboard_entities(hass, dashboard)

        connection.send_result(msg["id"], {"dashboard": dashboard})

    except Exception:
        _LOGGER.exception("Error generating dashboard")
        connection.send_error(
            msg["id"], "generation_error", "Failed to generate dashboard"
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
