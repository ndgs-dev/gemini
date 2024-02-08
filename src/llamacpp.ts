import { Message } from "discord.js";
import { evar } from "./var";

const endpoint = evar("LLAMA_CPP_ENDPOINT");

async function req(prompt: string): Promise<string> {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			stop: ["<|im_end|>"],
			stream: false,
			n_predict: 400,
			cache_prompt: false,
			prompt,
		}),
	});
	const data = await res.json();
	return data.content;
}

const reqQueue: {
	prompt: string;
	callback: (data: string) => void;
}[] = [];

async function reqWithQueue(prompt: string) {
	return new Promise<string>((resolve, reject) => {
		reqQueue.push({
			prompt,
			callback: (data) => {
				resolve(data);
			},
		});
		if (reqQueue.length === 1) {
			(async () => {
				while (reqQueue.length) {
					const { prompt, callback } = reqQueue[0];
					const data = await req(prompt);
					callback(data);
					reqQueue.shift();
				}
			})();
		}
	});
}

export class LLamaCppChat {
	history: { user: string; message: string }[] = [];
	constructor() {}
	async chat(message: string): Promise<string> {
		this.history.push({ user: "user", message });
		try {
			const data = await reqWithQueue(this.historyText());
			this.history.push({ user: "bot", message: data });
			return data;
		} catch (e: any) {
			return `エラーが発生しました: ${e.toString()}`;
		}
	}
	historyText() {
		return (
      			this.history
        			.map(
        				(x) =>
            					`<|im_start|>${x.user === "user" ? "user" : "assistant"}\n${x.message}<|im_end|>\n`,
        			)
        			.join("\n") + "\n<|im_start|>assistant\n"
		);
	}
}

export const llamaCppQueues = new Map<
	string,
	{ chat: LLamaCppChat; queue: { text: string; message: Message<true> }[] }
>();

export function resetLLamaCppChat(channelId: string) {
	if (llamaCppQueues.has(channelId)) {
		const q = llamaCppQueues.get(channelId)!;
		q.chat = new LLamaCppChat();
		llamaCppQueues.set(channelId, q);
	}
}

export async function pushLLamaCppQueue(
	content: string,
	message: Message<true>,
) {
	if (!llamaCppQueues.has(message.channelId)) {
		llamaCppQueues.set(message.channelId, {
			chat: new LLamaCppChat(),
			queue: [],
		});
	}
	const { chat, queue } = llamaCppQueues.get(message.channelId)!;
	if (queue.length !== 0) {
		queue.push({ text: content, message });
		return;
	}
	queue.push({ text: content, message });
	while (queue.length) {
		const { text, message } = queue.shift()!;
		const msg = await message.reply("ラマは思考しています...");
		const resText = await chat.chat(text);
		if (resText.length == 0) {
			await msg.edit("ラマは疲れているようです...");
			continue;
		}
		if (resText.length > 1900) {
			await msg.edit({
				content: "熟考しすぎてしまったようです",
				files: [{ attachment: Buffer.from(resText), name: "reply.txt" }],
			});
			continue;
		}
		await msg.edit(`ラマは元気に返事をしてくれました！\n${resText}`);
	}
}
