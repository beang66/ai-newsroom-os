(() => {
  // 1. 검수 UI가 사용하는 편집 모듈 확인
  // api.js와 text-editor-ui.js가 이 파일보다 먼저 로드되어야 합니다.
  if (!window.TextEditor || !window.CardEditor) {
    console.error("검수 화면 연결: script 순서를 확인해주세요.");
    return;
  }

  const get = (id) => document.getElementById(id);

  const names = {
    instagram: "Instagram",
    card_news: "카드뉴스",
    threads: "Threads",
    blog: "Blog",
  };

  // state와 revision은 index.html의 공통 편집 상태를 사용합니다.

  // 2. 왼쪽 패널에 검수 버튼·상태·결과 영역 생성
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

  // 3. 검수 문제 목록 스타일 적용
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

  // 4. 현재 편집본과 생성 당시 입력으로 검수 데이터 구성
  // 사진·화면 상태·이전 검수 결과는 요청에서 제외합니다.
  // 왼쪽 입력란의 현재 값이 아니라 초안 생성 당시 원문과 조건을 사용합니다.
  function makePayload(platform) {
    let context;
    let draft;

    if (platform === "card_news") {
      context = state.card_news_generation_input || state.instagram_generation_input;

      draft = {
        core_text: state.core_text,

        cards: state.cards.map((card, index) => ({
          card_id: card.card_id,
          page: index + 1,

          // 사용자가 바꾼 현재 카드 순서를 기준으로 역할 결정
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

          design: CardTemplate.normalizeDesign(card),
          source_evidence: card.source_evidence || [],
        })),
      };
    } else {
      const textDraft = state.text_drafts?.[platform];

      if (!textDraft) {
        throw new Error(`${names[platform]} 원고를 먼저 생성해주세요.`);
      }

      context = textDraft.generation_input;

      if (platform === "instagram") {
        draft = {opening: textDraft.opening, paragraphs: textDraft.paragraphs,
          closing: textDraft.closing, hashtags: textDraft.hashtags,
          block_evidence: textDraft.block_evidence || null,
          source_evidence: textDraft.source_evidence || []};
      } else if (platform === "threads") {
        draft = {
          draft_version: textDraft.draft_version || "",
          opening: textDraft.opening,
          paragraphs: textDraft.paragraphs,
          closing: textDraft.closing || "",
          source_evidence: textDraft.source_evidence || [],

          // 제목과 각 요약 문장의 근거를 검수 서버에 전달
          block_evidence: textDraft.block_evidence || null,

          // 링크 설정 변경도 검수 스냅샷에 반영
          source_url:
            textDraft.source_url ??
            textDraft.generation_input?.article?.url ??
            "",
          include_source_link: textDraft.include_source_link !== false,
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

    // 생성 당시 원문이 없는 예시·이전 초안은 검수할 수 없음
    if (
      !context?.article?.title ||
      !context?.article?.content ||
      !Array.isArray(context.selected_keywords)
    ) {
      throw new Error(
        "이 초안에 생성 당시 원문이 저장되어 있지 않습니다. 원문을 입력하고 해당 플랫폼을 다시 생성해주세요.",
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

  // 5. 서버가 반환한 문제 위치를 읽기 쉬운 이름으로 변환
  // 예: cards[0].content.headline → 1번 카드.제목
  function friendlyLocation(location) {
    return String(location)
      .replace(/cards\[(\d+)\]/g, (_, index) => `${Number(index) + 1}번 카드`)
      .replace(
        /paragraphs\[(\d+)\]/g,
        (_, index) => `본문 ${Number(index) + 1}`,
      )
      .replace(
        /sections\[(\d+)\]/g,
        (_, index) => `블로그 문단 ${Number(index) + 1}`,
      )
      .replace(/hashtags/g, "해시태그")
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

  // 검수 내용을 HTML로 해석하지 않고 텍스트로 표시
  function addLine(container, label, value) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `${label}: ${value}`;
    container.append(paragraph);
  }

  // 6. 현재 플랫폼의 검수 상태와 문제 목록 표시
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

    // 이전 검수 대상과 현재 원고가 다르면 재검수 안내
    // 직접 수정 이벤트로 무효화한 결과도 동일하게 처리
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

    // 7. 사실관계·요구사항 문제를 구분하여 표시
    for (const [label, check] of [
      ["사실관계", validation.fact],
      ["요구사항", validation.requirement],
    ]) {
      for (const issue of check.issues) {
        const box = document.createElement("div");
        box.className = "validation-issue";

        const title = document.createElement("strong");
        title.textContent = `${label} · ${friendlyLocation(issue.location)}`;

        box.append(title);

        if (issue.problematic_text) {
          addLine(box, "확인할 내용", issue.problematic_text);
        }

        addLine(box, "이유", issue.reason);
        addLine(box, "수정 방향", issue.suggestion);

        if (issue.source_evidence.length) {
          addLine(box, "원문 근거", issue.source_evidence.join("\n"));
        }

        // 검수 AI가 제시한 인용도 원문과 일치하는지 확인 필요
        if (!issue.evidence_quotes_valid) {
          addLine(
            box,
            "근거 확인",
            "검수자가 제시한 인용이 원문과 일치하지 않아 직접 확인이 필요합니다.",
          );
        }

        results.append(box);
      }
    }
  }

  // 8. 현재 플랫폼 원고 검수 버튼 처리
  button.addEventListener("click", async () => {
    if (busy) return;

    const generationButtons = [
      ...document.querySelectorAll(
        "#generate-instagram, #generate-selected, " +
          ".text-generate-tools button, #suggest-keywords",
      ),
    ];

    // 생성 또는 키워드 추천 중에는 검수를 시작하지 않음
    if (generationButtons.some((item) => item.disabled)) {
      status.textContent = "진행 중인 생성이 끝난 뒤 검수해주세요.";
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

    // 9. 검수 시작 시점의 원고와 편집 버전 고정
    // snapshot은 JSON 문자열이며 api.js에서 그대로 전송합니다.
    const snapshot = JSON.stringify(payload);
    const revisionBeforeRequest = window.CardEditor.getRevision();

    // 10. 검수 중 입력·생성·저장·불러오기 버튼 잠금
    const fields = [
      ...document.querySelectorAll(
        "#article-title, #article-content, #custom-keywords, " +
          "#article-requirements, #keyword-candidates input, " +
          ".platform input, #article-url, #import-article, #include-card-news, #load-local-draft, #save, #load",
      ),
      ...generationButtons,
      button,
    ];

    const previousDisabled = fields.map((field) => field.disabled);

    // 카드·텍스트 편집 및 사진 도구도 잠금
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

    status.textContent = `${names[platform]} 사실관계와 요구사항을 검수하고 있습니다…`;

    let failure = "";

    try {
      // 11. 서버 통신은 api.js에 위임
      // 요청·JSON 응답 변환·응답 오류 확인은 이 함수에서 처리합니다.
      const result = await NewsApi.validateDraft(snapshot);

      // 12. 검수 중 원고가 바뀌었다면 결과를 적용하지 않음
      // 편집 버전과 검수 대상 내용을 모두 비교합니다.
      if (
        window.CardEditor.getRevision() !== revisionBeforeRequest ||
        JSON.stringify(makePayload(platform)) !== snapshot
      ) {
        throw new Error("검수 중 원고가 변경되어 결과를 적용하지 않았습니다.");
      }

      if (result.validation?.platform !== platform) {
        throw new Error("검수 결과의 플랫폼이 일치하지 않습니다.");
      }

      // 13. 플랫폼별 검수 결과와 검사 대상 보관
      // state에 저장하므로 기존 초안 JSON 저장에도 포함됩니다.
      state.validation_results ??= {};

      state.validation_results[platform] = {
        snapshot,
        invalidated: false,
        result: result.validation,
      };

      if (platform === "card_news") {
        state.validation_status = result.validation.status;
        if (state.card_news) state.card_news.validation_status = result.validation.status;
      } else {
        state.text_drafts[platform].validation_status =
          result.validation.status;
      }

      // 검수 결과 추가도 저장해야 할 상태 변경으로 기록
      revision++;
    } catch (error) {
      failure = error.message;
    } finally {
      // 14. 성공·실패와 관계없이 기존 UI 상태 복원
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

  // 15. 직접 원고를 수정하면 이전 검수 결과 무효화
  // 사진 변경이나 기사 입력란 변경은 이 이벤트 대상에서 제외합니다.
  document.addEventListener("input", (event) => {
    if (!event.target.closest("[data-field], .text-editor-field textarea")) {
      return;
    }

    const platform = window.TextEditor.getPlatform();
    const record = state.validation_results?.[platform];

    if (record) {
      record.invalidated = true;
    }

    // 기존 편집 이벤트가 상태를 반영한 후 화면 갱신
    queueMicrotask(render);
  });

  // 16. 플랫폼 탭 전환·카드 추가·삭제·이동 후 검수 상태 갱신
  document.addEventListener("click", (event) => {
    if (
      event.target.closest(".platform-tabs") ||
      ["add", "delete", "up", "down"].includes(event.target.id)
    ) {
      queueMicrotask(render);
    }
  });

  // 17. 다른 모듈이 공개 함수로 플랫폼을 전환한 경우에도 갱신
  // 원래 함수의 실행 결과와 반환값은 유지합니다.
  window.TextEditor.showPlatform = new Proxy(window.TextEditor.showPlatform, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args);
      render();
      return result;
    },
  });

  // 18. 초안 불러오기 완료 후 저장된 검수 결과 표시
  const draftFile = get("draft-file");
  const originalLoad = draftFile.onchange;

  draftFile.onchange = async (event) => {
    await originalLoad.call(draftFile, event);
    render();
  };

  // 19. 독립 카드뉴스 적용 후 검수 상태 갱신
  const originalApply = window.CardEditor.applyCardNewsDraft;

  window.CardEditor.applyCardNewsDraft = function (...args) {
    const result = originalApply.apply(this, args);
    queueMicrotask(render);
    return result;
  };

  // 20. 최초 화면의 플랫폼에 맞춰 검수 UI 초기화
  render();
})();
