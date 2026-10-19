import { openExportFolder } from "../api/editorial";

// 내보내기 결과: 저장한 위치와 '폴더 열기'. result = 코어 saveExport 응답 { folder, files }
export default function ExportNotice({ result, kind, className = "text-xs" }) {
  if (!result) return null;
  return (
    <p role="status" data-testid="export-notice" className={className}>
      {result.files.length}개 파일을 저장했어요: {result.folder}{" "}
      <button type="button" data-testid="export-open-folder" className="underline font-bold cursor-pointer"
        onClick={() => openExportFolder(kind).catch(() => {})}>폴더 열기</button>
    </p>
  );
}
