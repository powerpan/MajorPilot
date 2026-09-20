import type { Answer } from "../types/workspace";

const DATABASE = "majorpilot-task-drafts-v1";
const STORE = "drafts";
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export interface DraftKey {
  owner: string;
  runId: string;
  stepKey: string;
  taskVersion: string;
}
export interface TaskDraft extends DraftKey {
  key: string;
  serverRevision: number;
  answer: Answer;
  expiresAt: number;
  updatedAt: number;
}
let verifiedOwner: string | null = null;
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
const keyOf = (key: DraftKey) =>
  JSON.stringify([key.owner, key.runId, key.stepKey, key.taskVersion]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("本机草稿存储不可用，请保持网络连接并确认保存成功。"));
  });
}
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error("本机草稿暂未保存，请保持页面打开并重试。"));
    };
    operation(tx.objectStore(STORE), (value) => {
      result = value;
    });
  });
}
function assertOwner(owner: string, issuedAt: number) {
  if (owner !== verifiedOwner || issuedAt !== generation)
    throw new Error("草稿已锁定，请先验证当前登录账户。");
}
/** A 401 never grants a cache read. Only a successful authenticated /me or login unlocks it. */
export function lockTaskDrafts() {
  verifiedOwner = null;
  generation += 1;
}
export async function verifyTaskDraftOwner(owner: string) {
  if (owner === verifiedOwner) return;
  lockTaskDrafts();
  const issuedAt = generation;
  await serial(() =>
    transaction<void>("readwrite", (store, done) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          done();
          return;
        }
        const draft = cursor.value as TaskDraft;
        if (draft.owner !== owner || draft.expiresAt <= Date.now())
          cursor.delete();
        cursor.continue();
      };
    }),
  );
  if (issuedAt === generation) verifiedOwner = owner;
}
export function purgeTaskDrafts() {
  lockTaskDrafts();
  return serial(() =>
    transaction<void>("readwrite", (store, done) => {
      store.clear();
      done();
    }),
  );
}
export async function hasTaskDrafts() {
  return serial(() =>
    transaction<boolean>("readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () =>
        done(
          (request.result as TaskDraft[]).some(
            (value) => value.expiresAt > Date.now(),
          ),
        );
    }),
  );
}
export async function readTaskDraft(key: DraftKey) {
  const issuedAt = generation;
  assertOwner(key.owner, issuedAt);
  const result = await serial(async () => {
    assertOwner(key.owner, issuedAt);
    return transaction<TaskDraft | undefined>("readwrite", (store, done) => {
      const request = store.get(keyOf(key));
      request.onsuccess = () => {
        const value = request.result as TaskDraft | undefined;
        if (value && value.expiresAt <= Date.now()) {
          store.delete(keyOf(key));
          done(undefined);
        } else done(value);
      };
    });
  });
  assertOwner(key.owner, issuedAt);
  return result;
}
export function writeTaskDraft(
  key: DraftKey,
  serverRevision: number,
  answer: Answer,
) {
  const issuedAt = generation;
  const draft: TaskDraft = {
    ...key,
    key: keyOf(key),
    serverRevision,
    answer: clone(answer),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DRAFT_TTL_MS,
  };
  return serial(async () => {
    assertOwner(key.owner, issuedAt);
    await transaction<void>("readwrite", (store, done) => {
      store.put(draft);
      done();
    });
    assertOwner(key.owner, issuedAt);
  });
}
export function removeTaskDraft(key: DraftKey) {
  const issuedAt = generation;
  return serial(async () => {
    assertOwner(key.owner, issuedAt);
    await transaction<void>("readwrite", (store, done) => {
      store.delete(keyOf(key));
      done();
    });
  });
}
