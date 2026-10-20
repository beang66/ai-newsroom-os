import React, { useEffect, useState } from "react";
import AppDialog from "./AppDialog.jsx";
import { listLocalDrafts } from "../api/platformDraftStorage.js";

/**
 * 내 문서(AI-Newsroom/drafts)에 보관된 로컬 초안 목록을 조회하고 선택하는 대화상자입니다.
 */
export default function LocalDraftPicker({ onSelect, onClose }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      const items = await listLocalDrafts();
      setDrafts(items);
    } catch (err) {
      setError(err.message || "저장된 초안 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const matches = drafts.filter((d) =>
    (d.title || "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  return (
    <AppDialog title="내 문서 초안 불러오기" testId="local-draft-picker" onClose={onClose}>
      <label className="block text-xs font-bold text-[#292929]">
        초안 검색
        <input
          aria-label="초안 제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="저장된 초안 제목 검색…"
          className="mt-1.5 w-full rounded-xl border border-[#DDD6CB] bg-[#FAF8F5] p-2.5 text-xs outline-none focus:border-[#292929]"
        />
      </label>

      {loading && <p role="status" className="text-xs text-[#8E8982]">저장된 초안 목록을 읽는 중…</p>}
      {error && <p role="alert" className="text-xs text-red-700 whitespace-pre-wrap">{error}</p>}
      {!loading && !error && !matches.length && (
        <p role="status" className="text-xs text-[#8E8982]">
          {drafts.length ? "검색 결과가 없습니다." : "내 문서에 저장된 초안이 없습니다. 먼저 ‘초안 저장’을 눌러주세요."}
        </p>
      )}

      <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
        {matches.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id, item.title)}
            className="group block w-full rounded-2xl border border-[#E7E2D9] bg-white p-3.5 text-left transition hover:border-[#292929] hover:bg-[#FAF8F5]"
          >
            <strong className="block text-xs font-bold text-[#292929] group-hover:text-black">
              {item.title || "제목 없는 초안"}
            </strong>
            <span className="mt-1 block text-[11px] text-[#8E8982]">
              {item.saved_at ? `저장 일시: ${new Date(item.saved_at).toLocaleString()}` : "저장 일시 없음"}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[#EFECE6] pt-2">
        <button
          type="button"
          onClick={loadList}
          disabled={loading}
          className="text-xs text-[#57514A] underline hover:text-black disabled:opacity-50"
        >
          목록 새로고침
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[#DDD6CB] px-3 py-1.5 text-xs font-medium hover:bg-[#FAF8F5]"
        >
          닫기
        </button>
      </div>
    </AppDialog>
  );
}
