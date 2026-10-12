import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 오늘의 데스크 6개 프로젝트 자료(sample-data/datamap/projects) — 데이터맵에서 폴더째 가져오는 데모 자료.
// 코어처럼 위키 링크를 파일 이름으로 찾아, 끊긴 링크와 고립된 문서가 없는지 본다.
const ROOT = fileURLToPath(new URL("../../../sample-data/datamap/", import.meta.url));
const WIKI = /\[\[([^\]\n]+)\]\]/g;

async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(full) : entry.name.endsWith(".md") ? [full] : [];
  }));
  return nested.flat();
}

async function loadGraph() {
  const files = await markdownFiles(ROOT);
  const stems = new Map(files.map((file) => [path.basename(file, ".md").toLowerCase(), file]));
  const links = [];
  for (const file of files) {
    const text = (await readFile(file, "utf8")).replace(/^```[\s\S]*?^```/gm, ""); // 코드 블록 안의 링크는 세지 않는다
    for (const [, inner] of text.matchAll(WIKI)) {
      const target = inner.split("|")[0].split("#")[0].trim().toLowerCase();
      links.push({ source: file, target, resolved: stems.get(target) });
    }
  }
  return { files, stems, links };
}

test("desk project sources cover all six desk stories and stay connected", async () => {
  const { files, links } = await loadGraph();
  const projects = files.filter((file) => file.includes(`${path.sep}projects${path.sep}`));
  // 분류는 역할 폴더로 정한다(src/features/data-map/constants.js 의 CATEGORY_FOLDERS)
  const roles = new Set(projects.map((file) => path.basename(path.dirname(file))));
  assert.deepEqual([...roles].sort(), ["검증", "기사", "기획", "원자료", "인터뷰", "취재노트"].sort());
  for (const prefix of ["heat", "debt", "flood", "film", "audit", "chip"])
    assert.ok(projects.filter((file) => path.basename(file).includes(prefix)).length >= 4, `${prefix} 프로젝트 자료가 부족합니다`);
  assert.equal(projects.filter((file) => path.basename(path.dirname(file)) === "기사").length, 10, "오늘 출고 기사 10건");
  assert.ok(files.length <= 100, "데이터맵은 한 번에 100개까지 가져온다");

  const unresolved = new Set(links.filter((link) => !link.resolved).map((link) => link.target));
  assert.deepEqual([...unresolved].sort(), ["06-health-impact-analysis", "audit-video-archive", "flood-interview-recording", "interview-consent-log"]);

  const backlinked = new Set(links.filter((link) => link.resolved && link.resolved !== link.source).map((link) => link.resolved));
  const hub = path.join(ROOT, "projects", "기획", "desk-2026-10-12.md");
  for (const file of projects) if (file !== hub) assert.ok(backlinked.has(file), `${path.relative(ROOT, file)} 에 백링크가 없습니다`);
});

test("desk project sources link across stories, not only inside one folder", async () => {
  const { links } = await loadGraph();
  const project = (file) => ["heat", "debt", "flood", "film", "audit", "chip"].find((key) => path.basename(file).includes(key)) || path.basename(file);
  const cross = links.filter((link) => link.resolved && project(link.source) !== project(link.resolved));
  assert.ok(cross.length >= 10, `프로젝트 사이 연결이 ${cross.length}건뿐입니다`);
});
