#!/usr/bin/env python
"""
Minimal OpenAI-compatible smoke test for Azure Foundry v1 endpoints.

Matches the user-provided style:
- base_url: .../openai/v1/
- model: deployment_name
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from openai import OpenAI


def load_local_settings_values() -> dict[str, Any]:
    local_settings = Path("api/local.settings.json")
    if not local_settings.exists():
        return {}

    try:
        payload = json.loads(local_settings.read_text(encoding="utf-8"))
        values = payload.get("Values", {})
        return values if isinstance(values, dict) else {}
    except Exception:
        return {}


def read_config() -> tuple[str, str, str]:
    values = load_local_settings_values()

    endpoint = (
        os.getenv("AZURE_OPENAI_ENDPOINT")
        or values.get("AZURE_OPENAI_ENDPOINT")
        or ""
    ).strip()

    deployment_name = (
        os.getenv("AZURE_OPENAI_DEPLOYMENT")
        or values.get("AZURE_OPENAI_DEPLOYMENT")
        or ""
    ).strip()

    api_key = (
        os.getenv("AZURE_OPENAI_API_KEY")
        or values.get("AZURE_OPENAI_API_KEY")
        or ""
    ).strip()

    if not endpoint:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT is missing")
    if not deployment_name:
        raise RuntimeError("AZURE_OPENAI_DEPLOYMENT is missing")
    if not api_key:
        raise RuntimeError("AZURE_OPENAI_API_KEY is missing")

    return endpoint, deployment_name, api_key


def main() -> None:
    endpoint, deployment_name, api_key = read_config()

    client = OpenAI(
        base_url=endpoint,
        api_key=api_key,
    )

    completion = client.chat.completions.create(
        model=deployment_name,
        messages=[
            {
                "role": "user",
                "content": "What is the capital of France?",
            }
        ],
    )

    message = completion.choices[0].message
    print("model:", completion.model)
    print("content:", message.content)


if __name__ == "__main__":
    main()
