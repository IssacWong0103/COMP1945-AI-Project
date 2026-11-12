from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps

from app.config import settings

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_IMAGE_EDGE = 2048
JPEG_QUALITY = 88
ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "jpg", "WEBP": "jpg"}
UPLOAD_SUBDIRS = ("wardrobe", "profile", "tryon", "reference")


def ensure_upload_dirs() -> None:
    for name in UPLOAD_SUBDIRS:
        (settings.uploads_dir / name).mkdir(parents=True, exist_ok=True)


def public_url_for(image_url: str) -> str | None:
    """Absolute URL kie.ai can fetch, or None if we only have a local path."""
    image_url = (image_url or "").strip()
    if not image_url:
        return None
    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url
    if not settings.public_uploads_reachable():
        return None
    path = image_url if image_url.startswith("/") else f"/{image_url}"
    return f"{settings.normalized_public_base_url()}{path}"


def local_path_for(image_url: str) -> Path | None:
    if not image_url.startswith("/uploads/"):
        return None
    relative = image_url.removeprefix("/uploads/")
    path = settings.uploads_dir / relative
    if path.is_file():
        return path
    return None


def _sniff_format(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return ""


def _open_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="File is not a valid image.") from exc
    fmt = (image.format or _sniff_format(data) or "").upper()
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail="Only jpeg, png, and webp images are accepted.",
        )
    image = ImageOps.exif_transpose(image) or image
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    elif image.mode == "L":
        image = image.convert("RGB")
    return image


def _resize(image: Image.Image) -> Image.Image:
    width, height = image.size
    edge = max(width, height)
    if edge <= MAX_IMAGE_EDGE:
        return image
    scale = MAX_IMAGE_EDGE / edge
    new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


async def save_upload(file: UploadFile, subdir: str) -> tuple[Path, str]:
    if subdir not in UPLOAD_SUBDIRS:
        raise ValueError(f"Unknown upload subdir: {subdir}")
    ensure_upload_dirs()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (max 12MB).")

    content_type = (file.content_type or "").lower()
    if content_type and content_type not in {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/octet-stream",
    }:
        raise HTTPException(
            status_code=400,
            detail="Only jpeg, png, and webp images are accepted.",
        )

    image = _resize(_open_image(data))
    item_id = str(uuid.uuid4())
    filename = f"{item_id}.jpg"
    dest = settings.uploads_dir / subdir / filename
    image.save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return dest, f"/uploads/{subdir}/{filename}"


def save_jpeg_bytes(data: bytes, subdir: str, stem: str | None = None) -> str:
    ensure_upload_dirs()
    name = f"{stem or uuid.uuid4()}.jpg"
    dest = settings.uploads_dir / subdir / name
    dest.write_bytes(data)
    return f"/uploads/{subdir}/{name}"


def save_pil_image(image: Image.Image, subdir: str, stem: str | None = None) -> str:
    ensure_upload_dirs()
    if image.mode != "RGB":
        image = image.convert("RGB")
    name = f"{stem or uuid.uuid4()}.jpg"
    dest = settings.uploads_dir / subdir / name
    image.save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return f"/uploads/{subdir}/{name}"


def save_reference_copy(src_path: Path, stem: str) -> str | None:
    """Copy an external image (e.g. a fashion-DB model photo) into uploads.

    Returns the /uploads/... path, or None if the source cannot be read.
    """
    try:
        image = Image.open(src_path)
        image.load()
        image = ImageOps.exif_transpose(image) or image
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")
    except Exception:  # noqa: BLE001
        return None
    image = _resize(image)
    ensure_upload_dirs()
    name = f"{stem}.jpg"
    dest = settings.uploads_dir / "reference" / name
    image.save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return f"/uploads/reference/{name}"
