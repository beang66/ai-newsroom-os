(() => {
  const requirements = document.getElementById("article-requirements");

  if (!requirements || !window.NewsInput || !window.CardEditor) {
    console.error(
      "생성 버튼 연결 실패: 기사 입력 화면과 편집 연결 코드를 확인해주세요."
    );
    return;
  }

  const box = document.createElement("div");
  box.style.marginTop = "16px";

  const button = document.createElement("button");
  button.id = "generate-instagram";
  button.className = "dark";
  button.textContent = "Instagram 카드뉴스 생성";
  button.style.width = "100%";

  const status = document.createElement("p");
  status.id = "generation-status";
  status.className = "notice";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.whiteSpace = "pre-wrap";

  status.textContent =
    "생성하면 현재 카드 목록이 새 초안으로 바뀝니다. 보관할 내용은 먼저 ‘초안 저장’을 눌러주세요.";

  box.append(button, status);
  requirements.insertAdjacentElement("afterend", box);

  let busy = false;

  button.addEventListener("click", async () => {
    if (busy) return;

    const keywordButton = document.getElementById("suggest-keywords");

    if (keywordButton?.disabled) {
      status.textContent =
        "키워드 후보 제안이 끝난 뒤 카드뉴스를 생성해주세요.";
      return;
    }

    const request = window.NewsInput.getRequest();

    if (!request.platforms.includes("instagram")) {
      status.textContent =
        "왼쪽 플랫폼 선택에서 Instagram을 체크해주세요.";
      return;
    }

    if (!request.article.title || !request.article.content) {
      status.textContent = "기사 제목과 원문을 먼저 입력해주세요.";
      return;
    }

    if (request.selected_keywords.length === 0) {
      status.textContent =
        "키워드 후보를 선택하거나 직접 키워드를 입력해주세요.";
      return;
    }

    const revisionBeforeRequest = window.CardEditor.getRevision();

    // 요청 중에는 기사와 생성 조건을 고정
    const fields = [
      ...document.querySelectorAll(
        "#article-title, #article-content, #custom-keywords, " +
        "#article-requirements, #suggest-keywords, " +
        "#keyword-candidates input, .platform input"
      ),
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    busy = true;
    button.disabled = true;
    button.textContent = "카드뉴스 생성 중…";

    fields.forEach((field) => {
      field.disabled = true;
    });

    status.textContent =
      "기사 원문으로 Instagram 초안을 생성하고 있습니다.\n" +
      "생성이 끝날 때까지 기존 카드 편집은 잠시 기다려주세요.";

    try {
      const response = await fetch("/api/generate/instagram", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          article: request.article,
          selected_keywords: request.selected_keywords,
          requirements: request.requirements,
        }),
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          "서버 응답을 읽지 못했습니다. 서버 실행과 generate-routes 연결을 확인해주세요."
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "카드뉴스 생성에 실패했습니다.");
      }

      window.CardEditor.applyInstagramDraft(
        result.draft,
        revisionBeforeRequest
      );

      state.instagram_generation_input = structuredClone({
  article: request.article,
  selected_keywords: request.selected_keywords,
  requirements: request.requirements,
});

      const evidenceIssues =
        result.draft.cards.filter(
          (card) => card.evidence_valid !== true
        ).length +
        (result.draft.core_text.evidence_valid === true ? 0 : 1);

      const messages = [
        `${result.draft.cards.length}장 생성 완료`,
        `구성 이유: ${result.draft.card_count_reason}`,
        "오른쪽 카드를 선택하고 가운데 글자를 클릭해 수정하세요.",
        evidenceIssues === 0
          ? "원문 근거 문장의 존재 여부를 확인했습니다."
          : `원문 근거를 확인해야 하는 항목: ${evidenceIssues}개`,
        "전체 내용의 사실관계·요구사항 검수는 아직 진행하지 않았습니다.",
      ];

      if (
        request.platforms.includes("threads") ||
        request.platforms.includes("blog")
      ) {
        messages.push(
          "이번 단계에서는 Instagram만 생성했습니다. Threads와 Blog는 다음 단계에서 연결합니다."
        );
      }

      status.textContent = messages.join("\n");
    } catch (error) {
      status.textContent = `생성 실패: ${error.message}`;
    } finally {
      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });

      busy = false;
      button.disabled = false;
      button.textContent = "Instagram 카드뉴스 생성";
    }
  });
})();