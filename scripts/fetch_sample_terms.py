#!/usr/bin/env python
"""
Run term-extraction prompt against one scripted sample log using OpenAI-compatible endpoint.

Usage:
  python scripts/fetch_sample_terms.py --sample 1
  python scripts/fetch_sample_terms.py --sample sample-03-manufacturing-clean
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = ROOT / "doc" / "samples" / "scripted-clean"


def load_local_settings_values() -> dict[str, Any]:
    local_settings = ROOT / "api" / "local.settings.json"
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

    if not endpoint or not deployment_name or not api_key:
        raise RuntimeError("Missing one of: AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_DEPLOYMENT / AZURE_OPENAI_API_KEY")

    return endpoint, deployment_name, api_key


def resolve_sample(sample: str) -> Path:
    raw = sample.strip()

    if raw.isdigit():
        file_name = f"sample-{int(raw):02d}"
        matches = sorted(SAMPLES_DIR.glob(f"{file_name}-*-clean.md"))
        if matches:
            return matches[0]

    if not raw.endswith(".md"):
        raw = raw + ".md"

    path = SAMPLES_DIR / raw
    if path.exists():
        return path

    # fallback fuzzy
    matches = sorted(SAMPLES_DIR.glob(f"*{sample}*.md"))
    if matches:
        return matches[0]

    raise FileNotFoundError(f"sample not found: {sample}")


def extract_meeting_text(md_text: str) -> str:
    start = md_text.find("## 会話ログ")
    if start < 0:
        return md_text

    body = md_text[start + len("## 会話ログ") :]
    end = body.find("## Expected Terms")
    if end >= 0:
        body = body[:end]

    lines = [ln.rstrip() for ln in body.splitlines()]
    lines = [ln for ln in lines if ln.strip()]
    return "\n".join(lines)


def parse_json_block(text: str) -> Any:
    cleaned = text.strip()

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    m = re.search(r"```json\s*([\s\S]*?)\s*```", cleaned, flags=re.I)
    if not m:
        m = re.search(r"```\s*([\s\S]*?)\s*```", cleaned, flags=re.I)
    if m:
        return json.loads(m.group(1))

    raise ValueError("Model response is not valid JSON")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", default="1", help="sample number or filename")
    args = parser.parse_args()

    sample_path = resolve_sample(args.sample)
    sample_text = sample_path.read_text(encoding="utf-8")
    meeting_text = extract_meeting_text(sample_text)

    endpoint, deployment_name, api_key = read_config()
    client = OpenAI(base_url=endpoint, api_key=api_key)

    prompt = (
        "会議ログから未知語候補を最大5件抽出し、JSON配列のみで返してください。"
        "各要素は term, summary, score, reasons を持つこと。"
        "summaryは断定せず『可能性があります』を含めること。"
    )

    completion = client.chat.completions.create(
        model=deployment_name,
        temperature=0.1,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": meeting_text},
        ],
    )

    content = completion.choices[0].message.content or ""
    payload = parse_json_block(content)

    print(f"sample: {sample_path.name}")
    print("model:", completion.model)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
