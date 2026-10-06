(() => {
  if (!window.CardEditor || !window.NewsInput) {
    console.error("편집 화면 또는 기사 입력 연결을 확인해주세요.");
    return;
  }

  const get = (id) => document.getElementById(id);

  const center = get("stage").closest(".panel");
  const right = get("cards").closest(".panel");
  const photoTools = document.querySelector(".photo-tools");

  const centerOriginal = [...center.children].map((element) => ({
    element,
    hidden: element.hidden,
  }));

  const rightOriginal = [...right.children].map((element) => ({
    element,
    hidden: element.hidden,
  }));

  const names = {
    instagram: "Instagram",
    threads: "Threads",
    blog: "Blog",
  };

  let selectedView = "instagram";
  let busy = false;

  const style = document.createElement("style");

  style.textContent = `
    .platform-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .platform-tabs button[aria-pressed="true"] {
      background: #262724;
      color: white;
    }

    .text-editor-field {
      margin: 18px 0;
    }

    .text-editor-field label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 700;
    }

    .text-editor-field textarea {
      display: block;
      width: 100%;
      padding: 14px;
      border: 1px solid #dcd8cf;
      border-radius: 12px;
      background: #fff;
      color: #242522;
      font: inherit;
      line-height: 1.8;
      resize: vertical;
    }

    .text-outline button {
      display: block;
      width: 100%;
      margin: 10px 0;
      text-align: left;
    }

    .text-generate-tools button {
      display: block;
      width: 100%;
      margin: 10px 0;
    }
  `;

  document.head.append(style);

  const tabs = document.createElement("div");
  tabs.className = "platform-tabs";

  const tabButtons = {};

  for (const platform of Object.keys(names)) {
    const button = document.createElement("button");
    button.textContent = names[platform];
    button.setAttribute("aria-pressed", "false");
    button.onclick = () => showPlatform(platform);

    tabButtons[platform] = button;
    tabs.append(button);
  }

  const textEditor = document.createElement("div");
  textEditor.hidden = true;

  const outline = document.createElement("div");
  outline.className = "text-outline";
  outline.hidden = true;

  center.prepend(tabs);
  center.append(textEditor);
  right.append(outline);

  function showOriginal(items, show) {
    items.forEach(({ element, hidden }) => {
      element.hidden = show ? hidden : true;
    });
  }

  function markTextChanged(draft) {
    revision++;

    draft.validation_status = "needs_recheck";
    draft.evidence_status = "needs_recheck";

    const message = get("text-edit-status");

   if (message) {
  message.textContent =
    "내용이 수정되었습니다. 원문 근거와 요구사항을 다시 검수해야 합니다.";
}
  }

  function addField(labelText, value, onChange, rows = 5) {
    const wrapper = document.createElement("div");
    wrapper.className = "text-editor-field";

    const label = document.createElement("label");
    const textarea = document.createElement("textarea");

    textarea.id = "text-" + crypto.randomUUID();
    textarea.value = value;
    textarea.rows = rows;

    label.htmlFor = textarea.id;
    label.textContent = labelText;

    textarea.addEventListener("input", () => {
      onChange(textarea.value);
    });

    wrapper.append(label, textarea);
    textEditor.append(wrapper);

    const navigation = document.createElement("button");
    navigation.textContent = labelText;

    navigation.onclick = () => {
      textarea.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      textarea.focus({ preventScroll: true });
    };

    outline.append(navigation);
  }

  function showPlatform(platform) {
    selectedView = platform;

    Object.entries(tabButtons).forEach(([key, button]) => {
      button.setAttribute(
        "aria-pressed",
        String(key === platform)
      );
    });

    const instagram = platform === "instagram";

    showOriginal(centerOriginal, instagram);
    showOriginal(rightOriginal, instagram);

    textEditor.hidden = instagram;
    outline.hidden = instagram;

    if (photoTools) {
      photoTools.hidden = !instagram;
    }

    if (instagram) {
      draw();
      return;
    }

    textEditor.replaceChildren();
    outline.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = `${names[platform]} 원고 편집`;
    textEditor.append(heading);

    const outlineHeading = document.createElement("h2");
    outlineHeading.textContent = "원고 구성";
    outline.append(outlineHeading);

    const draft = state.text_drafts?.[platform];

    if (!draft) {
      const message = document.createElement("p");
      message.className = "notice";
      message.textContent =
        `아직 ${names[platform]} 원고가 없습니다. ` +
        "왼쪽에서 플랫폼을 체크하고 해당 생성 버튼을 눌러주세요.";

      textEditor.append(message);
      return;
    }

    const status = document.createElement("p");
    status.id = "text-edit-status";
    status.className = "notice";

    status.textContent =
      draft.validation_status === "needs_recheck"
        ? "수정된 원고입니다. 재검수가 필요합니다."
        : "AI 생성 초안입니다. 전체 내용 검수는 아직 진행하지 않았습니다.";

    textEditor.append(status);

    function update(setValue) {
      return (value) => {
        setValue(value);
        markTextChanged(draft);
      };
    }

    if (platform === "threads") {
      addField(
        "도입",
        draft.opening,
        update((value) => {
          draft.opening = value;
        }),
        3
      );

      draft.paragraphs.forEach((paragraph, index) => {
        addField(
          `본문 ${index + 1}`,
          paragraph,
          update((value) => {
            draft.paragraphs[index] = value;
          })
        );
      });

      addField(
        "마무리",
        draft.closing,
        update((value) => {
          draft.closing = value;
        }),
        3
      );
    }

    if (platform === "blog") {
      addField(
        "제목",
        draft.title,
        update((value) => {
          draft.title = value;
        }),
        2
      );

      addField(
        "도입",
        draft.intro,
        update((value) => {
          draft.intro = value;
        })
      );

      draft.sections.forEach((section, index) => {
        addField(
          `소제목 ${index + 1}`,
          section.heading,
          update((value) => {
            section.heading = value;
          }),
          2
        );

        addField(
          `본문 ${index + 1}`,
          section.body,
          update((value) => {
            section.body = value;
          }),
          8
        );
      });

      addField(
        "결론",
        draft.conclusion,
        update((value) => {
          draft.conclusion = value;
        })
      );
    }

    const evidence = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "생성 시 사용한 원문 근거";

    const list = document.createElement("ul");

    for (const quote of draft.source_evidence || []) {
      const item = document.createElement("li");
      item.textContent = quote;
      list.append(item);
    }

    evidence.append(summary, list);
    textEditor.append(evidence);
  }

  // 생성 버튼을 기존 Instagram 생성 영역 아래에 추가
  const instagramButton = get("generate-instagram");

  if (!instagramButton) {
    console.error("generate-ui.js 연결 순서를 확인해주세요.");
    return;
  }

  const generationTools = document.createElement("div");
  generationTools.className = "text-generate-tools";

  const generationStatus = document.createElement("p");
  generationStatus.className = "notice";
  generationStatus.setAttribute("role", "status");
  generationStatus.style.whiteSpace = "pre-wrap";

  const generationButtons = [];

  for (const platform of ["threads", "blog"]) {
    const button = document.createElement("button");
    button.textContent = `${names[platform]} 원고 생성`;
    button.onclick = () => generate(platform);

    generationButtons.push(button);
    generationTools.append(button);
  }

  generationTools.append(generationStatus);
  instagramButton.parentElement.after(generationTools);

  async function generate(platform) {
    if (busy) return;

    if (
      instagramButton.disabled ||
      get("suggest-keywords")?.disabled
    ) {
      generationStatus.textContent =
        "현재 진행 중인 생성이 끝난 뒤 실행해주세요.";
      return;
    }

    const request = window.NewsInput.getRequest();

    if (!request.platforms.includes(platform)) {
      generationStatus.textContent =
        `왼쪽 플랫폼 선택에서 ${names[platform]}를 체크해주세요.`;
      return;
    }

    if (!request.article.title || !request.article.content) {
      generationStatus.textContent =
        "기사 제목과 원문을 먼저 입력해주세요.";
      return;
    }

    if (!request.selected_keywords.length) {
      generationStatus.textContent =
        "키워드를 선택하거나 직접 입력해주세요.";
      return;
    }

    const expectedRevision = revision;

    const fields = [
      ...document.querySelectorAll(
        "#article-title, #article-content, #custom-keywords, " +
        "#article-requirements, #suggest-keywords, " +
        "#keyword-candidates input, .platform input, " +
        "#generate-instagram, #save, #load"
      ),
      ...generationButtons,
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    const surfaces = [center, right, photoTools].filter(Boolean);
    const previousInert = surfaces.map((element) => element.inert);

    busy = true;

    fields.forEach((field) => {
      field.disabled = true;
    });

    surfaces.forEach((element) => {
      element.inert = true;
    });

    generationStatus.textContent =
      `${names[platform]} 원고를 생성하고 있습니다…`;

    try {
      const response = await fetch(`/api/generate/${platform}`, {
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
        throw new Error("서버 응답을 읽지 못했습니다.");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "생성에 실패했습니다.");
      }

      if (revision !== expectedRevision) {
        throw new Error(
          "생성 중 초안이 변경되었습니다. 기존 편집 내용을 확인해주세요."
        );
      }

      if (result.draft?.platform !== platform) {
        throw new Error("응답의 플랫폼이 요청과 다릅니다.");
      }

      state.text_drafts ??= {};

      state.text_drafts[platform] = {
        ...result.draft,

        // 추후 검수에 사용할 생성 당시의 원문과 조건
        generation_input: structuredClone({
          article: request.article,
          selected_keywords: request.selected_keywords,
          requirements: request.requirements,
        }),
      };

      state.platforms = request.platforms;
      revision++;

      showPlatform(platform);

      generationStatus.textContent =
        `${names[platform]} 생성 완료\n` +
        "가운데 입력칸에서 수정할 수 있습니다.\n" +
        "다시 생성하면 해당 플랫폼의 기존 원고가 교체됩니다.";
    } catch (error) {
      generationStatus.textContent =
        `생성 실패: ${error.message}`;
    } finally {
      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });

      surfaces.forEach((element, index) => {
        element.inert = previousInert[index];
      });

      busy = false;
    }
  }

  // 기존 초안 불러오기 기능과 플랫폼 편집 화면 연결
  const draftFile = get("draft-file");
  const originalLoad = draftFile.onchange;

  draftFile.onchange = async (event) => {
    await originalLoad.call(draftFile, event);
    showPlatform(selectedView);
  };

    window.TextEditor = {
            getPlatform() {
      return selectedView;
    },
    showPlatform,

    applyDraft(platform, draft, input, expectedRevision) {
      if (revision !== expectedRevision) {
        throw new Error("생성 중 편집 내용이 변경되었습니다.");
      }

      if (
        !["threads", "blog"].includes(platform) ||
        draft?.platform !== platform
      ) {
        throw new Error("생성 결과의 플랫폼이 올바르지 않습니다.");
      }

      if (
        platform === "threads" &&
        (
          typeof draft.opening !== "string" ||
          !Array.isArray(draft.paragraphs) ||
          typeof draft.closing !== "string"
        )
      ) {
        throw new Error("Threads 원고 형식이 올바르지 않습니다.");
      }

      if (
        platform === "blog" &&
        (
          typeof draft.title !== "string" ||
          typeof draft.intro !== "string" ||
          !Array.isArray(draft.sections) ||
          typeof draft.conclusion !== "string"
        )
      ) {
        throw new Error("Blog 원고 형식이 올바르지 않습니다.");
      }

      state.text_drafts ??= {};

      state.text_drafts[platform] = {
        ...draft,
        generation_input: structuredClone(input),
      };

      revision++;
    },
  };


  showPlatform("instagram");
})();