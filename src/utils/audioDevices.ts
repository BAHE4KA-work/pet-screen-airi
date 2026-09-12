export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  groupId?: string;
}

const STORAGE_KEY = 'overlay_preferred_mic_id';

export const audioDevicesManager = {
  getStoredDeviceId(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  },

  setStoredDeviceId(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, id);
  },

  async getAudioInputDevices(): Promise<AudioDeviceOption[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      // If devices have empty labels, prompt for temporary mic access to unlock device labels
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => d.kind === 'audioinput' && d.label.length > 0);

      if (!hasLabels && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // Ignore permission denial
        }
      }

      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      return audioInputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Микрофон ${index + 1} (${d.deviceId.slice(0, 8)}...)`,
        groupId: d.groupId
      }));
    } catch (err) {
      console.warn('[audioDevicesManager] Failed to enumerate audio devices:', err);
      return [];
    }
  },

  async getUserMediaWithDevice(deviceId?: string): Promise<MediaStream> {
    const targetId = deviceId || this.getStoredDeviceId();
    const constraints: MediaStreamConstraints = {
      audio: targetId
        ? {
            deviceId: { exact: targetId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('[audioDevicesManager] Failed with exact deviceId, falling back to default:', err);
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }
};
