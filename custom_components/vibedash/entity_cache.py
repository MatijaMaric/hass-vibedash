"""Entity knowledge cache for VibeDash.

Builds rich text descriptions of all entities for LLM context.
Uses a two-pass approach:
  1. Pre-filter entities by keyword matching against user prompt
  2. First LLM call selects the most relevant entities
  3. Second LLM call generates the dashboard using detailed entity context
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

# Keywords that map to entity domains/device_classes for pre-filtering
DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "sensor": [
        "temperature",
        "humidity",
        "pressure",
        "energy",
        "power",
        "battery",
        "illuminance",
        "light level",
        "co2",
        "carbon",
        "voltage",
        "current",
        "speed",
        "wind",
        "rain",
        "moisture",
        "gas",
        "pm2.5",
        "pm10",
        "sensor",
        "reading",
        "measurement",
        "level",
        "usage",
        "consumption",
    ],
    "binary_sensor": [
        "door",
        "window",
        "motion",
        "occupancy",
        "smoke",
        "leak",
        "water",
        "presence",
        "opening",
        "contact",
        "vibration",
        "tamper",
        "problem",
        "binary",
        "open",
        "closed",
        "detected",
        "on",
        "off",
    ],
    "light": ["light", "lamp", "bulb", "brightness", "color", "lighting"],
    "switch": ["switch", "plug", "outlet", "toggle"],
    "climate": [
        "climate",
        "thermostat",
        "hvac",
        "heating",
        "cooling",
        "ac",
        "air conditioning",
        "temperature control",
    ],
    "cover": ["cover", "blind", "curtain", "shutter", "garage", "door"],
    "media_player": ["media", "speaker", "tv", "player", "music", "volume"],
    "fan": ["fan", "ventilation"],
    "lock": ["lock", "deadbolt"],
    "camera": ["camera", "snapshot", "stream"],
    "weather": ["weather", "forecast", "condition"],
    "automation": ["automation", "rule"],
    "scene": ["scene"],
    "script": ["script"],
    "person": ["person", "tracker", "location", "presence", "who"],
    "zone": ["zone", "area", "geofence"],
    "sun": ["sun", "sunrise", "sunset"],
    "input_boolean": ["input", "helper", "toggle"],
    "input_number": ["input", "helper", "number", "slider"],
    "counter": ["counter", "count"],
    "timer": ["timer"],
    "water_heater": ["water heater", "boiler"],
    "vacuum": ["vacuum", "robot"],
    "device_tracker": ["device", "tracker", "phone", "location", "presence"],
    "update": ["update", "firmware"],
}


@dataclass
class EntityInfo:
    """Rich entity information for LLM context."""

    entity_id: str
    friendly_name: str
    domain: str
    device_class: str | None = None
    state_class: str | None = None
    unit_of_measurement: str | None = None
    area_name: str | None = None
    device_name: str | None = None
    current_state: str | None = None
    icon: str | None = None

    def to_summary(self) -> str:
        """One-line summary for entity selection pass."""
        parts = [self.entity_id]
        if self.friendly_name and self.friendly_name != self.entity_id:
            parts.append(f'"{self.friendly_name}"')
        if self.area_name:
            parts.append(f"in {self.area_name}")
        if self.device_class:
            parts.append(f"[{self.device_class}]")
        if self.unit_of_measurement:
            parts.append(f"({self.unit_of_measurement})")
        return " ".join(parts)

    def to_detail(self) -> str:
        """Detailed description for dashboard generation pass."""
        lines = [f"- {self.entity_id}"]
        if self.friendly_name:
            lines[0] += f' ("{self.friendly_name}")'
        details = []
        if self.area_name:
            details.append(f"area: {self.area_name}")
        if self.device_name:
            details.append(f"device: {self.device_name}")
        if self.device_class:
            details.append(f"class: {self.device_class}")
        if self.state_class:
            details.append(f"state_class: {self.state_class}")
        if self.unit_of_measurement:
            details.append(f"unit: {self.unit_of_measurement}")
        if self.current_state:
            details.append(f"current: {self.current_state}")
        if details:
            lines[0] += f"  [{', '.join(details)}]"
        return lines[0]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for storage."""
        return {
            "entity_id": self.entity_id,
            "friendly_name": self.friendly_name,
            "domain": self.domain,
            "device_class": self.device_class,
            "state_class": self.state_class,
            "unit_of_measurement": self.unit_of_measurement,
            "area_name": self.area_name,
            "device_name": self.device_name,
            "icon": self.icon,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EntityInfo:
        """Deserialize from dict."""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class EntityCache:
    """Cached entity knowledge grouped by domain."""

    entities: dict[str, EntityInfo] = field(default_factory=dict)
    domains: dict[str, list[str]] = field(default_factory=dict)
    areas: dict[str, list[str]] = field(default_factory=dict)

    def get_domain_summary(self) -> str:
        """Summary of available domains and counts."""
        lines = ["Available entity domains:"]
        for domain, entity_ids in sorted(self.domains.items()):
            lines.append(f"  {domain}: {len(entity_ids)} entities")
        return "\n".join(lines)

    def get_area_summary(self) -> str:
        """Summary of available areas."""
        if not self.areas:
            return "No areas configured."
        lines = ["Available areas:"]
        for area, entity_ids in sorted(self.areas.items()):
            lines.append(f"  {area}: {len(entity_ids)} entities")
        return "\n".join(lines)


class VibeDashEntityCache:
    """Manages entity knowledge cache for VibeDash."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the entity cache."""
        self.hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._cache: EntityCache = EntityCache()
        self._unsub_callbacks: list[Any] = []

    async def async_initialize(self) -> None:
        """Load cache from storage or build it."""
        stored = await self._store.async_load()
        if stored and "entities" in stored:
            self._cache = EntityCache()
            for entity_data in stored["entities"]:
                info = EntityInfo.from_dict(entity_data)
                self._cache.entities[info.entity_id] = info
            self._rebuild_indexes()
            _LOGGER.debug("Loaded %d entities from cache", len(self._cache.entities))
        else:
            await self.async_rebuild()

        self._register_listeners()

    def _register_listeners(self) -> None:
        """Listen for registry changes to invalidate cache."""

        @callback
        def _async_registry_updated(event: Any) -> None:
            """Handle registry updates."""
            self.hass.async_create_task(self.async_rebuild())

        self._unsub_callbacks.append(
            self.hass.bus.async_listen(
                er.EVENT_ENTITY_REGISTRY_UPDATED, _async_registry_updated
            )
        )

    async def async_rebuild(self) -> None:
        """Rebuild the entity cache from registries."""
        entity_registry = er.async_get(self.hass)
        device_registry = dr.async_get(self.hass)
        area_registry = ar.async_get(self.hass)

        # Build area lookup
        area_lookup: dict[str, str] = {}
        for area in area_registry.areas.values():
            area_lookup[area.id] = area.name

        # Build device lookup
        device_area_lookup: dict[str, str | None] = {}
        device_name_lookup: dict[str, str | None] = {}
        for device in device_registry.devices.values():
            device_area_lookup[device.id] = (
                area_lookup.get(device.area_id) if device.area_id else None
            )
            device_name_lookup[device.id] = device.name_by_user or device.name

        self._cache = EntityCache()

        for entry in entity_registry.entities.values():
            if entry.disabled:
                continue

            # Resolve area: entity area > device area
            area_name = None
            if entry.area_id:
                area_name = area_lookup.get(entry.area_id)
            elif entry.device_id:
                area_name = device_area_lookup.get(entry.device_id)

            device_name = None
            if entry.device_id:
                device_name = device_name_lookup.get(entry.device_id)

            # Get current state for context
            state = self.hass.states.get(entry.entity_id)
            friendly_name = (
                entry.name
                or entry.original_name
                or (state.attributes.get("friendly_name") if state else None)
                or entry.entity_id
            )

            info = EntityInfo(
                entity_id=entry.entity_id,
                friendly_name=friendly_name,
                domain=entry.domain,
                device_class=(
                    entry.device_class
                    or entry.original_device_class
                    or (state.attributes.get("device_class") if state else None)
                ),
                state_class=(state.attributes.get("state_class") if state else None),
                unit_of_measurement=(
                    entry.unit_of_measurement
                    or (state.attributes.get("unit_of_measurement") if state else None)
                ),
                area_name=area_name,
                device_name=device_name,
                icon=entry.icon or entry.original_icon,
            )
            self._cache.entities[entry.entity_id] = info

        self._rebuild_indexes()
        await self._async_save()
        _LOGGER.info("Entity cache rebuilt: %d entities", len(self._cache.entities))

    def _rebuild_indexes(self) -> None:
        """Rebuild domain and area indexes."""
        self._cache.domains.clear()
        self._cache.areas.clear()

        for entity_id, info in self._cache.entities.items():
            self._cache.domains.setdefault(info.domain, []).append(entity_id)
            if info.area_name:
                self._cache.areas.setdefault(info.area_name, []).append(entity_id)

    async def _async_save(self) -> None:
        """Save cache to storage."""
        data = {
            "entities": [info.to_dict() for info in self._cache.entities.values()],
        }
        await self._store.async_save(data)

    def get_prefiltered_entities(self, prompt: str) -> list[EntityInfo]:
        """Pre-filter entities by keyword matching against the user prompt.

        Returns entities whose domain/device_class keywords appear in the prompt.
        Falls back to all entities if no keywords match (or prompt is very generic).
        """
        prompt_lower = prompt.lower()
        matched_domains: set[str] = set()

        for domain, keywords in DOMAIN_KEYWORDS.items():
            for keyword in keywords:
                if keyword in prompt_lower:
                    matched_domains.add(domain)
                    break

        # Also match by area name
        matched_areas: set[str] = set()
        for area_name in self._cache.areas:
            if area_name.lower() in prompt_lower:
                matched_areas.add(area_name)

        # Collect matching entities
        results: list[EntityInfo] = []
        seen: set[str] = set()

        # Add entities from matched domains
        for domain in matched_domains:
            for entity_id in self._cache.domains.get(domain, []):
                if entity_id not in seen:
                    results.append(self._cache.entities[entity_id])
                    seen.add(entity_id)

        # Add entities from matched areas
        for area in matched_areas:
            for entity_id in self._cache.areas.get(area, []):
                if entity_id not in seen:
                    results.append(self._cache.entities[entity_id])
                    seen.add(entity_id)

        # If no keywords matched, return all entities (generic query)
        if not results:
            results = list(self._cache.entities.values())

        return results

    def get_entity_selection_context(self, prompt: str) -> str:
        """Build context for the entity selection LLM pass.

        Returns a condensed list of pre-filtered entities for the LLM
        to select from.
        """
        entities = self.get_prefiltered_entities(prompt)

        lines = [
            self._cache.get_domain_summary(),
            "",
            self._cache.get_area_summary(),
            "",
            f"Pre-filtered entities ({len(entities)} candidates):",
        ]

        # Group by domain for readability
        by_domain: dict[str, list[EntityInfo]] = {}
        for entity in entities:
            by_domain.setdefault(entity.domain, []).append(entity)

        for domain in sorted(by_domain):
            lines.append(f"\n[{domain}]")
            for info in sorted(by_domain[domain], key=lambda e: e.entity_id):
                lines.append(f"  {info.to_summary()}")

        return "\n".join(lines)

    def get_detailed_context(self, entity_ids: list[str]) -> str:
        """Build detailed context for selected entities (pass 2)."""
        # Update current states
        for entity_id in entity_ids:
            if entity_id in self._cache.entities:
                state = self.hass.states.get(entity_id)
                if state:
                    self._cache.entities[entity_id].current_state = state.state

        lines = ["Selected entities with details:"]
        for entity_id in entity_ids:
            info = self._cache.entities.get(entity_id)
            if info:
                lines.append(info.to_detail())
            else:
                lines.append(f"- {entity_id} (unknown entity)")

        return "\n".join(lines)

    @property
    def cache(self) -> EntityCache:
        """Return the current cache."""
        return self._cache

    def cleanup(self) -> None:
        """Remove event listeners."""
        for unsub in self._unsub_callbacks:
            unsub()
        self._unsub_callbacks.clear()
