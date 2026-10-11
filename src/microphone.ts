// A stale default input should not prevent capture from another connected microphone.
export async function openMicrophone(devices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>): Promise<MediaStream> {
  try {
    const stream = await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    // Linux can select a speaker monitor as its default recording source.
    if (stream.getAudioTracks().some(track => /monitor|stereo mix|what u hear/i.test(track.label))) {
      const inputs = await devices.enumerateDevices().catch(() => []);
      for (const input of inputs.filter(device => device.kind === 'audioinput' && device.deviceId
        && !['default', 'communications'].includes(device.deviceId)
        && !/monitor|stereo mix|what u hear/i.test(device.label))) {
        try {
          const microphone = await devices.getUserMedia({ audio: { deviceId: { exact: input.deviceId } } });
          stream.getTracks().forEach(track => track.stop());
          return microphone;
        } catch { /* Keep the usable default if no other input can be opened. */ }
      }
    }
    return stream;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (!['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(name || '')) throw error;
    try {
      return await devices.getUserMedia({ audio: true });
    } catch (retryError) {
      if (!['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes((retryError as Error)?.name)) throw retryError;
    }
    const inputs = (await devices.enumerateDevices()).filter(device => device.kind === 'audioinput' && device.deviceId && !['default', 'communications'].includes(device.deviceId));
    for (const input of inputs) {
      try {
        return await devices.getUserMedia({ audio: { deviceId: { exact: input.deviceId } } });
      } catch (deviceError) {
        if (!['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes((deviceError as Error)?.name)) throw deviceError;
      }
    }
    throw error;
  }
}
