import React, { useState } from "react";
import { 
  Eye, 
  Image as ImageIcon, 
  Upload, 
  Send, 
  Info, 
  Layers
} from "lucide-react";

export default function PublishPrep({ article, setArticle }) {
  const [previewTab, setPreviewTab] = useState("donga"); // donga | naver
  const [photos, setPhotos] = useState(article.photos || []);
  const [newCaption, setNewCaption] = useState("국내 연구진이 개발한 차세대 AI 반도체 웨이퍼 시제품");
  const [newSource, setNewSource] = useState("한국반도체연구원");
  const [newProvider, setNewProvider] = useState("김철수 기자");

  const [isCmsExported, setIsCmsExported] = useState(false);
  const [showCmsGuide, setShowCmsGuide] = useState(false);

  const handlePhotoUpload = (e) => {
    const newPhoto = {
      id: `img-${Date.now()}`,
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
      caption: newCaption || "첨부 이미지 설명",
      source: newSource || "동아일보 DB",
      provider: newProvider || "기자",
      ratios: ["16:9 (동아일보 대표)", "4:3 (본문)", "1:1 (모바일/SNS)"]
    };
    const updated = [newPhoto, ...photos];
    setPhotos(updated);
    setArticle({ ...article, photos: updated });
  };

  const handleInsertToContent = (photo) => {
    const photoTag = `\n\n[사진 삽입: ${photo.caption} (출처: ${photo.source}, 제공: ${photo.provider})]\n\n`;
    setArticle({
      ...article,
      content: article.content + photoTag
    });
    alert(`"${photo.caption}" 사진이 기사 본문 하단에 삽입되었습니다.`);
  };

  const handleCmsTransfer = () => {
    setIsCmsExported(true);
    setTimeout(() => setIsCmsExported(false), 3000);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-float-in">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-card p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Send className="w-5 h-5 text-slate-800" />
            발행 준비 및 미디어 조율
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            동아일보 및 네이버 포털 최종 미리보기를 확인하고, 사진 규격 자동 조절 및 CMS 이관을 진행합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCmsGuide(!showCmsGuide)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/80 hover:bg-white text-slate-700 text-xs font-bold rounded-xl transition border border-slate-200 cursor-pointer shadow-xs"
          >
            <Info className="w-4 h-4 text-slate-500" />
            CMS 현업 이관 가이드
          </button>

          <button
            onClick={handleCmsTransfer}
            className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition shadow-md shadow-slate-900/20 cursor-pointer"
          >
            <Send className="w-4 h-4 text-slate-200" />
            {isCmsExported ? "CMS 이관 성공!" : "CMS 패키지 이관하기"}
          </button>
        </div>
      </div>

      {/* CMS 현업 가이드 Notice Panel */}
      {showCmsGuide && (
        <div className="glass-panel p-5 text-xs text-slate-800 space-y-3 animate-float-in">
          <div className="flex items-center justify-between font-extrabold text-sm text-slate-900">
            <span>[필독] CMS 이관 사전 확인 지침</span>
            <button onClick={() => setShowCmsGuide(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p className="leading-relaxed">
            CMS 이관은 현업 기자들과의 인터뷰 및 실제 사내 입력 표준에 발맞추어 진행됩니다.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-bold">
            <div className="bg-white/80 p-2 rounded-lg border border-white">① 이관 방식: 직접 전송</div>
            <div className="bg-white/80 p-2 rounded-lg border border-white">② 본문 규칙: 줄바꿈 연동</div>
            <div className="bg-white/80 p-2 rounded-lg border border-white">③ 사진 규칙: 규격 리사이징</div>
            <div className="bg-white/80 p-2 rounded-lg border border-white">④ 발행 이력: 자동 기록</div>
          </div>
        </div>
      )}

      {/* Grid Layout: Media & Photo Setup vs Media Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Photo Upload & Auto Resizing */}
        <div className="lg:col-span-6 space-y-5">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-800" />
                <h3 className="text-sm font-extrabold text-slate-900">사진 업로드 & 규격 생성</h3>
              </div>
              <span className="text-xs text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md font-bold">
                동아일보 자동 규격
              </span>
            </div>

            {/* Photo Info Form */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">사진 설명 (캡션)</label>
                <input
                  type="text"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="사진에 대한 자세한 설명을 입력하세요"
                  className="w-full px-3.5 py-2.5 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">출처</label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="예: 한국반도체연구원"
                    className="w-full px-3.5 py-2.5 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">제공자</label>
                  <input
                    type="text"
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value)}
                    placeholder="예: 김철수 기자"
                    className="w-full px-3.5 py-2.5 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <label className="flex items-center justify-center gap-2 py-3.5 bg-white/50 hover:bg-white border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer text-slate-800 font-bold transition">
                <Upload className="w-4 h-4 text-slate-800" />
                <span>사진 선택 및 규격 생성 업로드</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>

            {/* Uploaded Photos List */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-800 block">준비된 미디어 목록 (본문 드래그 삽입 가능)</label>
              {photos.length === 0 ? (
                <div className="text-xs text-slate-400 p-4 text-center border rounded-xl">업로드된 사진이 없습니다.</div>
              ) : (
                photos.map((photo) => (
                  <div key={photo.id} className="p-3.5 bg-white/80 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex gap-3 items-center">
                      <img src={photo.url} alt="preview" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-extrabold text-slate-900 truncate">{photo.caption}</p>
                        <p className="text-slate-500 font-semibold">출처: {photo.source} | 제공: {photo.provider}</p>
                        <div className="flex gap-1 mt-1">
                          {photo.ratios.map((r, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-[10px] text-slate-700 rounded font-semibold">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleInsertToContent(photo)}
                      className="w-full py-1.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Layers className="w-3.5 h-3.5 text-slate-600" />
                      본문 원하는 위치에 직접 삽입하기
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Article Preview */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center p-1.5 bg-white/40 backdrop-blur-md rounded-2xl border border-white/60">
            <button
              onClick={() => setPreviewTab("donga")}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                previewTab === "donga"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Eye className="w-4 h-4 text-slate-200" />
              동아일보 기사 미리보기
            </button>

            <button
              onClick={() => setPreviewTab("naver")}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                previewTab === "naver"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Eye className="w-4 h-4 text-slate-200" />
              네이버 기사 미리보기
            </button>
          </div>

          <div className="glass-card p-6 space-y-4 min-h-[500px]">
            {previewTab === "donga" ? (
              <div className="space-y-4">
                <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
                  <span className="text-xl font-black tracking-tight text-slate-900">東亞日報</span>
                  <span className="text-xs text-slate-500 font-semibold">2026.10.01 디지털 종합</span>
                </div>

                <h2 className="text-xl font-extrabold text-slate-950 leading-snug">{article.title}</h2>
                <p className="text-xs text-slate-600 font-bold border-l-2 border-slate-800 pl-2">
                  {article.subtitle}
                </p>

                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold border-y border-slate-100 py-1.5">
                  <span>입력 2026-10-01 16:30</span>
                  <span>|</span>
                  <span>동아일보 AI 뉴스룸</span>
                </div>

                {photos.length > 0 && (
                  <div className="space-y-1 my-3">
                    <img src={photos[0].url} alt="donga" className="w-full h-48 object-cover rounded-xl" />
                    <p className="text-[11px] text-slate-600 bg-slate-50/80 p-2 rounded-lg border border-slate-200">
                      ▲ {photos[0].caption} (사진 출처: {photos[0].source})
                    </p>
                  </div>
                )}

                <div className="text-xs text-slate-800 leading-relaxed space-y-2 whitespace-pre-line font-normal">
                  {article.content}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-600 text-white p-3 rounded-xl flex items-center justify-between font-bold text-sm shadow-xs">
                  <span>NAVER 뉴스 미리보기</span>
                  <span className="text-xs font-normal">구독: 동아일보</span>
                </div>

                <h2 className="text-lg font-bold text-slate-900 leading-snug">{article.title}</h2>
                <p className="text-xs text-slate-500 font-medium">{article.subtitle}</p>

                {photos.length > 0 && (
                  <div className="space-y-1 my-3">
                    <img src={photos[0].url} alt="naver" className="w-full h-44 object-cover rounded-lg" />
                    <p className="text-[10px] text-slate-400">ⓒ 동아일보 {photos[0].caption}</p>
                  </div>
                )}

                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-3">
                  {article.content}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
