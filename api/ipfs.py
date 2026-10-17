"""Bounded Pinata publishing with a deterministic local evidence fallback."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import requests
from web3 import Web3

from config import Settings, get_settings

MAX_EVIDENCE_BYTES = 1024 * 1024
EVIDENCE_DIR = Path(__file__).resolve().parent / "data" / "evidence"
logger = logging.getLogger("carbonlens.api")


def canonical_json(evidence: dict[str, Any]) -> bytes:
    return json.dumps(
        evidence,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def publish_evidence(
    evidence: dict[str, Any],
    settings: Settings | None = None,
) -> tuple[str, str]:
    settings = settings or get_settings()
    content = canonical_json(evidence)
    if len(content) > MAX_EVIDENCE_BYTES:
        raise ValueError("Evidence exceeds the configured size limit.")
    evidence_hash = Web3.to_hex(Web3.keccak(content))

    if settings.pinata_jwt is not None:
        try:
            response = requests.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={"Authorization": f"Bearer {settings.pinata_jwt.get_secret_value()}"},
                json={"pinataContent": evidence},
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
            cid = payload.get("IpfsHash") if isinstance(payload, dict) else None
            if not isinstance(cid, str) or not cid or len(cid) > 100:
                raise ValueError("IPFS provider returned an invalid content identifier.")
            return evidence_hash, f"ipfs://{cid}"
        except (requests.RequestException, ValueError):
            logger.warning(
                json.dumps(
                    {"event": "ipfs_pin_unavailable", "fallback": "local"},
                    separators=(",", ":"),
                )
            )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    content_id = hashlib.sha256(content).hexdigest()
    target = EVIDENCE_DIR / f"{content_id}.json"
    target.write_bytes(content)
    return evidence_hash, f"local://{content_id}"
