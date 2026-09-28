"""Versioned domain contracts. No HTTP, SQLite or provider dependencies."""
from dataclasses import asdict, dataclass
from typing import Protocol

API_VERSION = '2.4'


@dataclass(frozen=True)
class Candidate:
    document_id: str
    document_version: str
    block_id: str
    title: str
    locator: dict
    excerpt: str
    start: int
    end: int
    retrieval_score: float  # Ranking signal, never a probability of truth.

    def to_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class Assessment:
    state: str  # evaluated | unavailable | skipped | blocked
    relation: str = 'unassessed'
    reason: str = ''
    provider: str = 'none'
    model: str = ''

    def to_dict(self):
        return asdict(self)


class Retriever(Protocol):
    def retrieve(self, query: str, limit: int = 4) -> list[Candidate]: ...


class Judge(Protocol):
    def assess(self, claim: str, candidate: Candidate) -> Assessment: ...


class ReviewRepository(Protocol):
    def save_review(self, article: str, result: dict, corpus_revision: int) -> None: ...
