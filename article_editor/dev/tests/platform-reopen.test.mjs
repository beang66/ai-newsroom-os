import test from "node:test";
import assert from "node:assert/strict";

test("studio article lookup records only the final open request", async () => {
  const articleId = "c".repeat(32);
  const calls = [];
  const previousWindow = globalThis.window;
  globalThis.window = {
    pywebview: {
      api: {
        core: async (path) => {
          calls.push(path);
          return {
            status: 200,
            body: {
              draft: {
                articleId,
                revisionNo: 1,
                title: "fixture",
                content: "body",
                photos: [],
              },
            },
          };
        },
        coreBytes: async () => {
          throw Error("binary request is not expected");
        },
      },
    },
  };

  try {
    const { getStudioArticle } = await import(`../../../src/api/platform.js?test=${Date.now()}`);
    await getStudioArticle(articleId);
    assert.deepEqual(calls, [
      `/api/articles/${articleId}?purpose=preview`,
      `/api/articles/${articleId}`,
    ]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
