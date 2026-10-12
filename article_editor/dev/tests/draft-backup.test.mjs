// 강제 종료 대비 원고 백업은 계정마다 따로다(다른 계정 것을 읽거나 덮어쓰거나 지우지 않는다).
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

const { setBackupOwner, writeBackup, readBackup, clearBackup } = await import("../../../src/lib/draftBackup.js");

test("백업은 계정마다 따로 쓰고 읽고 지운다", async () => {
  setBackupOwner("user-a");
  await writeBackup({ title: "A의 글" });
  setBackupOwner("user-b");
  assert.equal(await readBackup(), undefined, "다른 계정의 백업은 보이지 않는다");
  await writeBackup({ title: "B의 글" });
  await clearBackup();
  setBackupOwner("user-a");
  assert.equal((await readBackup()).article.title, "A의 글", "B 의 쓰기·지우기가 A 의 백업을 건드리지 않는다");
});

test("계정을 모르면 아무것도 하지 않고, 옛 한 칸짜리 백업은 지운다", async () => {
  data.set("current", { article: { title: "옛 백업" }, at: 1 });
  setBackupOwner("");
  await writeBackup({ title: "무시" });
  assert.equal(await readBackup(), undefined);
  assert.equal(data.has("current"), true, "계정을 모르는 동안에는 지우지도 않는다");
  setBackupOwner("user-a");
  await readBackup();
  assert.equal(data.has("current"), false, "계정이 정해지면 주인 모를 옛 백업은 지운다");
});
