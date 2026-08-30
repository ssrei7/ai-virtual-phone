import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_MOSI_BASE_URL = "https://api.mosi.cn/v1";

function normalizeBaseUrl(value: unknown): string {
    const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_MOSI_BASE_URL;
    return raw.replace(/\/+$/, "");
}

function textValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function readUpstreamError(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    try {
        const data = JSON.parse(text) as Record<string, unknown>;
        const message = data.message || data.error || data.detail || data.status_msg;
        if (typeof message === "string" && message.trim()) return message.trim().slice(0, 800);
    } catch {
        // upstream may return plain text
    }
    return (text || `HTTP ${response.status}`).slice(0, 800);
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const action = textValue(body.action) || "create";
        const apiKey = textValue(body.apiKey);
        const baseUrl = normalizeBaseUrl(body.baseUrl);
        const model = textValue(body.model) || "moss-tts-1.5-flash";
        const input = typeof body.input === "string" ? body.input : "";
        const voiceId = textValue(body.voiceId);
        const taskId = textValue(body.taskId);

        if (!apiKey) return NextResponse.json({ error: "MOSI API Key 未配置" }, { status: 400 });
        if ((action === "status" || action === "audio") && !taskId) return NextResponse.json({ error: "缺少 MOSI task_id" }, { status: 400 });
        if (action === "create" && !input.trim()) return NextResponse.json({ error: "朗读文本为空" }, { status: 400 });
        if (action === "create" && !voiceId) return NextResponse.json({ error: "MOSI Voice ID 未配置" }, { status: 400 });
        if (!/^https:\/\//i.test(baseUrl)) {
            return NextResponse.json({ error: "MOSI Base URL 必须使用 HTTPS" }, { status: 400 });
        }

        if (action === "status" || action === "audio") {
            const taskResponse = await proxyFetch(`${baseUrl}/audio/tasks/${encodeURIComponent(taskId)}`, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (!taskResponse.ok) {
                return NextResponse.json({ error: "MOSI 任务查询失败", message: await readUpstreamError(taskResponse) }, { status: 502 });
            }
            const task = await taskResponse.json().catch(() => null) as Record<string, unknown> | null;
            if (!task) return NextResponse.json({ error: "MOSI 任务响应无效" }, { status: 502 });
            if (action === "status") return NextResponse.json(task);
            const status = textValue(task.status).toUpperCase();
            if (status !== "SUCCESS") return NextResponse.json({ status, task }, { status: 409 });
            const resultUrl = textValue(task.url);
            if (!resultUrl) return NextResponse.json({ error: "MOSI 成功任务没有音频 URL" }, { status: 502 });
            const audioResponse = await proxyFetch(resultUrl, { method: "GET" });
            if (!audioResponse.ok) return NextResponse.json({ error: "MOSI 音频下载失败", message: await readUpstreamError(audioResponse) }, { status: 502 });
            const audio = await audioResponse.arrayBuffer();
            if (!audio.byteLength) return NextResponse.json({ error: "MOSI 音频为空" }, { status: 502 });
            const upstreamType = (audioResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            return new NextResponse(audio, { status: 200, headers: { "Content-Type": upstreamType.startsWith("audio/") ? upstreamType : "audio/mpeg", "Content-Length": String(audio.byteLength), "Cache-Control": "no-store" } });
        }

        const upstream = await proxyFetch(`${baseUrl}/audio/speech`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                Accept: "audio/mpeg, audio/wav, application/octet-stream, application/json",
            },
            body: JSON.stringify({
                model,
                input,
                voice_id: voiceId,
                response_format: "mp3",
                delivery_method: "url",
                async: true,
            }),
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: "MOSI TTS 请求失败", message: await readUpstreamError(upstream) },
                { status: 502 },
            );
        }
        const task = await upstream.json().catch(() => null);
        if (!task || typeof task !== "object") {
            return NextResponse.json({ error: "MOSI 创建任务响应无效" }, { status: 502 });
        }
        return NextResponse.json(task);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: "MOSI TTS 代理失败", message: message.slice(0, 800) }, { status: 502 });
    }
}
