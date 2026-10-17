import json
from pathlib import Path
from unittest.mock import patch

import requests
from pydantic import SecretStr
from web3 import Web3

import chain
import ipfs
from config import Settings


def test_ipfs_timeout_falls_back_to_deterministic_local_file(tmp_path, monkeypatch):
    monkeypatch.setattr(ipfs, "EVIDENCE_DIR", tmp_path)
    settings = Settings(pinata_jwt=SecretStr("pinata-test-secret"))
    evidence = {"score": 90, "flags": ["LOW_HEALTHY_AREA"]}

    with patch("ipfs.requests.post", side_effect=requests.Timeout):
        evidence_hash, uri = ipfs.publish_evidence(evidence, settings)

    assert uri.startswith("local://")
    assert evidence_hash == Web3.to_hex(Web3.keccak(ipfs.canonical_json(evidence)))
    saved = Path(tmp_path, uri.removeprefix("local://") + ".json")
    assert saved.read_bytes() == ipfs.canonical_json(evidence)


def test_chain_loads_abi_from_generated_shared_deployment_metadata(tmp_path, monkeypatch):
    abi = [
        {"type": "function", "name": "checkRegion"},
        {"type": "function", "name": "registerProject"},
    ]
    metadata_path = tmp_path / "contract.json"
    metadata_path.write_text(
        json.dumps(
            {
                "address": "0x" + "1" * 40,
                "abi": abi,
                "chainId": 11155111,
                "deployedAt": "2025-01-01T00:00:00.000Z",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(chain, "CONTRACT_ABI_PATH", metadata_path)
    metadata = chain._load_contract_metadata()
    names = {entry["name"] for entry in metadata["abi"] if entry["type"] == "function"}

    assert {"checkRegion", "registerProject"} <= names
