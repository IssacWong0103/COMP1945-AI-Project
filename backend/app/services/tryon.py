from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.services.storage import local_path_for, public_url_for, save_jpeg_bytes, save_pil_image

logger = logging.getLogger(__name__)

KIE_CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
KIE_STATUS_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"
KIE_MODEL = "gpt-image-2-image-to-image"
POLL_TIMEOUT_S = 90.0
INITIAL_BACKOFF_S = 2.0
MAX_BACKOFF_S = 16.0

CANVAS_W = 900
CANVAS_H = 1350


def build_tryon_prompt(
    garments: list[dict],
    *,
    gender: str | None = None,
    skin_tone: str | None = None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
) -> str:
    lines = []
    for item in garments:
        lines.append(
            f"- {item.get('category', 'garment')}: {item.get('color', '')} "
            f"{item.get('description') or item.get('cut') or ''}".strip()
        )
    garment_block = "\n".join(lines) if lines else "- wardrobe garments provided as reference images"
    profile_bits = []
    if gender and gender not in {"preferNot", "nonBinary"}:
        profile_bits.append(f"apparent gender presentation: {gender}")
    if skin_tone:
        profile_bits.append(f"skin tone: {skin_tone}")
    if height_cm:
        profile_bits.append(f"height about {int(height_cm)} cm")
    if weight_kg:
        profile_bits.append(f"weight about {int(round(weight_kg))} kg")
    profile_line = "; ".join(profile_bits)
    extra = f" Respect these attributes: {profile_line}." if profile_line else ""
    return (
        "Virtual try-on for a HKUST student campus look. "
        "Keep the SAME person from the first photo: same face, identity, body shape, "
        "skin tone, hair, and pose. Do not age, beautify, sexualize, or change identity. "
        "Dress them in the listed garments using the additional reference images. "
        "Photorealistic full-body photo, modest clothing, campus-appropriate lighting. "
        "Natural fabric drape; garments should fit the existing body. "
        f"Garments:\n{garment_block}.{extra} "
        "Output a realistic full-body photograph, not an illustration."
    )


def _load_font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _open_rgb(path: Path) -> Image.Image:
    image = Image.open(path)
    image = image.convert("RGB")
    return image


def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    src_w, src_h = image.size
    scale = max(target_w / src_w, target_h / src_h)
    resized = image.resize((max(1, int(src_w * scale)), max(1, int(src_h * scale))), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - target_w) // 2)
    top = max(0, (resized.height - target_h) // 2)
    return resized.crop((left, top, left + target_w, top + target_h))


def _contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, (245, 245, 242))
    x = (size[0] - copy.width) // 2
    y = (size[1] - copy.height) // 2
    canvas.paste(copy, (x, y))
    return canvas


