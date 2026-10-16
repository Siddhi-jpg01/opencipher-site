"""
Talks to the open-weight model.

  provider "ollama": POST {OLLAMA_URL}/api/chat           (default, runs locally)
  provider "openai": POST {LLM_BASE_URL}/chat/completions  (LM Studio, OpenRouter, Groq ...)

complete_json() always returns a Python dict, retrying once if the model's
answer isn't valid JSON.
"""
import json
import re
from typing import Optional

import httpx

from . import config


class LLMError(Exception):
    pass


THINK_RE = re.compile(r"<think>.*?</think>", re.S)


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model answer."""
    text = THINK_RE.sub("", text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        chunk = text[start:end + 1]
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            # common small-model slip: trailing commas
            chunk = re.sub(r",\s*([}\]])", r"\1", chunk)
            return json.loads(chunk)
    raise json.JSONDecodeError("No JSON object found", text, 0)


async def _chat(messages: list[dict], json_mode: bool, max_tokens: int) -> str:
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
        try:
            if config.LLM_PROVIDER == "ollama":
                body = {
                    "model": config.LLM_MODEL, "messages": messages, "stream": False, "think": False,
                    "options": {"temperature": 0.3, "num_ctx": config.LLM_CONTEXT, "num_predict": max_tokens},
                }
                if json_mode:
                    body["format"] = "json"
                r = await client.post(f"{config.OLLAMA_URL}/api/chat", json=body)
                if r.status_code == 400 and "think" in r.text:      # older Ollama without the think flag
                    body.pop("think", None)
                    r = await client.post(f"{config.OLLAMA_URL}/api/chat", json=body)
                if r.status_code == 404:
                    raise LLMError(f"Ollama doesn't have the model '{config.LLM_MODEL}'. Run: ollama pull {config.LLM_MODEL}")
                r.raise_for_status()
                return r.json()["message"]["content"]
            else:
                headers = {"Authorization": f"Bearer {config.LLM_API_KEY}"} if config.LLM_API_KEY else {}
                body = {"model": config.LLM_MODEL, "messages": messages, "temperature": 0.3, "max_tokens": max_tokens}
                if json_mode:
                    body["response_format"] = {"type": "json_object"}
                r = await client.post(f"{config.LLM_BASE_URL}/chat/completions", json=body, headers=headers)
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        except httpx.ConnectError as e:
            where = config.OLLAMA_URL if config.LLM_PROVIDER == "ollama" else config.LLM_BASE_URL
            raise LLMError(f"Can't reach the AI model at {where}. Is Ollama running?") from e
        except httpx.TimeoutException as e:
            raise LLMError("The AI model took too long to answer.") from e
        except httpx.HTTPStatusError as e:
            raise LLMError(f"The AI model returned an error ({e.response.status_code}).") from e


SYSTEM_JSON = ("You are OpenCipher, a patient mentor who helps complete beginners make their first open-source "
               "contribution. Write in plain, friendly English. Never invent files, commands or facts that aren't "
               "supported by the repository data you are given. Answer ONLY with one valid JSON object.")


async def complete_json(prompt: str, max_tokens: int = 3000) -> dict:
    messages = [{"role": "system", "content": SYSTEM_JSON},
                {"role": "user", "content": prompt + "\n\n/no_think"}]
    raw = await _chat(messages, json_mode=True, max_tokens=max_tokens)
    try:
        return extract_json(raw)
    except (json.JSONDecodeError, ValueError):
        messages += [{"role": "assistant", "content": raw[:4000]},
                     {"role": "user", "content": "That was not valid JSON. Reply again with ONLY the JSON object, no other text. /no_think"}]
        raw = await _chat(messages, json_mode=True, max_tokens=max_tokens)
        try:
            return extract_json(raw)
        except (json.JSONDecodeError, ValueError) as e:
            raise LLMError("The AI model didn't return valid JSON.") from e


async def complete_text(system: str, messages: list[dict], max_tokens: int = 700) -> str:
    msgs = [{"role": "system", "content": system}] + messages
    if msgs[-1]["role"] == "user":
        msgs[-1] = {"role": "user", "content": msgs[-1]["content"] + " /no_think"}
    out = await _chat(msgs, json_mode=False, max_tokens=max_tokens)
    return THINK_RE.sub("", out).strip()


async def health() -> dict:
    """Is the model reachable and installed?"""
    info = {"provider": config.LLM_PROVIDER, "model": config.LLM_MODEL, "reachable": False, "detail": ""}
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            if config.LLM_PROVIDER == "ollama":
                r = await client.get(f"{config.OLLAMA_URL}/api/tags")
                r.raise_for_status()
                names = [m.get("name", "") for m in r.json().get("models", [])]
                want = config.LLM_MODEL if ":" in config.LLM_MODEL else config.LLM_MODEL + ":latest"
                info["reachable"] = any(n == want or n == config.LLM_MODEL for n in names)
                if not info["reachable"]:
                    info["detail"] = f"Ollama is running but '{config.LLM_MODEL}' isn't installed. Run: ollama pull {config.LLM_MODEL}"
            else:
                headers = {"Authorization": f"Bearer {config.LLM_API_KEY}"} if config.LLM_API_KEY else {}
                r = await client.get(f"{config.LLM_BASE_URL}/models", headers=headers)
                info["reachable"] = r.status_code < 400
    except httpx.HTTPError:
        info["detail"] = "Ollama isn't running. Start the Ollama app, then refresh." if config.LLM_PROVIDER == "ollama" else "Can't reach the model server."
    return info
