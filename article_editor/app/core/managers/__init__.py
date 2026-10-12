"""App Core managers (see APP_CORE_ARCHITECTURE.md §4).

Each manager owns one responsibility of the integration layer. The Frontend never
talks to a manager directly; it goes through the App Core API. Internal
implementation may change freely, the API contract stays stable.

Project / Collaboration / Sync / Encryption / Update 매니저는 구현할 때 추가한다(문서 §4).
"""
