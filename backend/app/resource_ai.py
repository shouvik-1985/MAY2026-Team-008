from __future__ import annotations

import base64
from io import BytesIO
import json
import re
import zipfile
import zlib
from typing import Any
from xml.etree import ElementTree

import requests

from app.models import StudyResource
from app.resource_files import local_study_resource_path


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENAI_FILES_URL = "https://api.openai.com/v1/files"
MAX_SOURCE_CHARS = 100000
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DIRECT_FILE_BYTES = 40 * 1024 * 1024

PDF_ARTIFACT_PATTERNS = (
    "/ObjStm",
    "/FlateDecode",
    "/Subtype",
    "/Filter",
    "/Length",
    "endobj",
    "endstream",
    "xref",
    "startxref",
)


def build_study_resource_ai_summary(*, item: StudyResource, api_key: str, model: str) -> dict[str, Any]:
    model_name = model or "gpt-5.4-mini"
    source = _resource_source(item)
    payload = {
        "resource": {
            "title": item.title,
            "subject": item.subject,
            "type": item.resource_type,
            "filename": item.filename,
            "content_type": item.content_type,
            "file_size": item.file_size,
            "published_at": item.created_at.isoformat() if item.created_at else None,
        },
        "source_text": source["text"][:MAX_SOURCE_CHARS],
        "source_status": source["status"],
        "source_note": source["note"],
        "json_schema": {
            "full_explanation": (
                "A deep, teacher-style explanation of the uploaded study resource in 6 to 10 paragraphs. "
                "Do not describe only what the file contains; teach the actual ideas."
            ),
            "concept_explanations": [
                {
                    "heading": "Concept name from the resource",
                    "explanation": "Detailed explanation in student-friendly language",
                    "example": "Concrete example, mini walkthrough, or analogy grounded in the material",
                }
            ],
            "important_points": ["5 to 8 important points after the explanation"],
            "practice_guidance": ["4 to 6 practice steps tied to the explained concepts"],
            "quiz": [{"question": "string", "answer": "string"}],
        },
    }

    image_data_url = _image_data_url(item, source["data"])
    openai_file_id = _upload_openai_file(api_key=api_key, item=item, data=source["data"])
    try:
        response = _call_openai(
            api_key=api_key,
            model=model_name,
            payload=payload,
            image_data_url=image_data_url if not openai_file_id else None,
            file_id=openai_file_id,
            filename=item.filename or item.title or "study-resource",
        )
        if openai_file_id:
            source["status"] = "direct_file"
            source["note"] = "The full uploaded file was sent directly to the AI model for a deeper summary."
    except RuntimeError:
        if not openai_file_id and not image_data_url:
            raise
        source["note"] = f"{source['note']} Direct file analysis failed, so extracted text/metadata was used."
        payload["source_note"] = source["note"]
        response = _call_openai(
            api_key=api_key,
            model=model_name,
            payload=payload,
            image_data_url=image_data_url if not openai_file_id else None,
            file_id=None,
            filename=item.filename or item.title or "study-resource",
        )
    finally:
        if openai_file_id:
            _delete_openai_file(api_key=api_key, file_id=openai_file_id)

    normalized = _normalize_summary_response(response, item=item, model=model_name, source=source)
    return normalized


