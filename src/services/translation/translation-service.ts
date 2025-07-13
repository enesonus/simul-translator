import { PassThrough, Readable } from "stream";
// import { TRANSLATION_PROMPT } from "../prompts/translation-prompt"; // Removed OpenAI prompt
import * as https from "https"; // Added for DeepL API call

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
		console.log("TranslationService initialized to use DeepL API");
	}

	async translate(
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
			target_lang: translationReq.targetLanguage.toUpperCase(), // Hardcoded as per request
			source_lang: translationReq.sourceLanguage?.toUpperCase() || undefined, // Omit if not provided for auto-detection
		};

		const postData = JSON.stringify(requestData);

		const req = await fetch("https://api-free.deepl.com/v2/translate", {
			method: "POST",
			headers: {
				Authorization: `DeepL-Auth-Key ${deeplAuthKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestData),
		});

		const data = await req.json();
		return {
			translatedText: data.translations[0].text.trim(),
			targetLanguage: translationReq.targetLanguage,
			sourceLanguage: data.translations[0].detected_source_language || translationReq.sourceLanguage
		};
	}
}
