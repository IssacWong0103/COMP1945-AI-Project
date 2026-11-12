from __future__ import annotations

import asyncio
import json
import logging
from io import BytesIO
from pathlib import Path

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
    code = payload.get("code")
    if code is not None and str(code) != "200":
        message = str(payload.get("msg") or "kie.ai rejected the request")
        logger.warning("kie.ai createTask rejected (%s): %s", code, message)
        raise TryOnFailed(message)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    task_id = (data or {}).get("taskId") or (data or {}).get("task_id") or payload.get("taskId")
    if not task_id:
        logger.warning("kie.ai createTask returned no taskId: %s", str(payload)[:500])
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


async def generate_tryon(
    *,
    outfit_id: str,
    body_photo_url: str | None,
    face_photo_url: str | None = None,
    garments: list[dict],
    styling_note: str | None = None,
    model_reference_url: str | None = None,
    gender: str | None = None,
    skin_tone: str | None = None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
    existing_task_id: str | None = None,
) -> tuple[str, str | None, str | None]:
    """
    Returns (status, try_on_url, kie_task_id).
    status is 'ready' or 'processing'.
    """
    body_path = local_path_for(body_photo_url or "")
    stem = f"{outfit_id}"
    prompt = build_tryon_prompt(
        garments,
        gender=gender,
        skin_tone=skin_tone,
        height_cm=height_cm,
        weight_kg=weight_kg,
    )
    if face_photo_url:
        prompt += (
            " A separate close-up face photo is provided as an additional reference; "
            "use it to preserve the exact facial identity."
        )
    if styling_note:
        prompt += f" Style guidance from a reference model look: {styling_note.strip()}."
    if model_reference_url:
        prompt += (
            " A reference model photo is provided as a styling-only reference; "
            "copy only the model's styling, pose, layering, tucks, cuffs and proportions, "
            "but keep the user's exact garments, colours, and identity unchanged."
        )

    can_call_kie = bool(settings.kie_api_key.strip()) and settings.public_uploads_reachable()
    input_urls: list[str] = []
    if can_call_kie:
        body_public = public_url_for(body_photo_url or "")
        if body_public:
            input_urls.append(body_public)
        if face_photo_url:
            face_public = public_url_for(face_photo_url)
            if face_public:
                input_urls.append(face_public)
        for item in garments:
            url = public_url_for(str(item.get("imageUrl") or item.get("image_url") or ""))
            if url:
                input_urls.append(url)
        if model_reference_url:
            ref_public = public_url_for(model_reference_url)
            if ref_public:
                input_urls.append(ref_public)
        if len(input_urls) < 2:
            can_call_kie = False

    if not can_call_kie:
        logger.info("Using PIL try-on collage (missing KIE key or public image URLs)")
        url = save_fallback_collage(body_path, garments, stem=stem)
        return "ready", url, None

    try:
        task_id = existing_task_id or await _create_kie_task(prompt, input_urls)
        result_url = await _poll_kie_task(task_id)
        local_url = await _download_result(result_url, stem=stem)
        return "ready", local_url, task_id
    except TryOnPending as pending:
        return "processing", None, pending.task_id
    except Exception as exc:  # noqa: BLE001
        logger.warning("kie.ai try-on failed (%s); using collage fallback", exc)
        url = save_fallback_collage(body_path, garments, stem=stem)
        return "ready", url, existing_task_id
