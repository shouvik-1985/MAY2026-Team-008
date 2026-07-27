from __future__ import annotations

import json
import re
from typing import Any

import requests


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
MAX_SOURCE_CHARS = 16000

SOURCE_ARTIFACT_TERMS = (
    "/ObjStm",
    "/FlateDecode",
    "/Subtype",
    "/Filter",
    "/Length",
    "endobj",
    "endstream",
    "startxref",
    "xref",
)

STOPWORDS = {
    "about",
    "after",
    "also",
    "based",
    "before",
    "between",
    "chapter",
    "class",
    "content",
    "course",
    "describe",
    "during",
    "example",
    "explain",
    "from",
    "guide",
    "into",
    "lecture",
    "material",
    "notes",
    "paper",
    "resource",
    "section",
    "should",
    "study",
    "students",
    "their",
    "these",
    "this",
    "topic",
    "understand",
    "using",
    "with",
    "week",
}


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _looks_like_source_artifact(value: str) -> bool:
    if not value:
        return True
    artifact_hits = sum(value.count(term) for term in SOURCE_ARTIFACT_TERMS)
    words = re.findall(r"[A-Za-z]{3,}", value)
    useful_words = [
        word
        for word in words
        if not re.fullmatch(r"[A-Fa-f0-9]{6,}", word)
        and word.lower() not in {"obj", "endobj", "stream", "endstream", "filter", "length", "subtype"}
    ]
    return artifact_hits >= 2 or len(useful_words) < 20


def _sanitize_source_for_generation(source_text: str, subject: str, source_title: str) -> tuple[str, str | None]:
    cleaned = _clean_text(source_text)
    if not cleaned:
        return subject, "No readable source text was available; generated from the subject."

    segments = re.split(r"(?=RESOURCE\s+\d+:)|(?=Resource title:)", cleaned)
    kept: list[str] = []
    discarded = 0
    for segment in segments or [cleaned]:
        segment = _clean_text(segment)
        if not segment:
            continue
        if _looks_like_source_artifact(segment):
            discarded += 1
            continue
        kept.append(segment)

    if kept:
        return _clean_text(" ".join(kept))[:MAX_SOURCE_CHARS], (
            "Some unreadable extraction fragments were ignored." if discarded else None
        )

    fallback = _fallback_source_outline(subject, source_title)
    return fallback, "Selected resource text was not readable; generated from resource metadata and subject instead."


def _fallback_source_outline(subject: str, source_title: str) -> str:
    combined = f"{source_title} {subject}".lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", combined.replace("_", " "))
    if re.search(r"\bsw\s*testing\b|\bsoftware testing\b|\btesting\b", normalized):
        return (
            f"{source_title}. {subject}. Core software testing topics: test case design, equivalence partitioning, "
            "boundary value analysis, control-flow testing, path coverage, DART and symbolic execution, "
            "path constraints, data-flow testing, mutation testing, regression testing, test adequacy criteria."
        )
    if re.search(r"\bstatistics\b|\bprobability\b|\bdata science\b|\brandom variable\b", normalized):
        return (
            f"{source_title}. {subject}. Core probability and statistics topics: random variables, joint distributions, "
            "independence, functions of random variables, expected value, variance, covariance, correlation, "
            "continuous random variables, density functions, limit theorems, Gaussian models, estimation, "
            "Bayesian estimation, hypothesis testing."
        )
    if re.search(r"\bmathematics\b|\bmath\b", normalized):
        return (
            f"{source_title}. {subject}. Core mathematics for data science topics: vectors, matrices, linear systems, "
            "eigenvalues, derivatives, gradients, optimization, probability basics, distributions, and model assumptions."
        )
    return _clean_text(f"{source_title}. {subject}. Core course concepts and applied problem solving.")


def _keywords(source_text: str, subject: str, limit: int) -> list[str]:
    raw_words = re.findall(r"[A-Za-z][A-Za-z0-9+&/-]{3,}", f"{source_text} {subject}")
    seen: set[str] = set()
    words: list[str] = []
    for raw_word in raw_words:
        normalized = raw_word.strip("-/").lower()
        if normalized in STOPWORDS or normalized in seen:
            continue
        seen.add(normalized)
        words.append(raw_word.strip("-/").title())
        if len(words) >= limit:
            break
    if words:
        return words
    fallback = [part.title() for part in re.split(r"\W+", subject) if len(part) > 2]
    return (fallback or ["Core Concept"])[:limit]


GRADE_CODES = {"S", "A", "B", "C", "D", "E", "U", "P", "F", "W", "I"}


