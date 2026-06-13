# 天下牌 - 项目初始化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化 Cordova + Vite + Phaser 4 + TypeScript 项目，实现古风开始菜单

**Architecture:** Vite 作为开发服务器和打包工具，输出到 cordova/www；Phaser 4 场景驱动，MenuScene 为入口场景

**Tech Stack:** Cordova, Phaser 4, TypeScript (ES6+), Vite

---

### Task 1: 初始化 npm 项目并安装依赖

**Files:**
- Create: `package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "under-the-heaven",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:cordova": "vite build",
    "preview": "vite preview",
    "android": "cordova run android",
    "build:android": "npm run build:cordova && cordova build android"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  },
  "dependencies": {
    "phaser": "^4.0.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
npm install
```

Expected: 成功安装 phaser, vite, typescript

- [ ] **Step 3: 提交**

```bash
git init
git add package.json package-lock.json
git commit -m "chore: init npm project with Phaser 4 + Vite + TypeScript"
```

---

### Task 2: 创建 TypeScript 和 Vite 配置文件

**Files:**
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`

- [ ] **Step 1: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "cordova"]
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'cordova/www',
    emptyOutDir: true,
    target: 'es2020'
  },
  server: {
    port: 5173,
    open: true
  }
});
```

- [ ] **Step 3: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>天下牌</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 4: 提交**

```bash
git add tsconfig.json vite.config.ts index.html
git commit -m "chore: add TypeScript and Vite configs"
```

---

### Task 3: 创建 Phaser 4 游戏入口配置

**Files:**
- Create: `src/config.ts`
- Create: `src/main.ts`

- [ ] **Step 1: 创建 src/config.ts**

```typescript
import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a0a00',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene]
};
```

- [ ] **Step 2: 创建 src/main.ts**

```typescript
import Phaser from 'phaser';
import { gameConfig } from './config';

new Phaser.Game(gameConfig);
```

- [ ] **Step 3: 创建 scenes 目录并验证构建**

```bash
mkdir -p src/scenes
npx tsc --noEmit
```

Expected: 编译报错（MenuScene 尚未创建），这是正常的

- [ ] **Step 4: 提交**

```bash
git add src/config.ts src/main.ts
git commit -m "feat: add Phaser 4 game entry and config"
```

---

### Task 4: 实现 MenuScene 开始菜单

**Files:**
- Create: `src/scenes/MenuScene.ts`

- [ ] **Step 1: 创建 MenuScene**

```typescript
import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height * 0.25, '天 下 牌', {
      fontSize: '96px',
      fontFamily: '"STKaiti", "KaiTi", "楷体", "Noto Serif SC", serif',
      color: '#e8d5a3',
      stroke: '#4a3020',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.42, '一 局 定 天 下', {
      fontSize: '32px',
      fontFamily: '"STKaiti", "KaiTi", "楷体", "Noto Serif SC", serif',
      color: '#c0a070',
      stroke: '#2a1810',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.createButton(width / 2, height * 0.58, '开始游戏', () => {
      console.log('start game');
    });

    this.createButton(width / 2, height * 0.68, '继续游戏', () => {
      console.log('continue game');
    }, true);

    this.createButton(width / 2, height * 0.78, '设  置', () => {
      console.log('settings');
    });
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
    disabled: boolean = false
  ): void {
    const w = 280;
    const h = 60;

    const gfx = this.add.graphics();

    const drawNormal = () => {
      gfx.clear();
      gfx.fillStyle(disabled ? 0x3a2a1a : 0x5a3a20, 1);
      gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      gfx.lineStyle(2, 0xc0a070, 0.8);
      gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    };

    const drawHover = () => {
      if (disabled) return;
      gfx.clear();
      gfx.fillStyle(0x7a4a2a, 1);
      gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      gfx.lineStyle(2, 0xe8d5a3, 1);
      gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    };

    drawNormal();

    const hitArea = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    const btn = this.add.zone(x, y, w, h).setInteractive({ hitArea, cursor: 'pointer' });

    const text = this.add.text(x, y, label, {
      fontSize: '28px',
      fontFamily: '"STKaiti", "KaiTi", "楷体", "Noto Serif SC", serif',
      color: disabled ? '#665544' : '#e8d5a3',
      stroke: disabled ? '#332211' : '#3a2010',
      strokeThickness: 2
    }).setOrigin(0.5);

    if (!disabled) {
      btn.on('pointerover', () => drawHover());
      btn.on('pointerout', () => drawNormal());
      btn.on('pointerdown', () => {
        this.tweens.add({
          targets: [gfx, text],
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 60,
          yoyo: true,
          onComplete: callback
        });
      });
    }
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 3: 启动开发服务器验证**

```bash
npx vite --open
```

Expected: 浏览器打开，显示深色背景 + 古风标题 + 三个按钮

- [ ] **Step 4: 提交**

```bash
git add src/scenes/MenuScene.ts
git commit -m "feat: implement ancient-style start menu scene"
```

---

### Task 5: 初始化 Cordova 项目

**Files:**
- Create: `cordova/config.xml`

- [ ] **Step 1: 创建 cordova/config.xml**

```xml
<?xml version='1.0' encoding='utf-8'?>
<widget id="com.undertheheaven.game" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>天下牌</name>
    <description>A 2D cross-platform card game</description>
    <author email="dev@example.com" href="https://example.com">UnderTheHeaven Team</author>
    <content src="index.html" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    <preference name="Orientation" value="landscape" />
    <preference name="Fullscreen" value="true" />
    <preference name="BackgroundColor" value="0xff000000" />
    <platform name="android">
        <preference name="android-minSdkVersion" value="30" />
        <preference name="android-targetSdkVersion" value="34" />
    </platform>
</widget>
```

- [ ] **Step 2: 构建并验证 cordova/www 输出**

```bash
npx vite build
```

Expected: `cordova/www/index.html` 生成，包含打包后的 JS

- [ ] **Step 3: 提交**

```bash
git add cordova/config.xml
git commit -m "chore: add Cordova project configuration"
```

---

### Task 6: 创建 .gitignore 和最终验证

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: 创建 .gitignore**

```
node_modules/
dist/
cordova/www/
cordova/platforms/
cordova/plugins/
.DS_Store
*.log
```

- [ ] **Step 2: 最终验证完整构建流程**

```bash
npm run build
```

Expected: tsc 编译通过，vite 构建成功，cordova/www/ 生成完整输出

- [ ] **Step 3: 检查 Phaser 4 版本兼容性**

```bash
node -e "const p = require('phaser/package.json'); console.log(p.version)"
```

Expected: 输出 Phaser 版本号（4.x.x）

- [ ] **Step 4: 提交**

```bash
git add .gitignore
git commit -m "chore: add .gitignore and finalize project setup"
```

---

### 验证清单

完成后运行以下检查：

```bash
# TypeScript 编译
npx tsc --noEmit

# Vite 构建到 cordova/www
npm run build:cordova

# 验证输出文件存在
ls cordova/www/index.html cordova/www/assets/
```
