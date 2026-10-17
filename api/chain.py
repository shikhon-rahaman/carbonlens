"""Timeout-bounded CarbonRegistry reads and signed verifier transactions."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract

from config import Settings, get_settings

CONTRACT_ABI_PATH = Path(__file__).resolve().parents[1] / "shared" / "contract.json"
_transaction_lock = threading.Lock()
_contract_cache: dict[tuple[str, str], tuple[Web3, Contract, Any]] = {}


def _load_contract_metadata() -> dict[str, Any]:
    with CONTRACT_ABI_PATH.open("r", encoding="utf-8") as abi_file:
        document = json.load(abi_file)
    if not isinstance(document, dict):
        raise RuntimeError("Shared CarbonRegistry deployment metadata is malformed.")
    if (
        not isinstance(document.get("address"), str)
        or not isinstance(document.get("chainId"), int)
        or isinstance(document.get("chainId"), bool)
        or not isinstance(document.get("abi"), list)
    ):
        raise RuntimeError("Shared CarbonRegistry deployment metadata is incomplete.")
    return document


def _configured_contract(settings: Settings) -> tuple[Web3, Contract, Any]:
    if settings.rpc_url is None or settings.chain_id is None:
        raise RuntimeError("Blockchain service is not configured.")
    if settings.contract_address is None or settings.verifier_private_key is None:
        raise RuntimeError("Blockchain signing is not configured.")

    cache_key = (settings.rpc_url.get_secret_value(), settings.contract_address)
    cached = _contract_cache.get(cache_key)
    if cached is not None:
        return cached

    metadata = _load_contract_metadata()
    if metadata["chainId"] != settings.chain_id:
        raise RuntimeError("Registry metadata chain ID does not match configured chain ID.")
    address = Web3.to_checksum_address(metadata["address"])
    configured_address = Web3.to_checksum_address(settings.contract_address)
    if address != configured_address:
        raise RuntimeError("Registry metadata address does not match configured address.")

    web3 = Web3(
        Web3.HTTPProvider(
            settings.rpc_url.get_secret_value(),
            request_kwargs={"timeout": 8},
        )
    )
    if web3.eth.chain_id != settings.chain_id:
        raise RuntimeError("Configured blockchain chain ID does not match the RPC.")
    if not web3.eth.get_code(address):
        raise RuntimeError("No registry contract is deployed at the configured address.")
    account = web3.eth.account.from_key(settings.verifier_private_key.get_secret_value())
    contract = web3.eth.contract(address=address, abi=metadata["abi"])
    cached = (web3, contract, account)
    _contract_cache[cache_key] = cached
    return cached


def check_region(cells: list[bytes], settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    _, contract, _ = _configured_contract(settings)
    free, _ = contract.functions.checkRegion(cells).call()
    return bool(free)


def register_project(
    *,
    name: str,
    cells: list[bytes],
    evidence_hash: str,
    evidence_uri: str,
    score: int,
    credits: int,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    web3, contract, account = _configured_contract(settings)
    if not 1 <= credits <= 1_000_000:
        raise ValueError("Credits must be between 1 and 1,000,000.")

    with _transaction_lock:
        nonce = web3.eth.get_transaction_count(account.address, "pending")
        function = contract.functions.registerProject(
            name,
            account.address,
            cells,
            Web3.to_bytes(hexstr=evidence_hash),
            evidence_uri,
            score,
            credits,
        )
        transaction = {
            "from": account.address,
            "nonce": nonce,
            "chainId": settings.chain_id,
        }
        estimated_gas = int(function.estimate_gas(transaction))
        if estimated_gas > settings.max_gas_limit:
            raise RuntimeError("Estimated registration gas exceeds the configured cap.")
        transaction["gas"] = min(
            settings.max_gas_limit,
            max(21_000, int(estimated_gas * 1.2)),
        )
        fee = web3.eth.fee_history(1, "latest", [50])
        base_fee = int(fee["baseFeePerGas"][-1])
        priority_fee = int(web3.eth.max_priority_fee)
        transaction["maxPriorityFeePerGas"] = priority_fee
        transaction["maxFeePerGas"] = base_fee * 2 + priority_fee
        signed = account.sign_transaction(function.build_transaction(transaction))
        transaction_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = web3.eth.wait_for_transaction_receipt(
            transaction_hash,
            timeout=settings.registration_receipt_timeout_seconds,
            poll_latency=2,
        )
        if receipt["status"] != 1:
            raise RuntimeError("Registration transaction failed.")
        return Web3.to_hex(transaction_hash)
