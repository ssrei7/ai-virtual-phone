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
        const apiKey = textValue(body.apiKey);
        const baseUrl = normalizeBaseUrl(body.baseUrl);
        const model = textValue(body.model) || "moss-tts-1.5-flash";
        const input = typeof body.input === "string" ? body.input : "";
        const voiceId = textValue(body.voiceId);

        if (!apiKey) return NextResponse.json({ error: "MOSI API Key 未配置" }, { status: 400 });
        if (!input.trim()) return NextResponse.json({ error: "朗读文本为空" }, { status: 400 });
        if (!voiceId) return NextResponse.json({ error: "MOSI Voice ID 未配置" }, { status: 400 });
        if (!/^https:\/\//i.test(baseUrl)) {
            return NextResponse.json({ error: "MOSI Base URL 必须使用 HTTPS" }, { status: 400 });
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
                delivery_method: "audio",
            }),
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: "MOSI TTS 请求失败", message: await readUpstreamError(upstream) },
                { status: 502 },
            );
        }

        const audio = await upstream.arrayBuffer();
        if (!audio.byteLength) {
            return NextResponse.json({ error: "MOSI 返回了空音频" }, { status: 502 });
        }

        const upstreamType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const contentType = upstreamType.startsWith("audio/") ? upstreamType : "audio/mpeg";
        return new NextResponse(audio, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(audio.byteLength),
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: "MOSI TTS 代理失败", message: message.slice(0, 800) }, { status: 502 });
    }
}
