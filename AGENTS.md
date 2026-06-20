# 天下牌 (Under The Heaven)

一款中式卡牌游戏，基于 Phaser 4 + TypeScript + Cordova 构建。

---

## 目录

- [项目概述](#项目概述)
- [文档目录结构](#文档目录结构)
- [技术栈](#技术栈)
- [场景结构](#场景结构)
- [编码规范](#编码规范)
- [字体约定](#字体约定)
- [音频 / BGM 约定](#音频--bgm-约定)
- [构建命令](#构建命令)
- [Android 部署](#android-部署)
- [资源管理](#资源管理)
- [AI 开发指引](#ai-开发指引)

---

## 项目概述

天下牌是一款中式风格的卡牌游戏。当前处于早期开发阶段，已完成主菜单场景和加载场景的基本框架。

---

## 文档目录结构

项目的文档按以下结构组织，AI 开发时请遵循此约定查找和写入文档：

```
UnderTheHeaven/
├── AGENTS.md                    # 本文件 — 项目总览及 AI 开发指引
├── docs/                        # 文档根目录
│   ├── design/                  # 设计文档
│   │   ├── 角色技能实现方案.md    # 角色技能触发系统和韩信技能动画实现（2025-06-19）
│   │   └── game/                # 游戏策划文档（模块化拆分，主策划案为索引）
│   │       ├── README.md        # 游戏设计文档索引
│   │       ├── 主策划案.md       # 策划案总索引，链接各子模块
│   │       ├── 01-核心概述.md    # 游戏概念、核心玩法、核心循环
│   │       ├── 02-对战系统.md    # 牌组、点数、对局流程、牌型系数
│   │       ├── 03-地图系统.md    # Roguelike 地图结构、节点类型
│   │       ├── 04-双生命值系统.md # 气数 + 天命
│   │       ├── 05-战间系统.md    # 通宝经济、黄金台商店
│   │       ├── 06-牌与道具系统.md # 卜辞牌、锦囊牌、事件牌
│   │       ├── 07-印记系统.md    # 局内强化印记
│   │       ├── 08-历史人物系统.md # 各稀有度人物全表
│   │       ├── 09-敌人系统.md    # 难度曲线、Boss 能力
│   │       ├── 10-局外成长系统.md # 成长维度、通宝利息
│   │       ├── 11-美术与视觉方向.md
│   │       ├── 12-技术路线.md    # 技术栈、Phase 1-6
│   │       └── 13-待定项.md      # 未确定事项汇总
│   └── superpowers/             # AI 开发过程记录（由 Superpowers 自动管理）
│       ├── specs/               # 需求规格说明
│       └── plans/               # 实现计划
├── src/                         # 源代码（TypeScript）
│   ├── main.ts                  # 游戏入口，创建 Phaser.Game 实例
│   ├── config.ts                # Phaser GameConfig 配置
│   └── scenes/                  # Phaser 场景
│       ├── LoadingScene.ts      # 加载场景（入口，显示加载画面）
│       └── MenuScene.ts         # 主菜单场景（标题、按钮、BGM、浮动粒子）
├── public/                      # 静态资源（Vite 在根路径提供访问）
│   ├── fonts/                   # 字体文件
│   │   └── LXGWWenKai-Regular.ttf
│   ├── bgm_menu_44100.mp3       # 主菜单 BGM（44.1kHz）
│   ├── bgm_menu.mp3             # BGM 原始文件（48kHz，仅供参考）
│   └── background_under_the_heaven.jpg  # 背景图
├── cordova/                     # Cordova 原生打包目录
│   ├── www/                     # 构建输出目标（Vite 构建产物写入此目录）
│   ├── config.xml               # Cordova 配置
│   ├── build.json               # 签名配置（含密钥库路径）
│   └── jks/                     # Android 签名密钥
├── .opencode/                   # OpenCode 配置
│   └── skills/                  # Phaser 4 技能库
├── .superpowers/                # Superpowers 配置
├── index.html                   # HTML 入口（含字体 @font-face 声明）
├── tsconfig.json                # TypeScript 编译配置
├── vite.config.ts               # Vite 构建配置
└── package.json                 # 项目依赖与脚本
```

### 文档写入约定

| 文档类型 | 存放位置 | 命名规范 | 说明 |
|---------|---------|---------|------|
| 游戏策划/设计 | `docs/design/game/` | 中文标题，如 `主策划案.md`（总索引），子模块 `NN-名称.md` | 核心策划文档（模块化拆分） |
| 功能规格 | `docs/superpowers/specs/` | `YYYY-MM-DD-功能名-design.md` | Superpowers 自动管理 |
| 实现计划 | `docs/superpowers/plans/` | `YYYY-MM-DD-功能名.md` | Superpowers 自动管理 |
| 技术设计文档 | `docs/design/` 对应子目录 | 描述性文件名 | 新建子目录按模块分类 |
| API/接口文档 | `docs/` 对应子目录 | 英文或中文均可 | 按需创建 |
| 新场景 | `src/scenes/` | `PascalCase.ts`（如 `GameScene.ts`） | 与 Phaser 场景命名一致 |

---

## 技术栈

- **Phaser 4** — 游戏框架（WebGL/Canvas 渲染）
- **TypeScript** — 严格模式，目标 ES2020
- **Cordova** — Android/iOS 原生打包
- **Vite** — 开发服务器与构建工具

---

## 场景结构

```
LoadingScene -> MenuScene -> （后续: GameScene, DeckScene, ShopScene 等）
```

- `LoadingScene` — 入口场景，显示加载画面，跳转至 MenuScene
- `MenuScene` — 主菜单，包含标题、按钮、背景音乐、浮动粒子特效

---

## 编码规范

- 启用 TypeScript 严格模式（`strict: true`）
- 目标 ES2020，模块解析使用 `bundler`
- 使用 Phaser 4 API（从 `phaser` 包导入）
- 避免 Phaser 3 已废弃的模式（pipelines、FX masks 等）
- 游戏对象通过场景工厂方法创建（`this.add.*`、`this.load.*`）

### 状态与场景分离规范（State Reset Pattern）

所有 Phaser Scene 类必须遵循以下规范，确保场景重启时状态完全重建：

1. **每个 Scene 必须实现 `resetSceneState()` 私有方法**，集中重置所有可变状态字段到初始值：
   - 基础游戏数据（phase、battle、counters）
   - UI 引用（modal、panel、tooltip 等容器置 null 前先 `destroy()`）
   - 输入状态（drag、selected 等）
   - 字符/技能状态（slot 数组、glow tweens、skill event bus/registry）
   - 调用 `this.tweens.killAll()` 停止所有动画

2. **`create()` 第一行必须调用 `this.resetSceneState()`**，在任何 UI 创建之前

3. **禁止在 `create()` 中分散写 `this.xxx = initialValue`**——所有重置逻辑收敛到 `resetSceneState()`

4. **Phaser GameObjects（`!` 断言字段）由 Phaser 的 shutdown 自动销毁**，不需要在 reset 中手动处理；但持有这些引用的数组/容器必须清空

```typescript
// 反例：状态重置散落在 create() 各处
create(): void {
  this.phase = 'player_init'; // ❌ 应放在 resetSceneState
  // ... 100 lines ...
  this.selectedIndices = new Set(); // ❌ 分散
}

// 正例：收敛到单一方法
private resetSceneState(): void {
  this.phase = 'player_init';
  this.selectedIndices = new Set();
  this.cardObjects = [];
  this.centerCards = [];
  this.centerCardsOwner = null;
  this.centerDepthCounter = DEPTH_CENTER_BASE;
  this.modalPanel?.destroy();
  this.modalPanel = null;
  for (const [, tweens] of this.glowTweens) {
    for (const t of tweens) t.stop();
  }
  this.glowTweens = new Map();
  this.skillEventBus?.clear();
  this.skillRegistry?.clear();
  this.tweens.killAll();
}

create(): void {
  this.resetSceneState(); // ✅ 第一行，无条件调用
  // ... 创建 UI、初始化系统
}
```

---

## 字体约定

主要中文字体栈：

```
"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif
```

- **LXGWWenKai（霞鹜文楷）** 为主要字体，通过 `@font-face` 加载
- **加载策略**：字体文件直接从 `public/fonts/LXGWWenKai-Regular.ttf` 通过 `url('/fonts/LXGWWenKai-Regular.ttf')` 提供。Vite 在开发和生产构建中均将 `public/` 下的文件在根路径提供访问
- **Noto Serif SC** 为 Web 回退字体（通过 Google Fonts CDN 加载）—— 仅在有网络时可用
- 离线/Android 环境下回退到系统字体（STKaiti、KaiTi）
- **注意**：原始 TTF 文件曾存在损坏的 table directory 和字符形数据（4.1 万字符形中有 4.6 万被截断）
- **重新生成字体子集**：从 https://github.com/lxgw/LxgwWenKai 下载最新版本，然后运行：

  ```
  pyftsubset LXGWWenKai-Regular.ttf \
    --unicodes="U+0020-00FF,U+2000-206F,U+2100-214F,U+3000-303F,U+4E00-9FFF,U+FF00-FFEF" \
    --layout-features="*" \
    --glyph-names --symbol-cmap --legacy-cmap \
    --notdef-outline --recommended-glyphs \
    --name-IDs='*' --name-languages='*' \
    --output-file=public/fonts/LXGWWenKai-Regular.ttf
  ```

---

## 音频 / BGM 约定

- BGM 文件使用 44.1kHz 采样率以兼容 Android WebView
- 原始 48kHz 文件（Suno AI 生成）保留作为源文件但不加载
- 转换后的文件使用 `_44100` 后缀（如 `bgm_menu_44100.mp3`）
- 首次用户交互时显式恢复 AudioContext 以处理 Android 自动播放策略

---

## 构建命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（端口 5173） |
| `npm run build` | TypeScript 检查 + Vite 生产构建 |
| `npm run build:cordova` | 面向 Cordova 的 Vite 构建（输出到 cordova/www/） |
| `npm run android` | 在 Android 设备/模拟器上运行 |
| `npm run build:android` | 构建 + Cordova Android APK |

---

## Android 部署

1. `npm run build:cordova` — 构建 Web 资源到 `cordova/www/`
2. `cordova build android --release` — 生成签名 APK（签名配置参见 `cordova/build.json`）

---

## 资源管理

- 图片：放置于 `public/` 目录，在根路径访问
- 音频：放置于 `public/` 目录，通过 Phaser 的 `this.load.audio()` 加载
- 后续：spritesheets、atlases 等资源将通过 Loader 添加

---

## 加载进度规范

为确保加载进度条（LoadingScene）能正确显示资源加载进度，所有新添加的游戏资源必须遵循以下规范：

### 资源注册位置

所有游戏资源（音频、图片、精灵图集等）在 `src/scenes/LoadingScene.ts` 的 `create()` 方法中注册加载，
具体在 `loadAssets()` 方法（或对应的手动加载代码段）中。

### 添加新资源的步骤

1. 将资源文件放置于 `public/` 目录（或子目录，如 `public/voice/`）
2. 在 LoadingScene 的 `loadAssets()` 方法中，使用以下 API 注册：

```typescript
// 音频
this.load.audio('资源键名', '文件名.mp3');

// 图片
this.load.image('资源键名', '文件名.png');

// 精灵图集（如需）
this.load.atlas('图集键名', '图集文件.png', '图集数据文件.json');
```

3. 资源键名需唯一，不可与已有键名重复
4. 如果新资源需要在场景中立即使用，在加载完成的回调中引用

### 禁止的做法

- ❌ 在场景的 `preload()` 方法中注册资源（这会绕过进度监听）
- ❌ 使用 Phaser.Loader 的未受监听方式加载（如直接注入到缓存）
- ❌ 在非 LoadingScene 的场景中注册新资源而不更新 LoadingScene

### 验证加载进度

添加新资源后，在开发模式下验证：
1. `npm run dev` 启动开发服务器
2. 观察加载界面，确认进度条从 0% 上升到 100%
3. 在浏览器 DevTools Network 面板中确认所有资源被正确请求

---

## AI 开发指引

### 开发前须知

1. **阅读策划文档**：在实现任何功能之前，先阅读 `docs/design/game/主策划案.md` 了解游戏核心玩法与设计意图
2. **查看现有场景**：了解 `src/scenes/` 中已有场景的实现风格和代码模式
3. **遵循编码规范**：严格遵守上方[编码规范](#编码规范)章节的所有约定
4. **使用 Superpowers 流程**：在开始大型功能开发前，遵循 brainstorming → specs → plans 的流程生成文档

### 修改代码时的检查清单

- [ ] 是否使用了 Phaser 4 API（非 Phaser 3 废弃 API）？
- [ ] 游戏对象是否通过场景工厂方法创建（`this.add.*`、`this.load.*`）？
- [ ] TypeScript 严格模式是否通过（`npm run build` 无类型错误）？
- [ ] 新场景是否在 `src/scenes/` 目录下，命名为 `PascalCase.ts`？
- [ ] 静态资源是否放置于 `public/` 目录？
- [ ] 如需添加技能，是否通过 OpenCode skill 工具加载了对应的 Phaser 4 技能？
- [ ] 是否有对应的文档更新（策划文档或技术文档）？

---

## 界面元素大小规范

以下规范基于画布分辨率 **2400×1080**，在手机屏幕上通过 `Phaser.Scale.FIT` 等比缩放适配。

### 参考手游行业标准

| 指标 | 标准 | 说明 |
|------|------|------|
| 触摸目标最小尺寸 | 44pt (iOS HIG) / 48dp (Material Design) | 所有可交互元素 ≥ 44×44 |
| 卡牌面积占屏幕比 | 5-8% | 卡牌内容必须清晰可辨 |
| 按钮最小宽度 | 120pt | 单手操作区按钮 |
| 圆角尺寸 | 8-16pt | 按钮、面板通用 |
| 最小字号（可读） | 16pt | 辅助信息 |
| 建议字号（正文） | 20-24pt | 按钮标签、说明 |
| 大标题字号 | 30-38pt | 弹窗标题 |

### 当前项目 UI 元素规范

| 元素 | 尺寸 | 说明 |
|------|------|------|
| 卡牌 (CARD_W×CARD_H) | 180×252 px | 画布占比约 1.75% 面积 |
| 牌型按钮 | 180×72 px | 右上角，距右边缘 230px |
| 设置按钮（齿轮） | 直径 88px | 右上角，距右/上边缘 28px 内边距 |
| 设置面板 | 340×180 px | 右上角弹出的菜单 |
| 牌型系数表弹窗 | 750×750 px | 居中弹窗 |
| 音量设置弹窗 | 520×300 px | 居中弹窗 |
| BGM/SFX 滑块 | 轨道宽可变，高 10px，手柄半径 16px | 拖拽区域含 1.5 倍扩展 |
| 大标题字号 | 38px | 弹窗标题 |
| 按钮字号 | 28-32px | 菜单项、动作按钮 |
| 正文/标签字号 | 20-24px | 说明、标签 |
| 浮层遮罩背景 | rgba(0,0,0,0.7) | 所有弹窗遮罩 |
| 圆角统一 | 12-16px | 按钮和面板 |

**以上数值基于画布分辨率 2400×1080，在手机屏幕上通过 Phaser.Scale.FIT 等比缩放适配。**