def normalize_grade_code(value: str | None) -> str | None:
    code = (value or "").strip().upper()
    return code if code in GRADE_CODES else None


def grade_from_score(score: float) -> str:
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    if score >= 50:
        return "D"
    if score >= 40:
        return "E"
    return "U"


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
            raise
        loaded = json.loads(cleaned[start : end + 1])
    if not isinstance(loaded, dict):
        raise ValueError("AI response must be a JSON object")
    return loaded


def _point_distribution(total_points: int, count: int) -> list[int]:
    safe_count = max(1, count)
    base = total_points // safe_count
    remainder = total_points % safe_count
    return [base + (1 if index < remainder else 0) for index in range(safe_count)]


def _option_id(index: int) -> str:
    return ["A", "B", "C", "D"][index % 4]


def _rotate_options(options: list[str], correct_index: int) -> tuple[list[dict[str, str]], str]:
    shifted = options[correct_index:] + options[:correct_index]
    option_rows = [{"id": _option_id(index), "text": text} for index, text in enumerate(shifted[:4])]
    return option_rows, _option_id((len(options) - correct_index) % 4)


def _fallback_rubric(assignment_type: str, total_points: int) -> list[dict[str, Any]]:
    if assignment_type == "mcq":
        return [
            {"label": "Concept accuracy", "points": round(total_points * 0.55), "detail": "Chooses the option that matches the source concept."},
            {"label": "Reasoning from material", "points": round(total_points * 0.3), "detail": "Uses definitions and relationships present in the syllabus or resource."},
            {"label": "Completion", "points": total_points - round(total_points * 0.85), "detail": "Attempts every question before submission."},
        ]
    if assignment_type == "qa":
        return [
            {"label": "Concept accuracy", "points": round(total_points * 0.4), "detail": "Defines the requested probability/statistics idea correctly."},
            {"label": "Applied reasoning", "points": round(total_points * 0.35), "detail": "Connects the answer to data, distributions, or inference."},
            {"label": "Examples and limitations", "points": total_points - round(total_points * 0.75), "detail": "Includes examples, assumptions, and limitations."},
        ]
    return [
        {"label": "Coverage", "points": round(total_points * 0.35), "detail": "Addresses each generated requirement."},
        {"label": "Evidence", "points": round(total_points * 0.3), "detail": "Uses examples from the selected resource, syllabus, or content."},
        {"label": "Analysis quality", "points": round(total_points * 0.2), "detail": "Explains assumptions, methods, and limitations."},
        {"label": "Submission quality", "points": total_points - round(total_points * 0.85), "detail": "Submits a readable PDF, DOC, or DOCX."},
    ]


def _normalize_rubric(raw: Any, assignment_type: str, total_points: int) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        return _fallback_rubric(assignment_type, total_points)
    rows: list[dict[str, Any]] = []
    for item in raw[:6]:
        if not isinstance(item, dict):
            continue
        label = _clean_text(str(item.get("label", "")))[:80]
        detail = _clean_text(str(item.get("detail", "")))[:260]
        try:
            points = int(item.get("points", 0))
        except (TypeError, ValueError):
            points = 0
        if label and detail:
            rows.append({"label": label, "points": max(0, points), "detail": detail})
    return rows or _fallback_rubric(assignment_type, total_points)


def _normalize_questions(
    raw: Any,
    assignment_type: str,
    subject: str,
    source_text: str,
    count: int,
    total_points: int,
) -> list[dict[str, Any]]:
    local_questions = _build_local_questions(
        assignment_type=assignment_type,
        subject=subject,
        source_text=source_text,
        count=count,
        total_points=total_points,
    )
    if not isinstance(raw, list):
        return local_questions

    point_rows = _point_distribution(total_points, count)
    questions: list[dict[str, Any]] = []
    for index, item in enumerate(raw[:count]):
        if not isinstance(item, dict):
            continue
        prompt = _clean_text(str(item.get("prompt", "")))[:900]
        if not prompt:
            continue
        question: dict[str, Any] = {
            "id": f"q{index + 1}",
            "kind": assignment_type if assignment_type in {"mcq", "qa"} else "file",
            "prompt": prompt,
            "points": point_rows[min(index, len(point_rows) - 1)],
        }
        if assignment_type == "mcq":
            raw_options = item.get("options")
            options: list[dict[str, str]] = []
            if isinstance(raw_options, list):
                for option_index, option in enumerate(raw_options[:4]):
                    if isinstance(option, dict):
                        text = _clean_text(str(option.get("text", "")))[:420]
                        option_id = _clean_text(str(option.get("id", _option_id(option_index)))).upper()[:1]
                    else:
                        text = _clean_text(str(option))[:420]
                        option_id = _option_id(option_index)
                    if text:
                        options.append({"id": option_id if option_id in {"A", "B", "C", "D"} else _option_id(option_index), "text": text})
            if len(options) != 4:
                return local_questions
            answer_key = _clean_text(str(item.get("answerKey", ""))).upper()[:1] or "A"
            question["options"] = options
            question["answerKey"] = answer_key if answer_key in {"A", "B", "C", "D"} else "A"
            question["explanation"] = _clean_text(str(item.get("explanation", "")))[:500] or "The correct option follows from the selected source material."
        elif assignment_type == "qa":
            keywords = item.get("expectedKeywords")
            question["expectedKeywords"] = [
                _clean_text(str(keyword))[:80]
                for keyword in (keywords if isinstance(keywords, list) else [])
                if _clean_text(str(keyword))
            ][:8] or _keywords(prompt, subject, 4)
        else:
            requirements = item.get("requirements")
            question["requirements"] = [
                _clean_text(str(requirement))[:240]
                for requirement in (requirements if isinstance(requirements, list) else [])
                if _clean_text(str(requirement))
            ][:8]
        questions.append(question)

    if len(questions) < count and assignment_type != "file":
        questions.extend(local_questions[len(questions) : count])
    return questions[:count] if questions else local_questions