def build_fallback_collage(
    body_path: Path | None,
    garments: list[dict],
) -> Image.Image:
    """Body photo with garment thumbnails and labels so the UI still has an image."""
    bg = (248, 247, 243)
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), bg)
    draw = ImageDraw.Draw(canvas)
    title_font = _load_font(28)
    label_font = _load_font(16)
    small_font = _load_font(14)

    draw.rectangle((0, 0, CANVAS_W, 64), fill=(20, 45, 90))
    draw.text((24, 18), "USTyle try-on preview", font=title_font, fill=(255, 255, 255))

    body_area = (24, 88, 560, CANVAS_H - 24)
    body_w = body_area[2] - body_area[0]
    body_h = body_area[3] - body_area[1]
    if body_path and body_path.is_file():
        body = _cover(_open_rgb(body_path), (body_w, body_h))
        canvas.paste(body, (body_area[0], body_area[1]))
    else:
        draw.rectangle(body_area, fill=(230, 232, 236))
        draw.text(
            (body_area[0] + 40, body_area[1] + body_h // 2),
            "No body photo yet",
            font=title_font,
            fill=(80, 80, 80),
        )

    rail_x = 584
    draw.text((rail_x, 88), "Outfit pieces", font=label_font, fill=(20, 45, 90))
    y = 118
    thumb_size = (280, 200)
    for item in garments[:5]:
        path = local_path_for(str(item.get("imageUrl") or item.get("image_url") or ""))
        box = (rail_x, y, rail_x + thumb_size[0], y + thumb_size[1])
        if path and path.is_file():
            thumb = _contain(_open_rgb(path), thumb_size)
            canvas.paste(thumb, (rail_x, y))
        else:
            draw.rectangle(box, fill=(230, 232, 236))
        label = f"{item.get('color', '')} {item.get('category', '')}".strip()
        desc = str(item.get("description") or "")[:42]
        draw.rectangle((rail_x, y + thumb_size[1], rail_x + thumb_size[0], y + thumb_size[1] + 44), fill=(20, 45, 90))
        draw.text((rail_x + 8, y + thumb_size[1] + 4), label, font=small_font, fill=(255, 255, 255))
        draw.text((rail_x + 8, y + thumb_size[1] + 22), desc, font=small_font, fill=(210, 220, 235))
        y += thumb_size[1] + 56
        if y > CANVAS_H - 80:
            break

    draw.text(
        (24, CANVAS_H - 22),
        "Fallback collage (local preview)",
        font=small_font,
        fill=(120, 120, 120),
    )
    return canvas


def save_fallback_collage(
    body_path: Path | None,
    garments: list[dict],
    stem: str,
) -> str:
    collage = build_fallback_collage(body_path, garments)
    return save_pil_image(collage, "tryon", stem=stem)


class TryOnPending(Exception):
    def __init__(self, task_id: str) -> None:
        super().__init__("try-on still processing")
        self.task_id = task_id


class TryOnFailed(Exception):
    pass


FAILURE_DETAIL = {
    "missing_key": (
        "No try-on provider key is configured. Retry after it is set, "
        "or show a local preview instead."
    ),
    "local_images_not_public": (
        "These photos are not on a public URL, so the provider cannot fetch them. "
        "Retry once they are reachable, or show a local preview instead."
    ),
    "missing_inputs": (
        "This request does not include enough photos for the provider. "
        "Retry, or show a local preview instead."
    ),
    "provider_error": (
        "The try-on provider could not generate an image. "
        "Retry, or show a local preview instead."
    ),
    "timeout": (
        "The try-on provider timed out. Retry, or show a local preview instead."
    ),
}

PREVIEW_DETAIL = {
    "missing_key": "Local preview only. The try-on provider key is not configured.",
    "local_images_not_public": "Local preview only. Input photos are not on a public URL.",
    "missing_inputs": "Local preview only. Not enough photos for the provider.",
    "provider_error": "Local preview only. The try-on provider returned an error.",
    "timeout": "Local preview only. The try-on provider timed out.",
}


@dataclass
class TryOnResult:
    status: str
    try_on_url: str | None
    task_id: str | None = None
    result_kind: str | None = None
    fallback_reason: str | None = None
    detail: str | None = None
    style_reference_url: str | None = None


def _public_image_url(image_url: str) -> str | None:
    raw = image_url.strip()
    if not raw:
        return None
    url = public_url_for(raw)
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.path in {"", "/"}:
        return None
    return url


def _collect_input_urls(body_photo_url: str | None, garments: list[dict]) -> list[str]:
    urls: list[str] = []
    body = _public_image_url(body_photo_url or "")
    if body:
        urls.append(body)
    for item in garments:
        raw = str(item.get("imageUrl") or item.get("image_url") or "")
        url = _public_image_url(raw)
        if url:
            urls.append(url)
    return urls


def tryon_block_reason(body_photo_url: str | None, garments: list[dict]) -> str | None:
    """Why kie.ai cannot run, or None when the provider call is possible.

    missing_key wins over a public-URL misconfig so the first setup gap is reported.
    The body photo has to be one of the public input URLs. Local uploads without a
    public origin are local_images_not_public, not a ready collage.
    """
    if not settings.kie_api_key.strip():
        return "missing_key"
    body = _public_image_url(body_photo_url or "")
    urls = _collect_input_urls(body_photo_url, garments)
    if body and len(urls) >= 2:
        return None
    if not settings.public_uploads_reachable():
        return "local_images_not_public"
    return "missing_inputs"


def _parse_result_urls(payload: dict) -> str | None:
    data = payload.get("data") or payload
    result_json = data.get("resultJson") if isinstance(data, dict) else None
    parsed: dict | list | None = None
    if isinstance(result_json, str) and result_json.strip():
        try:
            parsed = json.loads(result_json)
        except json.JSONDecodeError:
            parsed = None
    elif isinstance(result_json, dict):
        parsed = result_json
    if isinstance(parsed, dict):
        urls = parsed.get("resultUrls") or parsed.get("result_urls") or []
        if urls:
            return str(urls[0])
    if isinstance(data, dict):
        for key in ("resultUrls", "result_urls", "resultUrl"):
            value = data.get(key)
            if isinstance(value, list) and value:
                return str(value[0])
            if isinstance(value, str) and value.startswith("http"):
                return value
    return None


def _task_state(payload: dict) -> str:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    state = str(
        (data or {}).get("state")
        or (data or {}).get("status")
        or payload.get("state")
        or payload.get("status")
        or ""
    ).lower()
    return state


async def _create_kie_task(prompt: str, input_urls: list[str]) -> str:
    headers = {
        "Authorization": f"Bearer {settings.kie_api_key.strip()}",
        "Content-Type": "application/json",
    }
    body = {
        "model": KIE_MODEL,
        "input": {
            "prompt": prompt,
            "input_urls": input_urls,
            "aspect_ratio": "2:3",
            "resolution": "1K",
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(KIE_CREATE_URL, headers=headers, json=body)
        response.raise_for_status()
        payload = response.json()
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    task_id = (data or {}).get("taskId") or (data or {}).get("task_id") or payload.get("taskId")
    if not task_id:
        raise TryOnFailed("kie.ai did not return a taskId")
    return str(task_id)


async def _poll_kie_task(task_id: str) -> str:
    headers = {"Authorization": f"Bearer {settings.kie_api_key.strip()}"}
    delay = INITIAL_BACKOFF_S
    elapsed = 0.0
    async with httpx.AsyncClient(timeout=20.0) as client:
        while elapsed < POLL_TIMEOUT_S:
            await asyncio.sleep(delay)
            elapsed += delay
            response = await client.get(KIE_STATUS_URL, headers=headers, params={"taskId": task_id})
            response.raise_for_status()
            payload = response.json()
            state = _task_state(payload)
            if state in {"success", "succeed", "succeeded", "completed", "complete"}:
                url = _parse_result_urls(payload)
                if not url:
                    raise TryOnFailed("kie.ai succeeded but returned no result URL")
                return url
            if state in {"fail", "failed", "error", "canceled", "cancelled"}:
                data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
                message = (data or {}).get("failMsg") or (data or {}).get("message") or state
                raise TryOnFailed(str(message))
            if state not in {"waiting", "queuing", "generating", "pending", "processing", ""}:
                logger.info("Unexpected kie.ai state %s for task %s", state, task_id)
            delay = min(MAX_BACKOFF_S, delay * 2)
    raise TryOnPending(task_id)


async def _download_result(url: str, stem: str) -> str:
    async with httpx.AsyncClient(timeout=40.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.content
    try:
        image = Image.open(BytesIO(data))
        image.load()
        buffer = BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=88)
        return save_jpeg_bytes(buffer.getvalue(), "tryon", stem=stem)
    except Exception:  # noqa: BLE001
        return save_jpeg_bytes(data, "tryon", stem=stem)


def _blocked_result(
    reason: str,
    *,
    accept_preview: bool,
    body_path: Path | None,
    garments: list[dict],
    stem: str,
    task_id: str | None,
    style_reference_url: str | None,
) -> TryOnResult:
    """Collage only when the student asked for a local preview. Otherwise status failed."""
    if accept_preview:
        url = save_fallback_collage(body_path, garments, stem=stem)
        logger.info("Returning local try-on preview (%s)", reason)
        return TryOnResult(
            status="ready",
            try_on_url=url,
            task_id=task_id,
            result_kind="collage",
            fallback_reason=reason,
            detail=PREVIEW_DETAIL.get(reason),
            style_reference_url=style_reference_url,
        )
    logger.info("Try-on provider unavailable (%s); not returning a collage", reason)
    return TryOnResult(
        status="failed",
        try_on_url=None,
        task_id=task_id,
        result_kind=None,
        fallback_reason=reason,
        detail=FAILURE_DETAIL.get(reason),
        style_reference_url=style_reference_url,
    )


async def generate_tryon(
    *,
    outfit_id: str,
    body_photo_url: str | None,
    garments: list[dict],
    gender: str | None = None,
    skin_tone: str | None = None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
    existing_task_id: str | None = None,
    accept_preview: bool = False,
    style_reference_url: str | None = None,
) -> TryOnResult:
    """
    Returns a try-on outcome.

    status is ready or failed. result_kind is generated or collage whenever a URL
    is returned. A collage is ready only when accept_preview is true. If the
    provider wait elapses, status is failed and fallback_reason is timeout.
    """
    body_path = local_path_for(body_photo_url or "")
    stem = f"{outfit_id}"
    reference = (style_reference_url or "").strip() or None
    prompt = build_tryon_prompt(
        garments,
        gender=gender,
        skin_tone=skin_tone,
        height_cm=height_cm,
        weight_kg=weight_kg,
    )

    reason = tryon_block_reason(body_photo_url, garments)
    input_urls = _collect_input_urls(body_photo_url, garments)
    if reason:
        return _blocked_result(
            reason,
            accept_preview=accept_preview,
            body_path=body_path,
            garments=garments,
            stem=stem,
            task_id=existing_task_id,
            style_reference_url=reference,
        )

    try:
        task_id = existing_task_id or await _create_kie_task(prompt, input_urls)
        result_url = await _poll_kie_task(task_id)
        local_url = await _download_result(result_url, stem=stem)
        return TryOnResult(
            status="ready",
            try_on_url=local_url,
            task_id=task_id,
            result_kind="generated",
            style_reference_url=reference,
        )
    except TryOnPending as pending:
        return _blocked_result(
            "timeout",
            accept_preview=accept_preview,
            body_path=body_path,
            garments=garments,
            stem=stem,
            task_id=pending.task_id,
            style_reference_url=reference,
        )
    except (httpx.TimeoutException, TimeoutError):
        return _blocked_result(
            "timeout",
            accept_preview=accept_preview,
            body_path=body_path,
            garments=garments,
            stem=stem,
            task_id=existing_task_id,
            style_reference_url=reference,
        )
    except (httpx.HTTPError, TryOnFailed) as exc:
        logger.warning("kie.ai try-on failed (%s)", type(exc).__name__)
        return _blocked_result(
            "provider_error",
            accept_preview=accept_preview,
            body_path=body_path,
            garments=garments,
            stem=stem,
            task_id=existing_task_id,
            style_reference_url=reference,
        )
