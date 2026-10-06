(() => {
  const get = (id) => document.getElementById(id);

  if (
    !window.NewsInput ||
    !window.CardEditor ||
    !window.TextEditor
  ) {
    console.error("일괄 생성 연결: script 순서를 확인해주세요.");
    return;
  }

  const instagramButton = get("generate-instagram");

  if (!instagramButton) {
    console.error("Instagram 생성 버튼을 찾지 못했습니다.");
    return;
  }

  const names = {
    instagram: "Instagram",
    threads: "Threads",
    blog: "Blog",
  };

  const box = document.createElement("div");
  box.style.marginTop = "18px";
  box.style.marginBottom = "18px";

  const button = document.createElement("button");
  button.id = "generate-selected";
  button.className = "dark";
  button.textContent = "선택한 플랫폼 생성";
  button.style.width = "100%";

  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent =
    "체크한 플랫폼을 모두 생성합니다. 해당 플랫폼의 기존 초안이 교체되므로 보관할 내용은 먼저 저장해주세요.";

  const status = document.createElement("p");
  status.className = "notice";
  status.style.whiteSpace = "pre-wrap";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  box.append(button, notice, status);

  // 기존 개별 생성 버튼 위에 배치
  instagramButton.parentElement.before(box);

  const platformNotice = document.querySelector(
    ".left .panel > .notice"
  );

  if (platformNotice) {
    platformNotice.textContent =
      "체크박스로 생성할 플랫폼을 선택하고, 가운데 위의 버튼으로 결과를 전환합니다.";
  }

  let busy = false;

  button.addEventListener("click", async () => {
    if (busy) return;

    const otherGenerationButtons = [
      instagramButton,
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

    // 세 플랫폼에 사용할 입력을 시작 시점에 고정
    const request = structuredClone(window.NewsInput.getRequest());

    const platforms = request.platforms.filter(
      (platform) => Object.hasOwn(names, platform)
    );

    if (!platforms.length) {
      status.textContent = "플랫폼을 하나 이상 체크해주세요.";
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
        "#article-title, #article-content, #custom-keywords, " +
        "#article-requirements, #suggest-keywords, " +
        "#keyword-candidates input, .platform input, #save, #load"
      ),
      ...otherGenerationButtons,
      button,
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    const surfaces = [
      get("stage").closest(".panel"),
      get("cards").closest(".panel"),
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
    button.textContent = "선택한 플랫폼 생성 중…";

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
          const response = await fetch(
            `/api/generate/${platform}`,
            {
              method: "POST",

              headers: {
                "Content-Type": "application/json",
              },

              body: JSON.stringify(generationInput),
            }
          );

          let result;

          try {
            result = await response.json();
          } catch {
            throw new Error(
              "서버 응답을 읽지 못했습니다. 서버 실행을 확인해주세요."
            );
          }

          if (!response.ok || !result.success) {
            throw new Error(
              result.error || "원고 생성에 실패했습니다."
            );
          }

          if (platform === "instagram") {
            window.CardEditor.applyInstagramDraft(
              result.draft,
              expectedRevision
            );

            // Instagram도 검수에 사용할 원문과 조건 보관
            state.instagram_generation_input =
              structuredClone(generationInput);
          } else {
            window.TextEditor.applyDraft(
              platform,
              result.draft,
              generationInput,
              expectedRevision
            );
          }

          expectedRevision = window.CardEditor.getRevision();

          state.platforms = platforms;

          successfulPlatforms.push(platform);

          progress[platform] =
            platform === "instagram"
              ? `${names[platform]}: ${result.draft.cards.length}장 생성 완료`
              : `${names[platform]}: 원고 생성 완료`;
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
        const firstView = successfulPlatforms.includes("instagram")
          ? "instagram"
          : successfulPlatforms[0];

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
      button.textContent = "선택한 플랫폼 생성";
    }
  });
})();