def _normalize_blueprint(
    payload: dict[str, Any],
    *,
    assignment_type: str,
    subject: str,
    title: str,
    source_title: str,
    source_text: str,
    question_count: int,
    total_points: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    content = payload.get("content") if isinstance(payload.get("content"), dict) else payload
    questions = _normalize_questions(
        content.get("questions") if isinstance(content, dict) else None,
        assignment_type,
        subject,
        source_text,
        question_count if assignment_type != "file" else 1,
        total_points,
    )
    instructions = (
        _clean_text(str(content.get("instructions", "")))[:900]
        if isinstance(content, dict)
        else ""
    )
    if not instructions:
        instructions = (
            f"CampusVerse AI created {title} from {source_title}. "
            "Answer using the selected material, clear reasoning, and academic honesty."
        )
    normalized_content = {
        "title": _clean_text(str(content.get("title", title)))[:180] if isinstance(content, dict) else title,
        "instructions": instructions,
        "sourceTitle": source_title,
        "questions": questions,
        "allowedFileTypes": ["pdf", "doc", "docx"] if assignment_type == "file" else [],
    }
    return normalized_content, _normalize_rubric(payload.get("rubric"), assignment_type, total_points)


def _build_assignment_with_openai(
    *,
    api_key: str,
    model: str,
    assignment_type: str,
    subject: str,
    title: str,
    source_title: str,
    source_text: str,
    question_count: int,
    total_points: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    system_prompt = (
        "You are CampusVerse Assignment AI, an expert university assessment designer. "
        "Create rigorous assignments strictly grounded in the supplied syllabus, uploaded resource text, or custom content. "
        "Do not generate generic 'role of X' questions. Do not invent topics outside the provided material. "
        "Never ask questions about PDF extraction, object streams, FlateDecode, unreadable text, file parsing, or metadata; "
        "those are system limitations, not academic content. "
        "For MCQs, make all four options plausible and test conceptual understanding, calculations, assumptions, and interpretation. "
        "For Q&A, ask answerable analytical questions and include expectedKeywords. "
        "For file submissions, create a clear brief, requirements, and rubric. "
        "Return only valid JSON. Never include markdown fences or commentary."
    )
    payload = {
        "assignment_type": assignment_type,
        "subject": subject,
        "title": title,
        "source_title": source_title,
        "source_text": source_text[:MAX_SOURCE_CHARS],
        "question_count": question_count,
        "total_points": total_points,
        "json_schema": {
            "content": {
                "title": "string",
                "instructions": "string",
                "questions": [
                    {
                        "id": "q1",
                        "kind": "mcq|qa|file",
                        "prompt": "string",
                        "options": [{"id": "A", "text": "string"}],
                        "answerKey": "A|B|C|D",
                        "explanation": "string",
                        "expectedKeywords": ["string"],
                        "requirements": ["string"],
                        "points": 10,
                    }
                ],
                "allowedFileTypes": ["pdf", "doc", "docx"],
            },
            "rubric": [{"label": "string", "points": 10, "detail": "string"}],
        },
    }
    response = requests.post(
        OPENAI_RESPONSES_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "instructions": system_prompt,
            "input": json.dumps(payload, ensure_ascii=False, default=str),
            "max_output_tokens": 4200,
        },
        timeout=45,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI returned HTTP {response.status_code}")
    parsed = _json_from_text(_response_text(response.json()))
    return _normalize_blueprint(
        parsed,
        assignment_type=assignment_type,
        subject=subject,
        title=title,
        source_title=source_title,
        source_text=source_text,
        question_count=question_count,
        total_points=total_points,
    )


def _source_topics(source_text: str, subject: str, limit: int) -> list[str]:
    source = re.sub(r"\bWEEK\s+\d+\b", "\n", source_text, flags=re.IGNORECASE)
    source = re.sub(r"\b(UNIT|MODULE)\s+\d+\b", "\n", source, flags=re.IGNORECASE)
    fragments = re.split(r"[\n;\u2022]+|(?<!\d),(?!\d)|\s+-\s+|\s+\u2013\s+|\s+\u2014\s+", source)
    seen: set[str] = set()
    topics: list[str] = []
    for fragment in fragments:
        cleaned = _clean_text(fragment)
        cleaned = re.sub(r"^(week|unit|module)\s*\d+\s*", "", cleaned, flags=re.IGNORECASE).strip(" :-")
        cleaned = re.sub(r"\s+", " ", cleaned)
        words = cleaned.split()
        important_single_word_topics = {"independence", "expectations", "inequalities", "visualization", "dependency"}
        if (len(words) < 2 and cleaned.lower() not in important_single_word_topics) or len(words) > 12:
            continue
        normalized = cleaned.lower()
        if normalized in seen or normalized in STOPWORDS:
            continue
        if normalized in {"refresher week", "revision week", "selected syllabus", "colab illustration"}:
            continue
        seen.add(normalized)
        topics.append(cleaned)
        if len(topics) >= limit:
            break
    if len(topics) < limit:
        for keyword in _keywords(source_text, subject, limit * 2):
            if keyword.lower() not in seen:
                topics.append(keyword)
                seen.add(keyword.lower())
            if len(topics) >= limit:
                break
    return topics or [subject]


def _topic_matches(topic: str, *patterns: str) -> bool:
    lower = topic.lower()
    return any(re.search(pattern, lower) for pattern in patterns)


def _topic_canonical(topic: str) -> str:
    value = re.sub(r"\b(i|ii|iii|iv|v)\b", "", topic.lower())
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return _clean_text(value)


def _near_duplicate_topic(topic: str, existing: list[str]) -> bool:
    canonical = _topic_canonical(topic)
    if not canonical:
        return True
    for item in existing:
        other = _topic_canonical(item)
        if canonical == other:
            return True
        shorter, longer = sorted([canonical, other], key=len)
        if len(shorter) >= 6 and shorter in longer:
            return True
    return False


def _question_topics(source_text: str, subject: str, count: int) -> list[str]:
    topics = _source_topics(source_text, subject, max(count * 5, 40))
    priority_patterns = [
        (r"\bdart\b", r"\bsymbolic execution\b", r"\bpath constraints?\b"),
        (r"\bequivalence partitioning\b",),
        (r"\bboundary value\b",),
        (r"\bcontrol[- ]flow\b", r"\bpath coverage\b"),
        (r"\bdata[- ]flow\b",),
        (r"\bmutation testing\b",),
        (r"\bregression testing\b",),
        (r"\btest adequacy\b", r"\btest case design\b"),
        (r"\bindependence\b",),
        (r"\bexpected value\b", r"\bexpectations?\b", r"\bcasino\b"),
        (r"\bvariance\b", r"\bstandard deviation\b"),
        (r"\bcovariance\b", r"\bcorrelation\b"),
        (r"\bdensity\b", r"\bcontinuous\b"),
        (r"\blimit theorem", r"\baverages?\b"),
        (r"\bgaussian\b",),
        (r"\bestimation\b", r"\binference\b"),
        (r"\bbayesian\b",),
        (r"\bhypothesis\b",),
        (r"\bscatter\b", r"\bhistogram\b", r"\bvisualization\b", r"\bipl\b"),
        (r"\bfunctions? of random variables\b",),
        (r"\bmultiple random variables\b", r"\btwo random variables\b"),
    ]
    ordered: list[str] = []
    used: set[str] = set()
    for patterns in priority_patterns:
        match = next(
            (
                topic
                for topic in topics
                if topic.lower() not in used
                and not _near_duplicate_topic(topic, ordered)
                and _topic_matches(topic, *patterns)
            ),
            None,
        )
        if match:
            ordered.append(match)
            used.add(match.lower())
    for topic in topics:
        if topic.lower() not in used and not _near_duplicate_topic(topic, ordered):
            ordered.append(topic)
            used.add(topic.lower())
        if len(ordered) >= count:
            break
    return ordered or topics[:count] or [subject]


def _topic_mcq(topic: str, subject: str, index: int, points: int) -> dict[str, Any]:
    if _topic_matches(topic, r"\bdart\b", r"\bsymbolic execution\b", r"\bpath constraints?\b"):
        prompt = "In DART-style automated testing, why are path constraints collected during execution?"
        options = [
            "They describe branch conditions that can be negated or solved to generate inputs for new execution paths.",
            "They replace the need to execute the program with any concrete input.",
            "They prove that every statement in the program is free of faults.",
            "They are used only to format the final test report and do not affect input generation.",
        ]
        explanation = "DART combines concrete execution with symbolic constraints so new inputs can be generated for unexplored paths."
    elif _topic_matches(topic, r"\bequivalence partitioning\b"):
        prompt = "What is the main purpose of equivalence partitioning in test-case design?"
        options = [
            "Divide the input domain into classes expected to behave similarly, then test representative values from each class.",
            "Execute every possible input value to guarantee complete correctness.",
            "Select only random inputs without considering the specification.",
            "Focus only on internal source-code paths and ignore input behavior.",
        ]
        explanation = "Equivalence partitioning reduces redundant tests while preserving coverage of meaningful input classes."
    elif _topic_matches(topic, r"\bboundary value\b"):
        prompt = "Why are boundary values especially important in black-box testing?"
        options = [
            "Defects often occur at the edges of valid and invalid input ranges.",
            "Boundary values always prove all internal paths have been covered.",
            "Only boundary values are needed for every program regardless of behavior.",
            "They are used only when the program has no input constraints.",
        ]
        explanation = "Boundary value analysis targets edge cases where off-by-one and range-checking errors commonly appear."
    elif _topic_matches(topic, r"\bcontrol[- ]flow\b", r"\bpath coverage\b"):
        prompt = "Which statement best describes path coverage in control-flow testing?"
        options = [
            "It aims to execute distinct feasible paths through the program's control-flow graph.",
            "It checks only whether each variable has a valid name.",
            "It is identical to testing one arbitrary input from the full input domain.",
            "It ignores branches and focuses only on user-interface labels.",
        ]
        explanation = "Path coverage is a structural criterion based on executing paths through decisions and branches."
    elif _topic_matches(topic, r"\bdata[- ]flow\b"):
        prompt = "What does data-flow testing primarily examine?"
        options = [
            "The lifecycle of variable definitions and uses to expose anomalies such as use-before-definition.",
            "Only the visual layout of input and output screens.",
            "The spelling of comments in the source file.",
            "The number of files in the project folder.",
        ]
        explanation = "Data-flow testing follows how values are defined, propagated, and used across program paths."
    elif _topic_matches(topic, r"\bmutation testing\b"):
        prompt = "What does it mean when a test suite kills a mutant in mutation testing?"
        options = [
            "At least one test detects the behavioral difference introduced by the small code change.",
            "The original program is deleted and replaced by the mutant.",
            "The test suite no longer needs assertions.",
            "The mutant is guaranteed to represent a real production fault.",
        ]
        explanation = "Mutation testing evaluates whether tests can detect small seeded changes in program behavior."
    elif _topic_matches(topic, r"\bregression testing\b"):
        prompt = "Why is regression testing performed after code changes?"
        options = [
            "To check that previously working behavior has not been broken by the change.",
            "To avoid running any old tests once new features are added.",
            "To prove the program has no bugs in any possible environment.",
            "To replace requirements analysis with execution speed measurements.",
        ]
        explanation = "Regression testing protects existing behavior while software evolves."
    elif _topic_matches(topic, r"\btest adequacy\b", r"\btest case design\b"):
        prompt = "What is the role of a test adequacy criterion?"
        options = [
            "It gives a measurable rule for judging whether a test suite is sufficient for a chosen testing objective.",
            "It guarantees the absence of all possible faults.",
            "It chooses tests without reference to specifications or code.",
            "It measures only the number of developers on the project.",
        ]
        explanation = "Adequacy criteria guide test selection and stopping decisions, but they do not prove absolute correctness."
    elif _topic_matches(topic, r"\bindependence\b"):
        prompt = f"In {subject}, which statement correctly describes independence for random variables?"
        options = [
            "The joint distribution factors into the product of the marginal distributions for every relevant value.",
            "The two variables must have the same expected value.",
            "A scatter plot has no visible trend only after both variables are standardized.",
            "The covariance is always positive whenever both variables are independent.",
        ]
        explanation = "Independence means knowing one variable does not change the distribution of the other; equivalently the joint factors into marginals."
    elif _topic_matches(topic, r"\bcovariance\b", r"\bcorrelation\b"):
        prompt = f"Which interpretation of covariance and correlation is most appropriate for {subject}?"
        options = [
            "Correlation is standardized covariance, so it describes direction and relative strength without the original units.",
            "Covariance and correlation are always equal when two variables are measured from data.",
            "A zero covariance proves independence for every possible joint distribution.",
            "Correlation measures the difference between the two sample means.",
        ]
        explanation = "Correlation rescales covariance by the standard deviations; zero covariance is weaker than independence except in special models such as jointly Gaussian variables."
    elif _topic_matches(topic, r"\bvariance\b", r"\bstandard deviation\b"):
        prompt = f"What does variance measure for a random variable in {subject}?"
        options = [
            "The expected squared deviation from the mean, with standard deviation returning the spread to original units.",
            "The largest observed value minus the smallest observed value.",
            "The probability that the random variable equals its mean exactly.",
            "The slope of the best-fit line in a scatter plot.",
        ]
        explanation = "Variance is E[(X - E[X])^2], and standard deviation is its square root."
    elif _topic_matches(topic, r"\bdensity\b", r"\bcontinuous\b"):
        prompt = f"For a continuous random variable, which statement about density functions is correct?"
        options = [
            "Probabilities over intervals are obtained by integrating the density over those intervals.",
            "The density value at a point is itself the probability of that exact point.",
            "Every continuous variable must have a uniform distribution.",
            "A density function may be negative if the total area is one.",
        ]
        explanation = "Continuous probabilities come from area under the density; point probabilities are typically zero."
    elif _topic_matches(topic, r"\bexpect", r"\bcasino\b"):
        prompt = f"Why is expected value useful in casino math and probability models?"
        options = [
            "It gives the long-run average payoff, even though individual outcomes remain random.",
            "It guarantees the next outcome will equal the average.",
            "It removes the need to know the probability distribution.",
            "It is always the most likely value of a random variable.",
        ]
        explanation = "Expected value is a probability-weighted average and is useful for long-run comparisons."
    elif _topic_matches(topic, r"\bbayesian\b"):
        prompt = f"In Bayesian estimation, how is new data incorporated?"
        options = [
            "The posterior is obtained by combining the prior with the likelihood from the observed data.",
            "The prior is discarded before seeing the data.",
            "The posterior is always equal to the sample mean.",
            "The likelihood is chosen after the posterior is known.",
        ]
        explanation = "Bayesian inference updates prior beliefs using the likelihood to form a posterior distribution."
    elif _topic_matches(topic, r"\bhypothesis\b"):
        prompt = f"What does a p-value represent in hypothesis testing?"
        options = [
            "The probability, under the null model, of observing a result at least as extreme as the one obtained.",
            "The probability that the null hypothesis is true.",
            "The fraction of the dataset that supports the alternative hypothesis.",
            "The size of the confidence interval.",
        ]
        explanation = "A p-value is computed assuming the null hypothesis, so it is not the posterior probability that the null is true."
    elif _topic_matches(topic, r"\blimit\b", r"\baverages?\b"):
        prompt = f"Which idea is central to limit theorems for averages of random variables?"
        options = [
            "Averages of many independent variables can become approximately normal under suitable conditions.",
            "Every individual observation must already be normally distributed.",
            "The variance of an average grows linearly with sample size.",
            "Limit theorems apply only to categorical data.",
        ]
        explanation = "The central limit theorem explains why averages often have approximately Gaussian behavior."
    elif _topic_matches(topic, r"\bgaussian\b"):
        prompt = f"What is a special property of jointly Gaussian random variables?"
        options = [
            "For jointly Gaussian variables, zero covariance implies independence.",
            "They can only model variables with positive values.",
            "Their marginal distributions must be discrete.",
            "They are independent whenever their means are equal.",
        ]
        explanation = "Joint Gaussian structure makes uncorrelated components independent, which is not true for all distributions."
    elif _topic_matches(topic, r"\bestimation\b", r"\binference\b"):
        prompt = f"What is the goal of estimation and inference from data?"
        options = [
            "Use sample data to quantify unknown parameters and the uncertainty around them.",
            "Replace probability models with fixed answers that have no uncertainty.",
            "Make every sample statistic equal to the population value.",
            "Avoid assumptions about the data-generating process entirely.",
        ]
        explanation = "Inference connects observed data to population quantities while accounting for sampling variability."
    elif _topic_matches(topic, r"\bfunctions?\b"):
        prompt = f"When studying functions of random variables, what must be tracked?"
        options = [
            "How the transformation changes the distribution and dependence structure of the variables.",
            "Only the names of the input variables, not their distributions.",
            "The largest possible output value and nothing else.",
            "Whether the transformed variable has the same mean as the input.",
        ]
        explanation = "Transformations can change distributions, expectations, variance, and dependence."
    elif _topic_matches(topic, r"\bscatter\b", r"\bvisualization\b", r"\bhistograms?\b", r"\bipl\b"):
        prompt = f"What is the main statistical purpose of visualizations such as scatter plots and histograms?"
        options = [
            "Reveal distribution shape, spread, outliers, and relationships that guide model choice.",
            "Prove that the data came from a Gaussian distribution.",
            "Replace probability calculations with visual preference.",
            "Guarantee that all variables are independent.",
        ]
        explanation = "Exploratory plots help diagnose structure before selecting or checking probability models."
    else:
        prompt = f"Which statement best applies '{topic}' to {subject}?"
        options = [
            f"It identifies a specific distributional assumption, relationship, or data behavior that must be checked in context.",
            f"It is only a label and does not affect modelling, estimation, or interpretation.",
            f"It guarantees independence between all variables in the selected material.",
            f"It can be used without defining variables, outcomes, or assumptions.",
        ]
        explanation = f"The topic '{topic}' should be used through definitions, assumptions, and evidence from the selected material."

    rotated_options, answer_key = _rotate_options(options, index % 4)
    return {
        "id": f"q{index + 1}",
        "kind": "mcq",
        "prompt": prompt,
        "options": rotated_options,
        "answerKey": answer_key,
        "points": points,
        "explanation": explanation,
    }


def _build_local_questions(
    *,
    assignment_type: str,
    subject: str,
    source_text: str,
    count: int,
    total_points: int,
) -> list[dict[str, Any]]:
    topics = _question_topics(source_text, subject, max(count, 4))
    points = _point_distribution(total_points, count)
    if assignment_type == "mcq":
        return [_topic_mcq(topics[index % len(topics)], subject, index, points[index]) for index in range(count)]
    if assignment_type == "qa":
        questions = []
        for index in range(count):
            topic = topics[index % len(topics)]
            topic_keywords = _keywords(topic, subject, 4)
            questions.append(
                {
                    "id": f"q{index + 1}",
                    "kind": "qa",
                    "prompt": (
                        f"Using the selected material, explain {topic} in {subject}. "
                        "Include the formal idea, one assumption, one data example, and one limitation."
                    ),
                    "expectedKeywords": topic_keywords + ["assumption", "example", "limitation"],
                    "points": points[index],
                }
            )
        return questions
    selected = topics[: min(5, len(topics))]
    return [
        {
            "id": "brief",
            "kind": "file",
            "prompt": f"Prepare a PDF or DOC/DOCX analytical report on {subject} using {', '.join(selected)} as the core focus.",
            "requirements": [
                "State the problem, variables, and probability or statistical model being used.",
                "Explain at least three selected syllabus/resource concepts with examples.",
                "Include one visualization or table idea and explain what it reveals.",
                "Discuss assumptions, limitations, and how a professor should evaluate the work.",
                "Submit only PDF, DOC, or DOCX files.",
            ],
            "points": total_points,
        }
    ]


def build_assignment_blueprint(
    *,
    assignment_type: str,
    subject: str,
    title: str,
    source_title: str,
    source_text: str,
    question_count: int,
    total_points: int,
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    clean_subject = _clean_text(subject) or "Coursework"
    clean_title = _clean_text(title) or f"{clean_subject} AI Assignment"
    clean_source_title = _clean_text(source_title) or "Selected course material"
    clean_source, source_warning = _sanitize_source_for_generation(
        source_text,
        clean_subject,
        clean_source_title,
    )
    count = max(1, min(question_count, 12))

    if api_key and model:
        try:
            content, rubric = _build_assignment_with_openai(
                api_key=api_key,
                model=model,
                assignment_type=assignment_type,
                subject=clean_subject,
                title=clean_title,
                source_title=clean_source_title,
                source_text=clean_source,
                question_count=count,
                total_points=total_points,
            )
            content["generationMode"] = "openai"
            if source_warning:
                content["sourceWarning"] = source_warning
            return content, rubric
        except Exception:
            pass

    base_instructions = (
        f"CampusVerse AI created this {clean_title} from {clean_source_title}. "
        "Answer with academic honesty, clear reasoning, and evidence from the selected material."
    )

    if assignment_type == "mcq":
        questions = _build_local_questions(
            assignment_type=assignment_type,
            subject=clean_subject,
            source_text=clean_source,
            count=count,
            total_points=total_points,
        )
        rubric = _fallback_rubric(assignment_type, total_points)
    elif assignment_type == "qa":
        questions = _build_local_questions(
            assignment_type=assignment_type,
            subject=clean_subject,
            source_text=clean_source,
            count=count,
            total_points=total_points,
        )
        rubric = _fallback_rubric(assignment_type, total_points)
    else:
        questions = _build_local_questions(
            assignment_type=assignment_type,
            subject=clean_subject,
            source_text=clean_source,
            count=1,
            total_points=total_points,
        )
        rubric = _fallback_rubric(assignment_type, total_points)

    content = {
        "title": clean_title,
        "instructions": base_instructions,
        "sourceTitle": clean_source_title,
        "questions": questions,
        "allowedFileTypes": ["pdf", "doc", "docx"] if assignment_type == "file" else [],
        "generationMode": "local_fallback",
    }
    if source_warning:
        content["sourceWarning"] = source_warning
    return content, rubric


def review_digital_submission(
    *,
    assignment_type: str,
    content: dict[str, Any],
    answers: dict[str, str],
    total_points: int,
) -> dict[str, Any]:
    questions = content.get("questions") if isinstance(content.get("questions"), list) else []
    if not questions:
        return {
            "score": 0,
            "grade": "Needs Revision",
            "feedback": "No questions were available for this assignment.",
            "criteria": [],
        }

    if assignment_type == "mcq":
        correct = 0
        criteria = []
        for question in questions:
            qid = str(question.get("id", ""))
            expected = str(question.get("answerKey", "")).strip().upper()
            actual = str(answers.get(qid, "")).strip().upper()
            is_correct = expected and actual == expected
            correct += 1 if is_correct else 0
            criteria.append(
                {
                    "label": f"Question {len(criteria) + 1}",
                    "status": "correct" if is_correct else "review",
                    "detail": "Matched AI answer key" if is_correct else f"Expected option {expected or 'A'}.",
                }
            )
        score = round((correct / len(questions)) * 100)
        feedback = (
            f"AI auto-graded {correct} of {len(questions)} MCQs as correct. "
            "Professor can override the grade after review."
        )
    else:
        earned = 0.0
        criteria = []
        for question in questions:
            qid = str(question.get("id", ""))
            answer = _clean_text(answers.get(qid, ""))
            keywords = [str(item).lower() for item in question.get("expectedKeywords", [])]
            word_count = len(answer.split())
            keyword_hits = len([keyword for keyword in keywords if keyword and keyword in answer.lower()])
            length_score = min(1.0, word_count / 55)
            keyword_score = min(1.0, keyword_hits / max(1, len(keywords)))
            q_score = (length_score * 0.55) + (keyword_score * 0.45)
            earned += q_score
            criteria.append(
                {
                    "label": f"Question {len(criteria) + 1}",
                    "status": "strong" if q_score >= 0.75 else "needs_review",
                    "detail": f"{word_count} words, {keyword_hits}/{len(keywords)} key ideas detected.",
                }
            )
        score = round((earned / len(questions)) * 100)
        feedback = (
            "AI reviewed the written responses for coverage, specificity, and concept evidence. "
            "Professor can adjust grade or feedback if the answer needs human judgment."
        )

    return {
        "score": min(score, total_points),
        "grade": grade_from_score(score),
        "feedback": feedback,
        "criteria": criteria,
    }


def review_file_submission(
    *,
    filename: str,
    notes: str,
    file_size: int,
    total_points: int,
) -> dict[str, Any]:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    type_ok = extension in {"pdf", "doc", "docx"}
    notes_score = min(18, len(_clean_text(notes).split()) * 2)
    size_score = 36 if file_size >= 25_000 else 24 if file_size >= 8_000 else 14
    format_score = 26 if type_ok else 0
    structure_score = 20 if notes.strip() else 14
    score = min(100, format_score + size_score + structure_score + notes_score)
    criteria = [
        {"label": "File type", "status": "pass" if type_ok else "review", "detail": extension.upper() or "Unknown"},
        {"label": "Document weight", "status": "pass" if file_size >= 8_000 else "review", "detail": f"{round(file_size / 1024, 1)} KB"},
        {"label": "Submission notes", "status": "pass" if notes.strip() else "review", "detail": "Notes included" if notes.strip() else "No notes added"},
    ]
    return {
        "score": round((score / 100) * total_points),
        "grade": grade_from_score(score),
        "feedback": (
            "AI checked the uploaded document for accepted format, likely completeness, and supplied notes. "
            "Professor review remains available for final grade correction."
        ),
        "criteria": criteria,
    }
