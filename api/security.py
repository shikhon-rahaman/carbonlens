"""Request-size, response-header, logging, and rate-limit security controls."""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Any

from slowapi import Limiter
from slowapi.util import get_remote_address

MAX_REQUEST_BODY_BYTES = 256 * 1024
limiter = Limiter(key_func=get_remote_address, default_limits=[])
_SECRET_PATTERN = re.compile(
    r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+|"
    r"(api[_-]?key|secret|password|token|private[_-]?key)([\"'=:\s]+)[^\s,\"}]+"
)


def _redact_text(text: str) -> str:
    text = _SECRET_PATTERN.sub(
        lambda match: f"{match.group(1) if match.group(1) else ''}[REDACTED]", text
    )
    for variable in (
        "TURNSTILE_SECRET",
        "RPC_URL",
        "VERIFIER_PRIVATE_KEY",
        "PINATA_JWT",
        "LLM_API_KEY",
    ):
        secret = os.getenv(variable, "")
        if secret and len(secret) >= 4:
            text = text.replace(secret, "[REDACTED]")
    return text


def _redact_value(value: Any, key: str = "") -> Any:
    normalized_key = key.casefold().replace("-", "_")
    if any(
        sensitive in normalized_key
        for sensitive in (
            "secret",
            "password",
            "token",
            "private_key",
            "privatekey",
            "api_key",
            "apikey",
            "authorization",
            "credential",
            "rpc_url",
        )
    ):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(child_key): _redact_value(child, str(child_key)) for child_key, child in value.items()}
    if isinstance(value, list):
        return [_redact_value(child) for child in value]
    if isinstance(value, str):
        return _redact_text(value)
    return value


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        try:
            details: Any = json.loads(record.getMessage())
        except (json.JSONDecodeError, TypeError):
            details = {"event": record.getMessage()}
        if not isinstance(details, dict):
            details = {"event": details}
        sanitized = _redact_value(details)
        sanitized["level"] = record.levelname.lower()
        return json.dumps(sanitized, separators=(",", ":"), ensure_ascii=True)


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("carbonlens.api")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonLogFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


class SecurityMiddleware:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        headers = {
            key.lower(): value
            for key, value in scope.get("headers", [])
        }
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                declared_length = int(raw_length)
            except ValueError:
                declared_length = MAX_REQUEST_BODY_BYTES + 1
            if declared_length > MAX_REQUEST_BODY_BYTES:
                await self._send_error(scope, send, request_id, "Request body exceeds 256 KB.")
                return

        chunks: list[bytes] = []
        total = 0
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > MAX_REQUEST_BODY_BYTES:
                await self._send_error(scope, send, request_id, "Request body exceeds 256 KB.")
                return
            chunks.append(chunk)
            more_body = message.get("more_body", False)

        body = b"".join(chunks)
        replayed = False

        async def replay_body() -> dict[str, Any]:
            nonlocal replayed
            if replayed:
                return {"type": "http.request", "body": b"", "more_body": False}
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        async def add_security_headers(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                response_headers = list(message.get("headers", []))
                response_headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"referrer-policy", b"strict-origin-when-cross-origin"),
                        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                        (b"x-request-id", request_id.encode("ascii")),
                    ]
                )
                if scope.get("scheme") == "https":
                    response_headers.append(
                        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                    )
                if scope.get("method") == "POST":
                    response_headers.append((b"cache-control", b"no-store"))
                message["headers"] = response_headers
            await send(message)

        await self.app(scope, replay_body, add_security_headers)

    async def _send_error(
        self,
        scope: dict[str, Any],
        send: Any,
        request_id: str,
        message: str,
    ) -> None:
        payload = json.dumps(
            {"error": {"code": "request_too_large", "message": message}},
            separators=(",", ":"),
        ).encode("utf-8")
        response_headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(payload)).encode("ascii")),
            (b"x-content-type-options", b"nosniff"),
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
            (b"x-request-id", request_id.encode("ascii")),
        ]
        if scope.get("scheme") == "https":
            response_headers.append(
                (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
            )
        if scope.get("method") == "POST":
            response_headers.append((b"cache-control", b"no-store"))
        await send(
            {"type": "http.response.start", "status": 413, "headers": response_headers}
        )
        await send({"type": "http.response.body", "body": payload})


class UnhandledErrorMiddleware:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except Exception:
            request_id = scope.get("state", {}).get("request_id", "unknown")
            logger = logging.getLogger("carbonlens.api")
            logger.error(
                json.dumps(
                    {
                        "event": "request_failed",
                        "request_id": request_id,
                        "path": scope.get("path", ""),
                    },
                    separators=(",", ":"),
                )
            )
            payload = json.dumps(
                {
                    "error": {
                        "code": "internal_error",
                        "message": "An internal error occurred. Contact support with the request ID.",
                    }
                },
                separators=(",", ":"),
            ).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(payload)).encode("ascii")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": payload})
