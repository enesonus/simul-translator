import { OpenAI } from "openai";

export interface TranslationResult {
	translatedText: string;
	targetLanguage: string;
	sourceLanguage?: string;
}

export class TranslationService {
	constructor() {
		console.log("TranslationService initialized");
	}

	async translate(
		text: string,
		targetLanguage: string,
		sourceLanguage?: string
	): Promise<TranslationResult> {
		// Dummy implementation
		console.log(
			`TranslationService: Translating text to ${targetLanguage} from ${sourceLanguage}`
		);
		const client = new OpenAI({
			// baseURL: "https://api.groq.com/openai/v1",
			// apiKey: process.env.GROQ_API_KEY,
		});

		const completion = await client.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
                {
                    role: "system",
                    content: `You are a bilingual translation tool. Your only job is to translate given text between ${sourceLanguage} and ${targetLanguage}.`,
                },
				{
					role: "user",
					content: text,
				},
			],
		});
        const translatedText = completion.choices[0].message.content;
		return {
			translatedText: translatedText || "",
			targetLanguage: targetLanguage,
			sourceLanguage: sourceLanguage || "en-US", // Assume source if not provided
		};
	}
}
