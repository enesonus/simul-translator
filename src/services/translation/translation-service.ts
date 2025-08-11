import OpenAI from "openai";
import { TRANSLATION_PROMPT } from "../../prompts/translation-prompt";

// import type { ReadableStream as WebReadableStream } from "stream/web";

export interface TranslationResult {
	translatedText: string;
	targetLanguage: string;
	sourceLanguage?: string;
}

export interface TranslationRequest {
	text: string;
	targetLanguage: string;
	sourceLanguage?: string; // Optional, if not provided, auto-detect
}

export class TranslationService {
	constructor() {
		console.log("TranslationService initialized");
	}

	async translate(
		provider: "deepl" | "groq",
		translationReq: TranslationRequest
	): Promise<TranslationResult> {
		switch (provider) {
			case "deepl":
				return this.translateWithDeepL(translationReq);
			case "groq":
				return this.translateWithGroq(translationReq);
			default:
				throw new Error(`Unsupported translation provider: ${provider}`);
		}
	}

	private async translateWithDeepL(
		translationReq: TranslationRequest
	): Promise<TranslationResult> {
		console.log(
			`TranslationService: Translating text to ${translationReq.targetLanguage} (DeepL) from ${
				translationReq.sourceLanguage || "auto-detect"
			}`
		);

		const deeplAuthKey = process.env.DEEPL_API_KEY;
		if (!deeplAuthKey) {
			console.error("DEEPL_API_KEY environment variable is not set.");
			throw new Error("DEEPL_API_KEY is required for translation.");
		}

		const requestData = {
			text: [translationReq.text],
			target_lang: translationReq.targetLanguage.toUpperCase(),
			source_lang: translationReq.sourceLanguage?.toUpperCase() || undefined,
		};

		const response = await fetch("https://api-free.deepl.com/v2/translate", {
			method: "POST",
			headers: {
				Authorization: `DeepL-Auth-Key ${deeplAuthKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestData),
		});

		const data = await response.json();
		return {
			translatedText: data.translations[0].text.trim(),
			targetLanguage: translationReq.targetLanguage,
			sourceLanguage:
				data.translations[0].detected_source_language ||
				translationReq.sourceLanguage,
		};
	}

	private async translateWithGroq(
		translationReq: TranslationRequest
	): Promise<TranslationResult> {
		console.log(
			`TranslationService: Translating text to ${translationReq.targetLanguage} (Groq)`
		);

		const groqApiKey = process.env.GROQ_API_KEY;
		if (!groqApiKey) {
			console.error("GROQ_API_KEY environment variable is not set.");
			throw new Error("GROQ_API_KEY is required for Groq translation.");
		}

		const client = new OpenAI({
			baseURL: "https://api.groq.com/openai/v1",
			apiKey: groqApiKey,
		});

		const systemPrompt = TRANSLATION_PROMPT.split("{{ LANGUAGE }}").join(
			translationReq.targetLanguage
		);

		const { choices } = await client.chat.completions.create({
			model: "openai/gpt-oss-120b",
			temperature: 0,
			reasoning_effort: "low",
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: translationReq.text,
				},
			],
		});

		const translatedText = (choices?.[0]?.message?.content || "").trim();
		return {
			translatedText,
			targetLanguage: translationReq.targetLanguage,
			sourceLanguage: translationReq.sourceLanguage || "auto-detect",
		};
	}
}
