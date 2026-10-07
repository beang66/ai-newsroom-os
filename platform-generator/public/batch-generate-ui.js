// 일괄 생성: Instagram → Threads → Blog → 선택적 카드뉴스 순서로 처리합니다.
// 카드뉴스 체크가 없으면 기존 카드를 보존합니다. 체크하면 새 초안으로 교체합니다.
(() => {
  const get = (id) => document.getElementById(id);

  if (
    !window.NewsInput ||
    !window.CardEditor ||
    !window.TextEditor ||
    !window.NewsApi
  ) {
    console.error("일괄 생성 연결: script 순서를 확인해주세요.");
    return;
  }

  const cardButton = get("generate-instagram");

  if (!cardButton) {
    console.error("카드뉴스 생성 버튼을 찾지 못했습니다.");
    return;
  }

  const names = {
    instagram: "Instagram",
    card_news: "카드뉴스",
    threads: "Threads",
    blog: "Blog",
  };

  const box = document.createElement("div");
  box.style.marginTop = "18px";
  box.style.marginBottom = "18px";

  const button = document.createElement("button");
  button.id = "generate-selected";
  button.className = "dark";
  button.textContent = "선택한 항목 생성";
  button.style.width = "100%";

  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent =
    "선택한 Instagram·Threads·Blog 원고와 추가 카드뉴스를 생성합니다. 체크한 결과물은 새 초안으로 교체됩니다. 보관할 내용은 먼저 저장해주세요.";

  const status = document.createElement("p");
  status.className = "notice";
  status.style.whiteSpace = "pre-wrap";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  box.append(button, notice, status);

  // 기존 개별 생성 버튼 위에 배치
  get("card-news-options").after(box);

  const platformNotice = document.getElementById("platform-notice");

  if (platformNotice) {
    platformNotice.textContent =
      "플랫폼 원고와 추가 카드뉴스를 선택하세요. 카드뉴스는 별도 결과물이며 카드뉴스도 생성을 체크해 제작합니다.";
  }

  let busy = false;

  button.addEventListener("click", async () => {
    if (busy) return;

    const otherGenerationButtons = [
      cardButton,
      ...document.querySelectorAll(".text-generate-tools button"),
    ];

    if (
      get("suggest-keywords")?.disabled ||
      otherGenerationButtons.some((item) => item.disabled)
    ) {
      status.textContent =
        "현재 진행 중인 요청이 끝난 뒤 실행해주세요.";
      return;
    }

    // 텍스트 플랫폼에 사용할 입력을 시작 시점에 고정
    const request = structuredClone(window.NewsInput.getRequest());

    const platforms = request.platforms.filter(
      (platform) => ["instagram", "threads", "blog"].includes(platform)
    );

    if (request.include_card_news) platforms.push("card_news");

    if (!platforms.length) {
      status.textContent = "플랫폼 또는 카드뉴스도 생성을 선택해주세요.";
      return;
    }

    if (!request.article.title || !request.article.content) {
      status.textContent = "기사 제목과 원문을 입력해주세요.";
      return;
    }

    if (!request.selected_keywords.length) {
      status.textContent =
        "키워드를 선택하거나 직접 입력해주세요.";
      return;
    }

    const generationInput = {
      article: request.article,
      selected_keywords: request.selected_keywords,
      requirements: request.requirements,
    };

    const fields = [
      ...document.querySelectorAll(
        "#article-url, #import-article, #include-card-news, #article-title, #article-content, #custom-keywords, " +
        "#article-requirements, #suggest-keywords, " +
        "#keyword-candidates input, .platform input, #load-local-draft, #save, #load"
      ),
      ...otherGenerationButtons,
      button,
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    const surfaces = [
      get("stage")?.closest(".panel"),
      get("cards")?.closest(".panel"),
      document.querySelector(".photo-tools"),
    ].filter(Boolean);

    const previousInert = surfaces.map((element) => element.inert);

    const progress = Object.fromEntries(
      platforms.map((platform) => [
        platform,
        `${names[platform]}: 대기 중`,
      ])
    );

    function updateProgress() {
      status.textContent = platforms
        .map((platform) => progress[platform])
        .join("\n");
    }

    let expectedRevision = window.CardEditor.getRevision();
    const successfulPlatforms = [];

    busy = true;
    button.textContent = "선택한 항목 생성 중…";

    fields.forEach((field) => {
      field.disabled = true;
    });

    surfaces.forEach((element) => {
      element.inert = true;
    });

    updateProgress();

    try {
      for (const platform of platforms) {
        if (window.CardEditor.getRevision() !== expectedRevision) {
          progress[platform] =
            `${names[platform]}: 편집 내용이 변경되어 중단`;
          updateProgress();
          break;
        }

        progress[platform] = `${names[platform]}: 생성 중…`;
        updateProgress();

        try {
          // 카드뉴스 선택과 플랫폼 원고 선택을 구분합니다.
          if (platform === "card_news") {
            const result = await window.NewsApi.generateCardNews(generationInput);
            window.CardEditor.applyCardNewsDraft(result.draft, expectedRevision, generationInput);
          } else {
            const result = await window.NewsApi.generateDraft(platform, generationInput);
            window.TextEditor.applyDraft(platform, result.draft, generationInput, expectedRevision);
          }

          expectedRevision = window.CardEditor.getRevision();

          state.platforms = [...request.platforms];

          successfulPlatforms.push(platform);

          progress[platform] = `${names[platform]}: 원고 생성 완료`;
        } catch (error) {
          progress[platform] =
            `${names[platform]}: 실패 — ${error.message}`;

          // 기존 초안이 도중에 바뀌었다면 이후 요청도 중단
          if (window.CardEditor.getRevision() !== expectedRevision) {
            updateProgress();
            break;
          }
        }

        updateProgress();
      }

      // 중단되어 실행하지 않은 플랫폼 표시
      for (const platform of platforms) {
        if (progress[platform] === `${names[platform]}: 대기 중`) {
          progress[platform] =
            `${names[platform]}: 중단되어 생성하지 않음`;
        }
      }

      updateProgress();

      if (successfulPlatforms.length) {
        const firstView = successfulPlatforms[0];

        window.TextEditor.showPlatform(firstView);
      }

      status.textContent +=
        `\n\n${successfulPlatforms.length}/${platforms.length}개 플랫폼 생성 완료`;

      if (successfulPlatforms.length) {
        status.textContent +=
          "\n가운데 위의 플랫폼 버튼으로 결과를 확인하세요." +
          "\n전체 내용 검수는 아직 진행하지 않았습니다.";
      }
    } finally {
      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });

      surfaces.forEach((element, index) => {
        element.inert = previousInert[index];
      });

      busy = false;
      button.textContent = "선택한 항목 생성";
    }
  });
})();