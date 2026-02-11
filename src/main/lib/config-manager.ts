/**
 * 配置管理器
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { AppConfig } from '../../shared/types';

const APP_DATA_DIR = join(app.getPath('home'), '.a2a-debug-app');
const CONFIG_PATH = join(APP_DATA_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  defaultEndpoint: 'http://localhost:8000/a2a/',
  theme: 'dark',
};

export class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (existsSync(CONFIG_PATH)) {
        const content = readFileSync(CONFIG_PATH, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      }
    } catch {
      // 忽略错误，使用默认配置
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  get(): AppConfig {
    return { ...this.config };
  }

  update(updates: Partial<AppConfig>): AppConfig {
    Object.assign(this.config, updates);
    this.save();
    return { ...this.config };
  }
}
