interface WavOptions {
	numChannels: number; // 1 = mono, 2 = stereo, etc.
	sampleRate: number; // e.g. 44100
	bitsPerSample: number; // 8, 16, or 32
}

class AudioHelpers {
	static createWavBuffer(
		pcmData: Buffer,
		{ numChannels, sampleRate, bitsPerSample }: WavOptions
	): Buffer {
		const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
		const blockAlign = (numChannels * bitsPerSample) / 8;
		const dataSize = pcmData.length;

		const header = Buffer.alloc(44);
		header.write("RIFF", 0); // ChunkID
		header.writeUInt32LE(36 + dataSize, 4); // ChunkSize
		header.write("WAVE", 8); // Format
		header.write("fmt ", 12); // Subchunk1ID
		header.writeUInt32LE(16, 16); // Subchunk1Size
		header.writeUInt16LE(1, 20); // AudioFormat = PCM
		header.writeUInt16LE(numChannels, 22); // NumChannels
		header.writeUInt32LE(sampleRate, 24); // SampleRate
		header.writeUInt32LE(byteRate, 28); // ByteRate
		header.writeUInt16LE(blockAlign, 32); // BlockAlign
		header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
		header.write("data", 36); // Subchunk2ID
		header.writeUInt32LE(dataSize, 40); // Subchunk2Size

		return Buffer.concat([header, pcmData]);
	}

	static float32toPcm16(float32Data: Float32Array): Buffer {
		const pcmBuffer = Buffer.alloc(float32Data.length * 2);
		for (let i = 0; i < float32Data.length; i++) {
			let s = Math.max(-1, Math.min(1, float32Data[i]));
			pcmBuffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
		}
		return pcmBuffer;
	}
	
	static bufferToFloat32Array(buffer: Buffer): Float32Array {
		// ayni byte orderda oldugunu varsayiyoruz
		// bizim caseimizde hep little endian ile calisiyoruz o yuzden ok
		const int16Array = new Int16Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.length / 2
		);
		const float32Array = new Float32Array(int16Array.length);

		for (let i = 0; i < int16Array.length; i++) {
			float32Array[i] = int16Array[i] / 32768.0;
		}

		return float32Array;
	}
}

export { AudioHelpers, WavOptions };