def _call_openai(
    *,
    api_key: str,
    model: str,
    payload: dict[str, Any],
    image_data_url: str | None,
    file_id: str | None,
    filename: str,
) -> dict[str, Any]:
    system_prompt = (
        "You are CampusVerse Study Resource AI, an expert academic tutor. "
        "Explain the uploaded study resource like ChatGPT teaching a full PDF/doc to a student in detail. "
        "Use the attached file as the primary source whenever present, and use extracted text/metadata only as backup context. "
        "The user does not want a coverage overview, table-of-contents summary, or only a preparation plan. "
        "Teach the actual concepts from the material. For each important concept, explain what it means, why it matters, "
        "how it works, and give a clear example, mini walkthrough, or analogy. "
        "When the resource includes formulas, algorithms, test techniques, tables, or steps, explain them in plain language "
        "and then show how a student would apply them. "
        "Do not invent chapters, concepts, facts, formulas, or quiz answers that are not supported by the supplied material. "
        "If the actual file content is not readable and only metadata is available, say that clearly and do not pretend to teach unseen content. "
        "Write in clear student-friendly language, with enough depth to feel like a real one-on-one tutoring explanation. "
        "Return only valid JSON with keys full_explanation, concept_explanations, important_points, practice_guidance, quiz. "
        "concept_explanations must be an array of 6 to 12 objects with heading, explanation, and example. "
        "The explanation fields should be substantial, usually 4 to 8 sentences each."
    )

    input_text = json.dumps(payload, ensure_ascii=False, default=str)
    request_body: dict[str, Any] = {
        "model": model,
        "instructions": system_prompt,
        "max_output_tokens": 8000,
    }
    if file_id:
        request_body["input"] = [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": input_text},
                    {"type": "input_file", "file_id": file_id, "filename": filename},
                ],
            }
        ]
    elif image_data_url:
        request_body["input"] = [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": input_text},
                    {"type": "input_image", "image_url": image_data_url},
                ],
            }
        ]
    else:
        request_body["input"] = input_text

    response = requests.post(
        OPENAI_RESPONSES_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=request_body,
        timeout=45,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI returned HTTP {response.status_code}")
    return _json_from_text(_response_text(response.json()))


def _upload_openai_file(*, api_key: str, item: StudyResource, data: bytes) -> str | None:
    if not data or len(data) > MAX_DIRECT_FILE_BYTES:
        return None

    filename = item.filename or f"{item.title or 'study-resource'}.{_resource_extension(item)}"
    content_type = item.content_type or "application/octet-stream"
    lower_filename = filename.lower()
    lower_content_type = content_type.lower()

    if _is_image(lower_filename, lower_content_type):
        return None

    try:
        response = requests.post(
            OPENAI_FILES_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data={"purpose": "user_data"},
            files={"file": (filename, data, content_type)},
            timeout=45,
        )
    except requests.RequestException:
        return None

    if response.status_code >= 400:
        return None

    file_id = response.json().get("id")
    return file_id if isinstance(file_id, str) and file_id else None


def _delete_openai_file(*, api_key: str, file_id: str) -> None:
    try:
        requests.delete(
            f"{OPENAI_FILES_URL}/{file_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
    except requests.RequestException:
        pass


def _resource_extension(item: StudyResource) -> str:
    filename = item.filename or ""
    if "." in filename:
        return filename.rsplit(".", 1)[-1]
    content_type = (item.content_type or "").lower()
    if "pdf" in content_type:
        return "pdf"
    if "wordprocessingml" in content_type:
        return "docx"
    if "spreadsheetml" in content_type:
        return "xlsx"
    if "presentationml" in content_type:
        return "pptx"
    if "csv" in content_type:
        return "csv"
    if content_type.startswith("text/"):
        return "txt"
    return "bin"


def _resource_source(item: StudyResource) -> dict[str, Any]:
    data = _resource_bytes(item)
    metadata = (
        f"Resource title: {item.title}. Subject: {item.subject}. "
        f"Type: {item.resource_type}. Filename: {item.filename or 'not provided'}. "
    )
    if not data:
        return {
            "data": b"",
            "text": metadata,
            "status": "metadata_only",
            "note": "No uploaded file bytes were available, so only resource metadata could be used.",
        }

    filename = (item.filename or item.title or "").lower()
    content_type = (item.content_type or "").lower()
    extracted = ""
    status = "extracted"
    note = "Readable text was extracted from the uploaded material."

    if _is_docx(filename, content_type):
        extracted = _docx_text_from_bytes(data)
    elif _is_pptx(filename, content_type):
        extracted = _pptx_text_from_bytes(data)
    elif _is_xlsx(filename, content_type):
        extracted = _xlsx_text_from_bytes(data)
    elif _is_pdf(filename, content_type):
        extracted = _pdf_text_from_bytes(data)
    elif _is_text_like(filename, content_type):
        extracted = _raw_text_from_bytes(data)

    if not extracted and not _is_binary_media(filename, content_type):
        extracted = _raw_text_from_bytes(data)

    if extracted and _looks_like_extraction_artifact(extracted):
        extracted = ""

    if not extracted:
        status = "metadata_only"
        if _is_image(filename, content_type):
            status = "image_attached"
            note = "The image was attached to the AI request for visual summary."
        elif _is_audio(filename, content_type):
            note = "Audio transcription is not available in this endpoint; only metadata was used."
        elif _is_video(filename, content_type):
            note = "Video transcription/frame analysis is not available in this endpoint; only metadata was used."
        else:
            note = "The uploaded file content could not be safely read; only metadata was used."
        return {"data": data, "text": metadata, "status": status, "note": note}

    return {
        "data": data,
        "text": _compact_text(f"{metadata} Study content: {extracted}", MAX_SOURCE_CHARS),
        "status": status,
        "note": note,
    }


def _resource_bytes(item: StudyResource) -> bytes:
    if item.file_data:
        return item.file_data
    local_path = local_study_resource_path(item.url)
    if local_path and local_path.exists() and local_path.is_file():
        try:
            return local_path.read_bytes()
        except OSError:
            return b""
    return b""


def _normalize_summary_response(
    value: dict[str, Any],
    *,
    item: StudyResource,
    model: str,
    source: dict[str, Any],
) -> dict[str, Any]:
    full_explanation = _clean_string(value.get("full_explanation")) or _clean_string(value.get("summary"))
    concept_explanations = _concept_items(value.get("concept_explanations")) or _section_items(value.get("detailed_explanation"))
    important_points = _string_list(value.get("important_points"), 8) or _string_list(value.get("key_takeaways"), 8)
    practice_guidance = _string_list(value.get("practice_guidance"), 6) or _string_list(value.get("revision_focus"), 6)
    quiz = _quiz_items(value.get("quiz"))

    if not full_explanation:
        full_explanation = (
            f"{item.title} is a {item.resource_type} resource for {item.subject}. "
            f"{source['note']} Open the uploaded material directly for exact concept-level details."
        )
    if not concept_explanations:
        concept_explanations = [
            {
                "heading": "How to study this material",
                "explanation": (
                    f"Use this {item.resource_type.lower()} as the main reference for {item.subject}. "
                    "Read the uploaded material directly, list every topic heading, and connect definitions with examples."
                ),
                "example": "For each heading, write one question: what does this mean, how does it work, and where would I use it?",
            }
        ]
    if not important_points:
        important_points = [f"Review the uploaded {item.resource_type.lower()} for {item.subject}.", source["note"]]
    if not practice_guidance:
        practice_guidance = ["Open the material and work through each concept with one example in your own words."]
    if not quiz:
        quiz = [
            {
                "question": f"What is the main subject of {item.title}?",
                "answer": item.subject,
            }
        ]

    return {
        "ok": True,
        "resourceId": item.id,
        "title": item.title,
        "subject": item.subject,
        "resourceType": item.resource_type,
        "model": model,
        "sourceStatus": source["status"],
        "sourceNote": source["note"],
        "summary": full_explanation,
        "fullExplanation": full_explanation,
        "detailedExplanation": concept_explanations,
        "conceptExplanations": concept_explanations,
        "keyTakeaways": important_points,
        "importantPoints": important_points,
        "revisionFocus": practice_guidance,
        "practiceGuidance": practice_guidance,
        "quiz": quiz[:3],
    }


def _response_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text

    chunks: list[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks)


def _json_from_text(value: str) -> dict[str, Any]:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        loaded = json.loads(cleaned)
    except ValueError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise RuntimeError("OpenAI returned a response that was not valid JSON")
        loaded = json.loads(cleaned[start : end + 1])
    if not isinstance(loaded, dict):
        raise RuntimeError("OpenAI response must be a JSON object")
    return loaded


def _clean_string(value: Any) -> str:
    if value is None:
        return ""
    return _compact_text(str(value), 4000)


def _string_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [_clean_string(item) for item in value]
    return [item for item in items if item][:limit]


def _section_items(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        heading = _clean_string(item.get("heading"))
        explanation = _clean_string(item.get("explanation"))
        if heading and explanation:
            items.append({"heading": heading, "explanation": explanation, "example": ""})
        if len(items) >= 12:
            break
    return items


def _concept_items(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        heading = _clean_string(item.get("heading"))
        explanation = _clean_string(item.get("explanation"))
        example = _clean_string(item.get("example"))
        if heading and explanation:
            items.append({"heading": heading, "explanation": explanation, "example": example})
        if len(items) >= 12:
            break
    return items


def _quiz_items(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        question = _clean_string(item.get("question"))
        answer = _clean_string(item.get("answer"))
        if question and answer:
            items.append({"question": question, "answer": answer})
        if len(items) >= 3:
            break
    return items


def _compact_text(value: str, limit: int = 9000) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip()
    return cleaned[:limit].strip()


def _looks_like_extraction_artifact(value: str) -> bool:
    if not value:
        return True
    artifact_hits = sum(value.count(pattern) for pattern in PDF_ARTIFACT_PATTERNS)
    words = re.findall(r"[A-Za-z]{3,}", value)
    readable_words = [
        word
        for word in words
        if not re.fullmatch(r"[A-Fa-f0-9]{6,}", word)
        and not word.startswith("Obj")
        and word.lower() not in {"stream", "endstream", "obj", "endobj", "filter", "length"}
    ]
    if artifact_hits >= 2:
        return True
    return len(readable_words) < 20


def _docx_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile):
        return ""
    return _xml_text(xml_bytes, limit)


def _pptx_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            slide_names = sorted(name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml"))
            parts = [_xml_text(archive.read(name), limit) for name in slide_names[:20]]
    except (KeyError, zipfile.BadZipFile):
        return ""
    return _compact_text(" ".join(parts), limit)


def _xlsx_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            shared = _xlsx_shared_strings(archive)
            sheet_names = sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
            rows: list[str] = []
            for sheet_name in sheet_names[:8]:
                rows.extend(_xlsx_sheet_rows(archive.read(sheet_name), shared, max_rows=80))
                if len(" ".join(rows)) >= limit:
                    break
    except (KeyError, zipfile.BadZipFile):
        return ""
    return _compact_text(" | ".join(rows), limit)


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        xml_bytes = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return []
    values: list[str] = []
    for item in root.iter():
        if not item.tag.endswith("}si") and item.tag != "si":
            continue
        text = " ".join(node.text or "" for node in item.iter() if node.tag.endswith("}t") or node.tag == "t")
        values.append(_compact_text(text, 500))
    return values


def _xlsx_sheet_rows(xml_bytes: bytes, shared: list[str], max_rows: int) -> list[str]:
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return []
    rows: list[str] = []
    for row in root.iter():
        if not row.tag.endswith("}row") and row.tag != "row":
            continue
        cells: list[str] = []
        for cell in row:
            if not cell.tag.endswith("}c") and cell.tag != "c":
                continue
            cell_type = cell.attrib.get("t", "")
            value_node = next((child for child in cell if child.tag.endswith("}v") or child.tag == "v"), None)
            inline_text = " ".join(child.text or "" for child in cell.iter() if child.tag.endswith("}t") or child.tag == "t")
            value = value_node.text if value_node is not None else inline_text
            if value is None:
                continue
            if cell_type == "s":
                try:
                    value = shared[int(value)]
                except (ValueError, IndexError):
                    pass
            cells.append(_compact_text(value, 250))
        row_text = " | ".join(cell for cell in cells if cell)
        if row_text:
            rows.append(row_text)
        if len(rows) >= max_rows:
            break
    return rows


def _xml_text(xml_bytes: bytes, limit: int) -> str:
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    parts = [node.text or "" for node in root.iter() if node.text]
    return _compact_text(" ".join(parts), limit)


def _pdf_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        pypdf_text = ""
    else:
        try:
            reader = PdfReader(BytesIO(data))
            pages: list[str] = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
                if len(" ".join(pages)) >= limit:
                    break
            pypdf_text = _compact_text(" ".join(pages), limit)
        except Exception:
            pypdf_text = ""
        if pypdf_text and not _looks_like_extraction_artifact(pypdf_text):
            return pypdf_text

    stream_text = _pdf_stream_text_from_bytes(data, limit)
    return stream_text if stream_text and not _looks_like_extraction_artifact(stream_text) else ""


def _decode_pdf_literal(raw: bytes) -> str:
    try:
        value = raw[1:-1].decode("latin-1", errors="ignore")
    except Exception:
        return ""
    value = re.sub(
        r"\\([nrtbf()\\])",
        lambda match: {
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "b": "",
            "f": "",
            "(": "(",
            ")": ")",
            "\\": "\\",
        }.get(match.group(1), match.group(1)),
        value,
    )
    value = re.sub(r"\\[0-7]{1,3}", " ", value)
    return value


def _decode_pdf_hex(raw: bytes) -> str:
    cleaned = re.sub(rb"\s+", b"", raw)
    if len(cleaned) % 2:
        cleaned += b"0"
    try:
        data = bytes.fromhex(cleaned.decode("ascii"))
    except Exception:
        return ""
    for encoding in ("utf-16-be", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding, errors="ignore")
        except Exception:
            continue
        if re.search(r"[A-Za-z]{3,}", text):
            return text
    return ""


def _pdf_stream_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    chunks: list[str] = []
    for match in re.finditer(rb"<<(?P<dict>.*?)>>\s*stream\r?\n(?P<body>.*?)\r?\nendstream", data, re.DOTALL):
        dictionary = match.group("dict")
        body = match.group("body").strip(b"\r\n")
        if b"/FlateDecode" in dictionary:
            try:
                body = zlib.decompress(body)
            except Exception:
                continue
        elif b"/Filter" in dictionary:
            continue

        for literal in re.findall(rb"\((?:\\.|[^\\()])*\)", body):
            text = _decode_pdf_literal(literal)
            if text:
                chunks.append(text)
        for hex_string in re.findall(rb"(?<!<)<([0-9A-Fa-f\s]{6,})>(?!>)", body):
            text = _decode_pdf_hex(hex_string)
            if text:
                chunks.append(text)
        if len(" ".join(chunks)) >= limit:
            break
    return _compact_text(" ".join(chunks), limit)


def _raw_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    for encoding in ("utf-8", "utf-16", "utf-16-le", "utf-16-be", "latin-1"):
        try:
            text = data.decode(encoding, errors="ignore")
        except Exception:
            continue
        cleaned = _compact_text(text, limit)
        if re.search(r"[A-Za-z]{3,}", cleaned):
            return cleaned
    return ""


def _image_data_url(item: StudyResource, data: bytes) -> str | None:
    if not data or len(data) > MAX_IMAGE_BYTES:
        return None
    filename = (item.filename or item.title or "").lower()
    content_type = (item.content_type or "").lower()
    if not _is_image(filename, content_type):
        return None
    media_type = content_type if content_type.startswith("image/") else _image_content_type(filename)
    return f"data:{media_type};base64,{base64.b64encode(data).decode('ascii')}"


def _image_content_type(filename: str) -> str:
    if filename.endswith(".png"):
        return "image/png"
    if filename.endswith(".gif"):
        return "image/gif"
    if filename.endswith(".webp"):
        return "image/webp"
    if filename.endswith(".svg"):
        return "image/svg+xml"
    return "image/jpeg"


def _is_pdf(filename: str, content_type: str) -> bool:
    return filename.endswith(".pdf") or "pdf" in content_type


def _is_docx(filename: str, content_type: str) -> bool:
    return filename.endswith(".docx") or "wordprocessingml" in content_type


def _is_pptx(filename: str, content_type: str) -> bool:
    return filename.endswith(".pptx") or "presentationml" in content_type


def _is_xlsx(filename: str, content_type: str) -> bool:
    return filename.endswith(".xlsx") or "spreadsheetml" in content_type


def _is_text_like(filename: str, content_type: str) -> bool:
    return (
        content_type.startswith("text/")
        or filename.endswith((".txt", ".csv", ".tsv", ".md", ".json", ".xml", ".log"))
        or content_type in {"application/json", "application/xml", "text/csv"}
    )


def _is_image(filename: str, content_type: str) -> bool:
    return content_type.startswith("image/") or filename.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"))


def _is_audio(filename: str, content_type: str) -> bool:
    return content_type.startswith("audio/") or filename.endswith((".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"))


def _is_video(filename: str, content_type: str) -> bool:
    return content_type.startswith("video/") or filename.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"))


def _is_binary_media(filename: str, content_type: str) -> bool:
    return _is_image(filename, content_type) or _is_audio(filename, content_type) or _is_video(filename, content_type)
