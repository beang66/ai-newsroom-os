(() => {
  if (!window.TextEditor || !window.CardEditor) {
    console.error("검수 화면 연결: script 순서를 확인해주세요.");
    return;
  }

  const get = (id) => document.getElementById(id);

  const names = {
    instagram: "Instagram",
    threads: "Threads",
    blog: "Blog",
  };

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h2");
  heading.textContent = "원고 검수";

  const guide = document.createElement("p");
  guide.className = "notice";
  guide.textContent =
    "현재 보고 있는 플랫폼의 원고를 생성 당시의 원문과 조건으로 검수합니다.";

  const button = document.createElement("button");
  button.className = "dark";
  button.style.width = "100%";

  const status = document.createElement("p");
  status.className = "notice";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.whiteSpace = "pre-wrap";

  const results = document.createElement("div");

  panel.append(heading, guide, button, status, results);
  document.querySelector(".left").append(panel);

  const style = document.createElement("style");

  style.textContent = `
    .validation-issue {
      padding: 14px;
      margin: 12px 0;
      border: 1px solid #e2ded5;
      border-radius: 12px;
      background: #faf9f6;
      overflow-wrap: anywhere;
    }

    .validation-issue p {
      margin: 8px 0;
      font-size: 12px;
      line-height: 1.7;
      white-space: pre-wrap;
    }
  `;

  document.head.append(style);

  let busy = false;

  // 현재 편집 내용만 추출해 사진 등은 검수 요청에서 제외
  function makePayload(platform) {
    let context;
    let draft;

    if (platform === "instagram") {
      context = state.instagram_generation_input;

      draft = {
        core_text: state.core_text,

        cards: state.cards.map((card, index) => ({
          card_id: card.card_id,
          page: index + 1,

          // 현재 카드 순서를 기준으로 역할 결정
          role:
            index === 0
              ? "cover"
              : index === state.cards.length - 1
              ? "closing"
              : "body",

          content: {
            keyword: card.keyword,
            headline: card.headline,
            body: card.body,
          },

          source_evidence: card.source_evidence || [],
        })),
      };
    } else {
      const textDraft = state.text_drafts?.[platform];

      if (!textDraft) {
        throw new Error(`${names[platform]} 원고를 먼저 생성해주세요.`);
      }

      context = textDraft.generation_input;

      if (platform === "threads") {
        draft = {
          opening: textDraft.opening,
          paragraphs: textDraft.paragraphs,
          closing: textDraft.closing,
          source_evidence: textDraft.source_evidence || [],
        };
      } else {
        draft = {
          title: textDraft.title,
          intro: textDraft.intro,

          sections: textDraft.sections.map((section) => ({
            heading: section.heading,
            body: section.body,
            source_evidence: section.source_evidence || [],
          })),

          conclusion: textDraft.conclusion,
          source_evidence: textDraft.source_evidence || [],
        };
      }
    }

    if (
      !context?.article?.title ||
      !context?.article?.content ||
      !Array.isArray(context.selected_keywords)
    ) {
      throw new Error(
        "이 초안에 생성 당시 원문이 저장되어 있지 않습니다. 원문을 입력하고 해당 플랫폼을 다시 생성해주세요."
      );
    }

    return structuredClone({
      platform,
      article: context.article,
      selected_keywords: context.selected_keywords,
      requirements: context.requirements || "",
      draft,
    });
  }

  function friendlyLocation(location) {
    return String(location)
      .replace(/cards\[(\d+)\]/g, (_, index) =>
        `${Number(index) + 1}번 카드`
      )
      .replace(/paragraphs\[(\d+)\]/g, (_, index) =>
        `본문 ${Number(index) + 1}`
      )
      .replace(/sections\[(\d+)\]/g, (_, index) =>
        `블로그 문단 ${Number(index) + 1}`
      )
      .replace(/core_text/g, "핵심 요약")
      .replace(/source_evidence/g, "원문 근거")
      .replace(/\.?content/g, "")
      .replace(/headline/g, "제목")
      .replace(/keyword/g, "키워드")
      .replace(/opening/g, "도입")
      .replace(/intro/g, "도입")
      .replace(/heading/g, "소제목")
      .replace(/body/g, "본문")
      .replace(/closing/g, "마무리")
      .replace(/conclusion/g, "결론")
      .replace(/summary/g, "요약")
      .replace(/title/g, "제목");
  }

  function addLine(container, label, value) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `${label}: ${value}`;
    container.append(paragraph);
  }

  function render() {
    if (busy) return;

    const platform = window.TextEditor.getPlatform();

    button.textContent = `${names[platform]} 현재 원고 검수`;
    results.replaceChildren();

    let payload;

    try {
      payload = makePayload(platform);
    } catch (error) {
      status.textContent = error.message;
      return;
    }

    const record = state.validation_results?.[platform];

    if (!record) {
      status.textContent = "아직 검수하지 않은 원고입니다.";
      return;
    }

    const stale =
      record.invalidated === true ||
      record.snapshot !== JSON.stringify(payload);

    const validation = record.result;

    status.textContent = stale
      ? "원고가 변경되었습니다. 재검수가 필요합니다.\n아래 목록은 수정 전 검수 결과입니다."
      : [
          validation.status === "passed"
            ? "이번 AI 검수에서 문제를 찾지 못했습니다."
            : `수정이 필요한 문제: ${validation.issue_count}개`,
          `사실관계: ${validation.fact.issue_count}개`,
          `요구사항: ${validation.requirement.issue_count}개`,
          "최종 내용은 직접 확인해주세요.",
        ].join("\n");

    for (const [label, check] of [
      ["사실관계", validation.fact],
      ["요구사항", validation.requirement],
    ]) {
      for (const issue of check.issues) {
        const box = document.createElement("div");
        box.className = "validation-issue";

        const title = document.createElement("strong");
        title.textContent =
          `${label} · ${friendlyLocation(issue.location)}`;

        box.append(title);

        if (issue.problematic_text) {
          addLine(box, "확인할 내용", issue.problematic_text);
        }

        addLine(box, "이유", issue.reason);
        addLine(box, "수정 방향", issue.suggestion);

        if (issue.source_evidence.length) {
          addLine(
            box,
            "원문 근거",
            issue.source_evidence.join("\n")
          );
        }

        if (!issue.evidence_quotes_valid) {
          addLine(
            box,
            "근거 확인",
            "검수자가 제시한 인용이 원문과 일치하지 않아 직접 확인이 필요합니다."
          );
        }

        results.append(box);
      }
    }
  }

  button.addEventListener("click", async () => {
    if (busy) return;

    const generationButtons = [
      ...document.querySelectorAll(
        "#generate-instagram, #generate-selected, " +
        ".text-generate-tools button, #suggest-keywords"
      ),
    ];

    if (generationButtons.some((item) => item.disabled)) {
      status.textContent =
        "진행 중인 생성이 끝난 뒤 검수해주세요.";
      return;
    }

    const platform = window.TextEditor.getPlatform();

    let payload;

    try {
      payload = makePayload(platform);
    } catch (error) {
      status.textContent = error.message;
      return;
    }

    const snapshot = JSON.stringify(payload);
    const revisionBeforeRequest = window.CardEditor.getRevision();

    const fields = [
      ...document.querySelectorAll(
        "#article-title, #article-content, #custom-keywords, " +
        "#article-requirements, #keyword-candidates input, " +
        ".platform input, #save, #load"
      ),
      ...generationButtons,
      button,
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    const surfaces = [
      get("stage").closest(".panel"),
      get("cards").closest(".panel"),
      document.querySelector(".photo-tools"),
    ].filter(Boolean);

    const previousInert = surfaces.map((element) => element.inert);

    busy = true;

    fields.forEach((field) => {
      field.disabled = true;
    });

    surfaces.forEach((element) => {
      element.inert = true;
    });

    status.textContent =
      `${names[platform]} 사실관계와 요구사항을 검수하고 있습니다…`;

    let failure = "";

    try {
      const response = await fetch("/api/validate", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: snapshot,
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          "검수 서버가 JSON을 반환하지 않았습니다. validation-routes 연결을 확인해주세요."
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "검수에 실패했습니다.");
      }

      if (
        window.CardEditor.getRevision() !== revisionBeforeRequest ||
        JSON.stringify(makePayload(platform)) !== snapshot
      ) {
        throw new Error(
          "검수 중 원고가 변경되어 결과를 적용하지 않았습니다."
        );
      }

      if (result.validation?.platform !== platform) {
        throw new Error("검수 결과의 플랫폼이 일치하지 않습니다.");
      }

      state.validation_results ??= {};

      state.validation_results[platform] = {
        snapshot,
        invalidated: false,
        result: result.validation,
      };

      if (platform === "instagram") {
        state.validation_status = result.validation.status;
      } else {
        state.text_drafts[platform].validation_status =
          result.validation.status;
      }

      // 검수 결과도 초안 저장 대상
      revision++;
    } catch (error) {
      failure = error.message;
    } finally {
      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });

      surfaces.forEach((element, index) => {
        element.inert = previousInert[index];
      });

      busy = false;
      render();

      if (failure) {
        status.textContent = `검수 실패: ${failure}`;
      }
    }
  });

  // 직접 글을 수정하면 이전 결과를 재검수 필요로 표시
  document.addEventListener("input", (event) => {
    if (
      !event.target.matches(
        "[data-field], .text-editor-field textarea"
      )
    ) {
      return;
    }

    const platform = window.TextEditor.getPlatform();
    const record = state.validation_results?.[platform];

    if (record) {
      record.invalidated = true;
    }

    queueMicrotask(render);
  });

  // 플랫폼 전환, 카드 삭제·이동 후 상태 갱신
  document.addEventListener("click", (event) => {
    if (
      event.target.closest(".platform-tabs") ||
      ["add", "delete", "up", "down"].includes(event.target.id)
    ) {
      queueMicrotask(render);
    }
  });

  // 생성 완료와 초안 불러오기 후 상태 갱신
  window.TextEditor.showPlatform =
    new Proxy(window.TextEditor.showPlatform, {
      apply(target, thisArg, args) {
        const result = Reflect.apply(target, thisArg, args);
        render();
        return result;
      },
    });

  const draftFile = get("draft-file");
  const originalLoad = draftFile.onchange;

  draftFile.onchange = async (event) => {
    await originalLoad.call(draftFile, event);
    render();
  };

  const originalApply = window.CardEditor.applyInstagramDraft;

  window.CardEditor.applyInstagramDraft = function (...args) {
    const result = originalApply.apply(this, args);
    queueMicrotask(render);
    return result;
  };

  render();
})();