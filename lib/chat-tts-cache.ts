// 聊天朗读音频缓存：独立 IndexedDB，避免把音频塞进聊天记录或 localStorage。
const DB_NAME = "ai_phone_chat_tts_cache_v1";
const DB_VERSION = 1;
const STORE = "clips";

export type ChatTtsCacheKey = {
    messageId: string;
    text: string;
    configId: string;
    provider: string;
    model: string;
    voiceId: string;
    format?: string;
};

export type ChatTtsClip = ChatTtsCacheKey & {
    key: string;
    blob: Blob;
    mimeType: string;
    size: number;
    createdAt: number;
    lastPlayedAt: number;
    sessionId?: string;
};

function canUseDb() {
    return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function makeKey(input: ChatTtsCacheKey): string {
    return JSON.stringify([
        input.messageId, input.text, input.configId, input.provider,
        input.model, input.voiceId, input.format || "mp3",
    ]);
}

function openDb(): Promise<IDBDatabase | null> {
    if (!canUseDb()) return Promise.resolve(null);
    return new Promise(resolve => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => resolve(null);
    });
}

export function getChatTtsCacheKey(input: ChatTtsCacheKey): string {
    return makeKey(input);
}

export async function getChatTtsClip(input: ChatTtsCacheKey): Promise<ChatTtsClip | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(makeKey(input));
        req.onsuccess = () => { db.close(); resolve((req.result as ChatTtsClip | undefined) || null); };
        req.onerror = () => { db.close(); resolve(null); };
    });
}

export async function saveChatTtsClip(input: ChatTtsCacheKey & { blob: Blob; sessionId?: string }): Promise<ChatTtsClip | null> {
    const db = await openDb();
    if (!db) return null;
    const now = Date.now();
    const clip: ChatTtsClip = {
        ...input,
        key: makeKey(input),
        mimeType: input.blob.type || "audio/mpeg",
        size: input.blob.size,
        createdAt: now,
        lastPlayedAt: now,
    };
    return new Promise(resolve => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(clip);
        tx.oncomplete = () => { db.close(); resolve(clip); };
        tx.onerror = () => { db.close(); resolve(null); };
        tx.onabort = () => { db.close(); resolve(null); };
    });
}

export async function touchChatTtsClip(clip: ChatTtsClip): Promise<void> {
    const db = await openDb();
    if (!db) return;
    const next = { ...clip, lastPlayedAt: Date.now() };
    await new Promise<void>(resolve => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(next);
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    });
}

export async function deleteChatTtsClip(key: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>(resolve => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    });
}

export async function clearChatTtsCache(): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>(resolve => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    });
}

export async function listChatTtsClips(): Promise<ChatTtsClip[]> {
    const db = await openDb();
    if (!db) return [];
    return new Promise(resolve => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => { db.close(); resolve((req.result as ChatTtsClip[]) || []); };
        req.onerror = () => { db.close(); resolve([]); };
    });
}
