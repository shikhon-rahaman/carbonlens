"""Validated server settings and production startup requirements."""

from __future__ import annotations

from functools import lru_cache
from typing import Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: str = "development"
    allowed_origins: str = "http://localhost:3000"
    database_url: str = "sqlite:///./carbonlens.db"
    turnstile_secret: SecretStr | None = None
    turnstile_dev_bypass: bool = False
    cached_demo_mode: bool = False
    rpc_url: SecretStr | None = None
    chain_id: int | None = Field(default=None, gt=0)
    contract_address: str | None = None
    verifier_private_key: SecretStr | None = None
    pinata_jwt: SecretStr | None = None
    score_threshold: int = Field(default=70, ge=50, le=95)
    daily_registration_cap: int = Field(default=20, ge=1, le=100_000)
    max_concurrent_verifications: int = Field(default=2, ge=1, le=16)
    max_gas_limit: int = Field(default=1_000_000, ge=21_000, le=10_000_000)
    registration_receipt_timeout_seconds: int = Field(default=60, ge=5, le=300)

    @field_validator(
        "turnstile_secret",
        "rpc_url",
        "verifier_private_key",
        "pinata_jwt",
        mode="before",
    )
    @classmethod
    def empty_secrets_are_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("contract_address", mode="before")
    @classmethod
    def empty_contract_address_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("chain_id", mode="before")
    @classmethod
    def empty_chain_id_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip().rstrip("/") for origin in self.allowed_origins.split(",")]
        return [origin for origin in origins if origin]

    @model_validator(mode="after")
    def validate_deployment_settings(self) -> Self:
        if not self.allowed_origins.strip() and self.env.lower() == "development":
            self.allowed_origins = "http://localhost:3000"
        if any("*" in origin for origin in self.cors_origins):
            raise ValueError("ALLOWED_ORIGINS must not contain a wildcard.")
        if not self.cors_origins:
            raise ValueError("ALLOWED_ORIGINS must contain at least one origin.")
        for origin in self.cors_origins:
            parsed_origin = urlsplit(origin)
            if (
                parsed_origin.scheme not in {"http", "https"}
                or not parsed_origin.netloc
                or parsed_origin.username is not None
                or parsed_origin.password is not None
                or parsed_origin.path
                or parsed_origin.query
                or parsed_origin.fragment
            ):
                raise ValueError("ALLOWED_ORIGINS must contain valid HTTP(S) origins.")
        if self.env.lower() in {"production", "prod"}:
            required = {
                "ALLOWED_ORIGINS": self.allowed_origins,
                "RPC_URL": self.rpc_url,
                "CHAIN_ID": self.chain_id,
                "CONTRACT_ADDRESS": self.contract_address,
                "VERIFIER_PRIVATE_KEY": self.verifier_private_key,
                "TURNSTILE_SECRET": self.turnstile_secret,
            }
            missing = [
                name
                for name, value in required.items()
                if value is None
                or isinstance(value, SecretStr)
                and not value.get_secret_value().strip()
                or isinstance(value, str)
                and not value.strip()
            ]
            if missing:
                raise ValueError(
                    "Missing required production settings: " + ", ".join(missing)
                )
            if self.turnstile_dev_bypass:
                raise ValueError("Turnstile development bypass is not allowed in production.")
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise ValueError("Production DATABASE_URL must use PostgreSQL.")
        if self.env.lower() != "development" and self.turnstile_dev_bypass:
            raise ValueError("Turnstile bypass is allowed only in development.")
        if self.env.lower() != "development" and self.cached_demo_mode:
            raise ValueError("Cached demo mode is allowed only in development.")
        if self.contract_address is not None:
            if len(self.contract_address) != 42 or not self.contract_address.startswith("0x"):
                raise ValueError("CONTRACT_ADDRESS must be a 20-byte hexadecimal address.")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
