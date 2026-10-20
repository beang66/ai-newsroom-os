import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canMoveTranscriptFolder,
  moveTranscriptFolder,
  removeTranscriptFolder,
  transcriptFolderChildren,
} from "../../../src/lib/transcriptFolders.js";

const folders = [
  { id: "folder_a", name: "A" },
  { id: "folder_b", name: "B", parentId: "folder_a" },
  { id: "folder_c", name: "C", parentId: "folder_b" },
];

test("폴더 트리는 부모별 자식만 렌더링 대상으로 돌려준다", () => {
  assert.deepEqual(transcriptFolderChildren(folders).map((folder) => folder.id), ["folder_a"]);
  assert.deepEqual(transcriptFolderChildren(folders, "folder_a").map((folder) => folder.id), ["folder_b"]);
});

test("폴더를 자기 자신이나 자손 안으로 옮겨 순환을 만들 수 없다", () => {
  assert.equal(canMoveTranscriptFolder(folders, "folder_a", "folder_a"), false);
  assert.equal(canMoveTranscriptFolder(folders, "folder_a", "folder_c"), false);
  assert.equal(canMoveTranscriptFolder(folders, "folder_c", "folder_a"), true);
  assert.equal(moveTranscriptFolder(folders, "folder_a", "folder_c"), folders);
});

test("폴더 삭제 시 파일은 루트로, 직계 하위 폴더는 삭제 폴더의 부모로 이동한다", () => {
  const result = removeTranscriptFolder(folders, { file1: "folder_b", file2: "folder_c" }, "folder_b");
  assert.equal(result.folders.some((folder) => folder.id === "folder_b"), false);
  assert.equal(result.folders.find((folder) => folder.id === "folder_c").parentId, "folder_a");
  assert.deepEqual(result.fileFolderMap, { file2: "folder_c" });
});

test("녹취 메모 저장 실패 시 기사 저장을 호출하지 않는 회귀 방어가 있다", () => {
  const source = readFileSync(new URL("../../../src/components/interview/InterviewStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(!await saveNotesNow\(\)\) return false;/);
});
