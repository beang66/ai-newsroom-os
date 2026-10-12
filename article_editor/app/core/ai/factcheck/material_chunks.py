"""Shared source chunk construction; preserves the fact-check evidence format."""
from .chunker import chunk_document
from .semantic_chunker_v3 import clean as _clean


def build_material_chunks(material):
    content = _clean(material.get("content") or material.get("summary") or "")
    if not content:
        return []

    meta = {
        "source": "frontend",
        "title": material.get("title"),
        "date": material.get("date"),
    }
    units = chunk_document(content, meta)
    return material_chunks_from_body(material, [
        {"text": u.text, "kind": u.kind, "field": u.field} for u in units
    ])


def material_chunks_from_body(material, body):
    """Attach current request metadata without re-chunking the stored body."""
    if not _clean(material.get("content") or material.get("summary") or ""):
        return []
    rows = [
        {
            **row,
            "material_id": material.get("id"),
            "material_title": material.get("title") or "취재 자료",
            "material_date": material.get("date"),
            "speaker": material.get("speaker") or material.get("outletOrSpeaker") or "",
        }
        for row in body
    ]

    # Preserve source identity as a searchable unit without altering the original body.
    title = _clean(material.get("title") or "")
    speaker = _clean(material.get("speaker") or material.get("outletOrSpeaker") or "")
    date = _clean(material.get("date") or "")
    if title or speaker or date:
        rows.insert(0, {
            "text": f"자료명: {title}. 출처/화자: {speaker}. 날짜: {date}.",
            "kind": "metadata",
            "field": "source_identity",
            "material_id": material.get("id"),
            "material_title": title or "취재 자료",
            "material_date": date or None,
            "speaker": speaker,
        })
    return rows

