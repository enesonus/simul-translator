declare module 'iso-language-converter' {
	/**
	 * Convert ISO language code to language name
	 * @param code ISO-639-1 or ISO-639-3 language code
	 * @returns Language name or undefined if not found
	 */
	function isoConv(code: string): string | undefined;
	
	export default isoConv;
} 