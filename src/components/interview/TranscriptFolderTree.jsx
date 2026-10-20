import React from "react";
import { ArrowUpRight, Check, ChevronRight, FileText, Folder, FolderOpen, Trash2, X } from "lucide-react";
import { transcriptFolderChildren } from "../../lib/transcriptFolders.js";

function TranscriptFileRow({ file, context }) {
  const isCurrent = context.currentId === file.id;
  const isEditing = context.editingStoredId === file.id;
  return (
    <li
      draggable={!isEditing}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("application/json", JSON.stringify({ type: "file", id: file.id }));
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => !isEditing && context.openFile(file)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "F2" && !isEditing) {
          event.preventDefault();
          context.startRenameFile(event, file);
        }
      }}
      className="group ml-4 flex cursor-pointer items-center gap-2 rounded-lg border-l-2 border-slate-200 px-2 py-1.5 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50"
    >
      <FileText className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-blue-600" />
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <input
              type="text"
              value={context.editingStoredTitle}
              onChange={(event) => context.setEditingStoredTitle(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") context.saveRenameFile(event, file);
                if (event.key === "Escape") context.cancelRenameFile(event);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
            />
            <button type="button" onClick={(event) => context.saveRenameFile(event, file)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="제목 저장">
              <Check className="h-3.5 w-3.5 stroke-[2]" />
            </button>
            <button type="button" onClick={context.cancelRenameFile} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
              <X className="h-3.5 w-3.5 stroke-[2]" />
            </button>
          </div>
        ) : (
          <p
            onDoubleClick={(event) => context.startRenameFile(event, file)}
            title="더블클릭 또는 F2로 제목 변경 (드래그하여 다른 폴더로 이동 가능)"
            className={`truncate text-xs ${isCurrent ? "font-extrabold text-slate-900" : "font-bold text-slate-800"}`}
          >
            {file.filename || "(파일명 없음)"}
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-slate-400">
        {new Date(file.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
      </span>
      {!isEditing && (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={(event) => context.moveFileToRoot(event, file.id)} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="폴더 밖으로 꺼내기">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={(event) => context.deleteFile(event, file)} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="전사 삭제">
            <Trash2 className="h-3.5 w-3.5 stroke-[1.8]" />
          </button>
        </span>
      )}
    </li>
  );
}

function TranscriptFolderNode({ folder, depth, context }) {
  const isOver = context.dragOverFolderId === folder.id;
  const isOpen = Boolean(context.openFolders[folder.id]);
  const isEditing = context.editingFolderId === folder.id;
  const childFolders = transcriptFolderChildren(context.folders, folder.id);
  const folderFiles = context.items.filter((item) => context.fileFolderMap[item.id] === folder.id);
  return (
    <li
      draggable={!isEditing}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("application/json", JSON.stringify({ type: "folder", id: folder.id }));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isOver) context.setDragOverFolderId(folder.id);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) context.setDragOverFolderId(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          context.dropIntoFolder(folder.id, JSON.parse(event.dataTransfer.getData("application/json")));
        } catch {
          // 알 수 없는 드래그 데이터는 무시한다.
        }
        context.setDragOverFolderId(null);
      }}
      className="py-1"
      style={{ marginLeft: `${depth * 14}px` }}
    >
      <div
        onClick={() => !isEditing && context.toggleFolder(folder.id)}
        className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-1.5 transition-all ${isOver ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300" : "border-transparent bg-slate-50/50 hover:bg-slate-100/80"}`}
        title="클릭하여 열기/접기 (파일/폴더를 드래그하여 안에 넣을 수 있습니다)"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-90 text-slate-700" : ""}`} />
        {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" /> : <Folder className="h-4 w-4 shrink-0 fill-amber-400/50 text-amber-500" />}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
              <input
                type="text"
                value={context.editingFolderName}
                onChange={(event) => context.setEditingFolderName(event.target.value)}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") context.saveRenameFolder(folder.id);
                  if (event.key === "Escape") context.setEditingFolderId(null);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
              />
              <button type="button" onClick={() => context.saveRenameFolder(folder.id)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="폴더명 저장">
                <Check className="h-3.5 w-3.5 stroke-[2]" />
              </button>
              <button type="button" onClick={() => context.setEditingFolderId(null)} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
                <X className="h-3.5 w-3.5 stroke-[2]" />
              </button>
            </div>
          ) : (
            <span
              onDoubleClick={(event) => {
                event.stopPropagation();
                context.setEditingFolderId(folder.id);
                context.setEditingFolderName(folder.name);
              }}
              className="block truncate text-xs font-bold text-slate-800"
              title="더블클릭하여 폴더 이름 변경"
            >
              {folder.name}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">{folderFiles.length}</span>
        {!isEditing && (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => event.stopPropagation()}>
            {folder.parentId && (
              <button type="button" onClick={(event) => context.moveFolderToRoot(event, folder.id)} className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="최상위로 이동">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={(event) => context.deleteFolder(event, folder.id)} className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="폴더 삭제">
              <Trash2 className="h-3.5 w-3.5 stroke-[1.8]" />
            </button>
          </span>
        )}
      </div>
      {isOpen && (
        <ul className="mt-1 space-y-0.5 pl-2">
          {childFolders.map((child) => <TranscriptFolderNode key={child.id} folder={child} depth={depth + 1} context={context} />)}
          {folderFiles.map((file) => <TranscriptFileRow key={file.id} file={file} context={context} />)}
          {childFolders.length === 0 && folderFiles.length === 0 && (
            <li className="py-2 pl-7 text-[11px] italic text-slate-400">(파일이나 폴더를 드래그해서 이 폴더에 넣으세요)</li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function TranscriptFolderTree({ context, parentId = null }) {
  return transcriptFolderChildren(context.folders, parentId).map((folder) => (
    <TranscriptFolderNode key={folder.id} folder={folder} depth={0} context={context} />
  ));
}
