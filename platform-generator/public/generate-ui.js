// ============================================================
// generate-ui.js: 독립 카드뉴스 생성 버튼
// ============================================================
// 플랫폼 선택과 관계없이 카드뉴스를 생성합니다.
// 카드뉴스 전용 API와 독립 생성 함수를 사용합니다.
// 서버 요청은 api.js의 NewsApi에 위임합니다.
// generate-card-news ID는 카드뉴스 생성 버튼과 공통 요청 잠금에 사용합니다.

(() => {
  // 1. 기사 입력과 카드 편집기 연결 확인
  const get = (id) => document.getElementById(id);
  const requirements = get("article-requirements");

  if (!requirements || !window.NewsInput || !window.CardEditor || !window.NewsApi) {
    console.error("기사 입력, api.js, 카드 편집기 연결을 확인해주세요.");
    return;
  }

  // 2. 독립적인 카드뉴스 생성 버튼과 안내 생성
  const box = document.createElement("div");
  box.id = "card-news-generation-tools";
  box.style.marginTop = "10px";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "generate-card-news";
  button.className = "dark";
  button.textContent = "카드뉴스만 생성";
  button.style.width = "100%";

  const status = document.createElement("p");
  status.id = "generation-status";
  status.className = "notice";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.whiteSpace = "pre-wrap";

  box.append(button, status);
  get("card-news-options").append(box);
  let busy = false;

  // 3. 기사 원문에서 카드 초안 생성
  button.addEventListener("click", async () => {
    if (busy) return;
    if (get("generate-selected")?.disabled || get("db-article")?.disabled) {
      status.textContent = "현재 진행 중인 요청이 끝난 뒤 실행해주세요.";
      return;
    }

    // 요청 시작 시점의 원문과 조건을 고정합니다.
    const request = structuredClone(window.NewsInput.getRequest());
    if (!request.article.title || !request.article.content) {
      status.textContent = "기사 제목과 원문을 먼저 입력해주세요.";
      return;
    }

    const input = {
      article: request.article,
      selected_keywords: request.selected_keywords,
      requirements: request.requirements,
    };
    const expectedRevision = window.CardEditor.getRevision();
    // 4. 입력, 생성 버튼, 편집 영역을 잠그고 기존 상태를 보관
    const fields = [...document.querySelectorAll(
      "#db-article, #refresh-db-articles, #include-card-news, #custom-keywords, " +
      "#article-requirements, " +
      ".platform input, #generate-selected, #load-local-draft, #save, #load"
    )];
    const previousDisabled = fields.map((field) => field.disabled);
    const surfaces = [get("stage")?.closest(".panel"), get("cards")?.closest(".panel"),
      document.querySelector(".photo-tools")].filter(Boolean);
    const previousInert = surfaces.map((element) => element.inert);

    busy = true;
    button.disabled = true;
    button.textContent = "카드뉴스 생성 중…";
    fields.forEach((field) => { field.disabled = true; });
    surfaces.forEach((element) => { element.inert = true; });
    status.textContent = "기사 원문에서 카드뉴스 초안을 생성하고 있습니다…";

    try {
      await window.NewsInput.freeze(input);
      // 5. Core의 DB 고정본으로 카드뉴스를 생성합니다.
      const result = await window.NewsApi.generateCardNews(input);
      if(!window.NewsInput.isCurrent(input))throw Error('기사가 변경되어 결과를 적용하지 않았습니다.');

      window.CardEditor.applyCardNewsDraft(result.draft, expectedRevision, input);

      // 플랫폼 원고를 유지하고 독립 카드뉴스 탭으로 전환합니다.
      window.TextEditor?.showPlatform("card_news");

      const evidenceIssues = result.draft.cards.filter(
        (card) => card.evidence_status!=='user_notice'&&card.evidence_valid !== true
      ).length + (result.draft.core_text?.evidence_valid === true ? 0 : 1);

      status.textContent = [
        `${result.draft.cards.length}장 생성 완료`,
        `구성 이유: ${result.draft.card_count_reason || "설명 없음"}`,
        "오른쪽에서 카드를 선택하고 가운데에서 수정하세요.",
        evidenceIssues === 0
          ? "인용 근거의 원문 존재 여부를 확인했습니다."
          : `원문 근거를 확인해야 하는 항목: ${evidenceIssues}개`,
        result.draft.generation_review ? (result.draft.generation_review.status==='passed'
          ? '생성본의 사실관계·내용 배분 검수를 통과했습니다. 편집 후 JPG 출력 전 현재 전체 카드를 다시 확인합니다.'
          : '생성본에 수정할 검수 문제가 남아 있습니다. 원고 검수에서 확인하고 수정한 뒤 출력해주세요.')
          : '전체 내용의 사실관계·요구사항 검수는 아직 진행하지 않았습니다.',
      ].join("\n");
    } catch (error) {
      status.textContent = `생성 실패: ${error.message}`;
    } finally {
      // 6. 성공·실패와 관계없이 잠금 상태 복원
      fields.forEach((field, index) => { field.disabled = previousDisabled[index]; });
      surfaces.forEach((element, index) => { element.inert = previousInert[index]; });
      busy = false;
      button.disabled = false;
      button.textContent = "카드뉴스만 생성";
    }
  });
})();
