// 강제 종료 대비 원고 백업: 계정마다 따로, 암호화해서 저장, 키가 다르거나 없으면 안전하게 처리.
import { test } from "node:test";
import assert from "node:assert/strict";

// 최소한의 IndexedDB 대역(open/transaction/put/get/delete 만)
const data = new Map();
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        createObjectStore() {},
        close() {},
        transaction() {
          const tx = {};
          const store = {
            put: (value, key) => { data.set(key, value); return {}; },
            get: (key) => { const r = {}; r.result = data.get(key); return r; },
            delete: (key) => { data.delete(key); return {}; },
          };
          tx.objectStore = () => store;
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
      };
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};

const { setBackupOwner, setBackupKey, writeBackup, readBackup, clearBackup, setKeyWaitForTest } = await import("../../../src/lib/draftBackup.js");
const keyFor = (seed) => Buffer.alloc(32, seed).toString("base64");
const login = async (owner, seed) => { setBackupOwner(owner); await setBackupKey(keyFor(seed), owner); };
const bytesOf = (entry) => Buffer.concat([Buffer.from(JSON.stringify({ ...entry, data: undefined, iv: undefined })), Buffer.from(entry.data), Buffer.from(entry.iv)]);

test("원고는 암호화돼 저장되고 같은 계정에서 복구된다", async () => {
  data.clear();
  await login("user-a", 1);
  await writeBackup({ title: "비밀 제목 ZZ-MARKER", content: "본문" });
  const stored = data.get("current:user-a");
  assert.equal(stored.v, 2);
  assert.equal(bytesOf(stored).includes("ZZ-MARKER"), false, "저장된 값에 원고가 평문으로 없다");
  assert.equal((await readBackup()).article.title, "비밀 제목 ZZ-MARKER");
});

test("계정마다 칸과 키가 따로다", async () => {
  data.clear();
  await login("user-a", 1);
  await writeBackup({ title: "A의 글" });
  await login("user-b", 2);
  assert.equal(await readBackup(), undefined, "다른 계정의 백업은 보이지 않는다");
  await writeBackup({ title: "B의 글" });
  await clearBackup();
  await login("user-a", 1);
  assert.equal((await readBackup()).article.title, "A의 글", "B 의 쓰기·지우기가 A 의 백업을 건드리지 않는다");
});

test("키가 달라 풀 수 없는 백업은 없는 것으로 치우고, 깨진 값도 안전하다", async () => {
  data.clear();
  await login("user-a", 1);
  await writeBackup({ title: "원고" });
  await login("user-b", 9);
  data.set("current:user-b", data.get("current:user-a")); // 다른 계정의 칸에 옮겨 놔도(계정이 묶여 있어) 풀리지 않는다
  assert.equal(await readBackup(), undefined);
  assert.equal(data.has("current:user-b"), false, "읽을 수 없는 백업은 치운다");
  await login("user-a", 7); // 같은 계정이어도 키가 바뀌었으면 못 푼다
  data.set("current:user-a", { v: 2, iv: new Uint8Array(12), data: new Uint8Array([1, 2, 3]).buffer, at: 1 });
  assert.equal(await readBackup(), undefined);
});

test("키를 못 받으면 백업을 지우지 않고 건너뛴다", async () => {
  data.clear();
  await login("user-a", 1);
  await writeBackup({ title: "보존" });
  setKeyWaitForTest(30);
  setBackupOwner("user-c"); // 키가 오지 않는 새 계정
  await writeBackup({ title: "쓰지 않음" });
  assert.equal(data.has("current:user-c"), false, "키가 없으면 쓰지 않는다");
  data.set("current:user-c", data.get("current:user-a"));
  assert.equal(await readBackup(), undefined);
  assert.equal(data.has("current:user-c"), true, "키를 못 받은 것은 백업 탓이 아니니 지우지 않는다");
});

test("암호화 도입 전의 평문 백업은 한 번 읽게 하고, 계정을 모르면 아무것도 하지 않는다", async () => {
  data.clear();
  setKeyWaitForTest(5000);
  await login("user-a", 1);
  data.set("current:user-a", { article: { title: "옛 평문" }, at: 1 });
  data.set("current", { article: { title: "주인 모를 옛 백업" }, at: 1 });
  assert.equal((await readBackup()).article.title, "옛 평문");
  assert.equal(data.has("current"), false, "주인 모를 옛 백업은 지운다");
  setBackupOwner("");
  await writeBackup({ title: "무시" });
  assert.equal(await readBackup(), undefined);
});
