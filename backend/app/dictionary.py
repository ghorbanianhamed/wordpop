"""Auto-fill meaning, example and pronunciation.

Tries two free sources:
1. Free Dictionary API (dictionaryapi.dev) - single words, with phonetics and audio
2. Wiktionary - also knows phrases and idioms ("figure out", "break the ice")
"""

import html
import logging
import re
from urllib.parse import quote

import httpx

from .config import get_settings

log = logging.getLogger("wordpop.dictionary")

WIKTIONARY_API = "https://en.wiktionary.org/api/rest_v1/page/definition/"
HEADERS = {
    # Some APIs (Wikimedia in particular) reject requests without a descriptive User-Agent.
    "User-Agent": "WordPop/2.2 (vocabulary learning app; https://github.com/ghorbanianhamed/wordpop)",
    "Accept": "application/json",
}


def lookup(word: str) -> dict | None:
    """Return {meaning, example, phonetic, audio_url, part_of_speech} or None."""
    word = " ".join(word.strip().split())
    if not word:
        return None
    for source in (_free_dictionary, _wiktionary):
        result = source(word)
        if result:
            return result
    log.info("No dictionary entry for %r in any source", word)
    return None


def _get_json(url: str):
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=8, follow_redirects=True)
    except httpx.HTTPError as exc:
        log.warning("Dictionary request failed (%s): %s", url.split("/")[2], exc)
        return None
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        log.warning("Dictionary %s answered HTTP %s", url.split("/")[2], resp.status_code)
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def _free_dictionary(word: str) -> dict | None:
    data = _get_json(get_settings().dictionary_api + quote(word.lower()))
    return parse(data) if data else None


def _wiktionary(word: str) -> dict | None:
    for candidate in dict.fromkeys([word, word.lower()]):  # try as typed, then lowercase
        data = _get_json(WIKTIONARY_API + quote(candidate.replace(" ", "_")))
        result = parse_wiktionary(data) if data else None
        if result:
            return result
    return None


def parse(data: list) -> dict | None:
    """Parse a dictionaryapi.dev response."""
    if not isinstance(data, list) or not data:
        return None
    result = {"meaning": "", "example": "", "phonetic": "", "audio_url": "", "part_of_speech": ""}
    for entry in data:
        if not result["phonetic"]:
            result["phonetic"] = entry.get("phonetic") or ""
        for ph in entry.get("phonetics", []):
            if not result["phonetic"] and ph.get("text"):
                result["phonetic"] = ph["text"]
            audio = ph.get("audio") or ""
            # North American recordings are closest to the Canadian accent the app prefers.
            if audio and (not result["audio_url"] or ("-us." in audio and "-us." not in result["audio_url"])):
                result["audio_url"] = audio
        for meaning in entry.get("meanings", []):
            for d in meaning.get("definitions", []):
                if not result["meaning"] and d.get("definition"):
                    result["meaning"] = d["definition"]
                    result["part_of_speech"] = meaning.get("partOfSpeech", "")
                if not result["example"] and d.get("example"):
                    result["example"] = d["example"]
    return result if result["meaning"] else None


_TAGS = re.compile(r"<[^>]+>")


def _clean(fragment: str) -> str:
    return " ".join(html.unescape(_TAGS.sub("", fragment or "")).split())


def parse_wiktionary(data: dict) -> dict | None:
    """Parse a Wiktionary REST 'definition' response (English entries only)."""
    if not isinstance(data, dict):
        return None
    for entry in data.get("en", []):
        for d in entry.get("definitions", []):
            meaning = _clean(d.get("definition", ""))
            if not meaning:
                continue
            example = ""
            for ex in d.get("parsedExamples", []) or []:
                example = _clean(ex.get("example", ""))
                if example:
                    break
            if not example:
                for ex in d.get("examples", []) or []:
                    example = _clean(ex)
                    if example:
                        break
            return {
                "meaning": meaning,
                "example": example,
                "phonetic": "",
                "audio_url": "",
                "part_of_speech": (entry.get("partOfSpeech") or "").lower(),
            }
    return None
