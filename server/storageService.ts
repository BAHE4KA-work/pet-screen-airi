import fs from 'fs';
import path from 'path';

export interface StorageFileInfo {
  name: string;
  relativePath: string;
  sizeBytes: number;
  sizeFormatted: string;
  updatedAt: string;
  isDirectory: boolean;
}

export interface StorageInfo {
  storagePath: string;
  isAbsolute: boolean;
  exists: boolean;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  files: StorageFileInfo[];
}

class StorageService {
  private customPath: string | null = null;

  constructor() {
    this.ensureDirectoryExists();
    this.initDefaultFiles();
  }

  public getPath(): string {
    if (this.customPath) {
      return path.isAbsolute(this.customPath)
        ? this.customPath
        : path.resolve(process.cwd(), this.customPath);
    }
    return path.resolve(process.cwd(), 'storage');
  }

  public setPath(newPath: string): { success: boolean; path: string; error?: string } {
    try {
      const resolved = path.isAbsolute(newPath)
        ? newPath
        : path.resolve(process.cwd(), newPath);

      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }

      this.customPath = newPath;
      this.initDefaultFiles();
      return { success: true, path: resolved };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, path: this.getPath(), error: msg };
    }
  }

  private ensureDirectoryExists() {
    const dir = this.getPath();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private initDefaultFiles() {
    const dir = this.getPath();
    const sampleNotes = path.join(dir, 'notes.json');
    if (!fs.existsSync(sampleNotes)) {
      const initialNotes = [
        {
          id: 'note_1',
          title: 'Конфигурация FunctionGemma',
          content: 'Локальная модель function calling с квантованием 4-bit и контекстом 4096 токенов.',
          tags: ['gemma', 'local', 'config'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'note_2',
          title: 'Список доверенных модулей',
          content: 'Модули system, search, files, developer и storage зарегистрированы и верифицированы.',
          tags: ['modules', 'security'],
          updatedAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(sampleNotes, JSON.stringify(initialNotes, null, 2), 'utf8');
    }

    const sampleClipboard = path.join(dir, 'clipboard_history.txt');
    if (!fs.existsSync(sampleClipboard)) {
      fs.writeFileSync(
        sampleClipboard,
        `[${new Date().toISOString()}] https://github.com/google/gemma-models\n[${new Date().toISOString()}] FunctionGemma 7b Tools v2.1\n`,
        'utf8'
      );
    }
  }

  public getStorageInfo(): StorageInfo {
    this.ensureDirectoryExists();
    const dir = this.getPath();
    const filesList: StorageFileInfo[] = [];
    let totalBytes = 0;

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          const stats = fs.statSync(full);
          totalBytes += stats.size;
          filesList.push({
            name: item,
            relativePath: item,
            sizeBytes: stats.size,
            sizeFormatted: this.formatBytes(stats.size),
            updatedAt: stats.mtime.toISOString(),
            isDirectory: stats.isDirectory()
          });
        } catch {
          // ignore broken items
        }
      }
    } catch {
      // directory read failure
    }

    return {
      storagePath: dir,
      isAbsolute: path.isAbsolute(this.getPath()),
      exists: fs.existsSync(dir),
      totalFiles: filesList.length,
      totalSizeBytes: totalBytes,
      totalSizeFormatted: this.formatBytes(totalBytes),
      files: filesList
    };
  }

  public readFile(relativePath: string): string {
    const safePath = path.resolve(this.getPath(), relativePath);
    if (!safePath.startsWith(this.getPath())) {
      throw new Error('Небезопасный путь к файлу: выход за пределы хранилища запрещен.');
    }
    if (!fs.existsSync(safePath)) {
      throw new Error(`Файл "${relativePath}" не найден в хранилище.`);
    }
    return fs.readFileSync(safePath, 'utf8');
  }

  public writeFile(relativePath: string, content: string): { success: boolean; bytes: number } {
    const safePath = path.resolve(this.getPath(), relativePath);
    if (!safePath.startsWith(this.getPath())) {
      throw new Error('Небезопасный путь к файлу: выход за пределы хранилища запрещен.');
    }
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, content, 'utf8');
    return { success: true, bytes: Buffer.byteLength(content, 'utf8') };
  }

  public appendFile(relativePath: string, content: string): { success: boolean } {
    const safePath = path.resolve(this.getPath(), relativePath);
    if (!safePath.startsWith(this.getPath())) {
      throw new Error('Небезопасный путь к файлу: выход за пределы хранилища запрещен.');
    }
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.appendFileSync(safePath, content, 'utf8');
    return { success: true };
  }

  public deleteFile(relativePath: string): boolean {
    const safePath = path.resolve(this.getPath(), relativePath);
    if (!safePath.startsWith(this.getPath())) {
      throw new Error('Небезопасный путь к файлу.');
    }
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
      return true;
    }
    return false;
  }
}

export const storageService = new StorageService();
