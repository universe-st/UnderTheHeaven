/**
 * ScreenManager — 手机浏览器全屏 + 横屏锁定
 *
 * 功能：
 * 1. 竖屏时显示 "请旋转设备" 遮罩
 * 2. 首次点击/触摸时请求全屏
 * 3. 锁定屏幕方向为横屏（landscape）
 *
 * 注：Cordova 原生包通过 config.xml 的 Orientation 和 Fullscreen 偏好控制，
 * 此模块仅作用于手机浏览器访问场景。
 *
 * 画布缩放由 Phaser ScaleManager (FIT + CENTER_BOTH) 控制，
 * ScreenManager 不干预 canvas CSS 尺寸，以保持固定宽高比。
 */

const IS_MOBILE = typeof navigator !== 'undefined'
  && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_CORDOVA = typeof window !== 'undefined' && !!(window as any).cordova;
let fullscreenRequested = false;

/** 尝试锁定横屏 */
async function lockLandscape(): Promise<void> {
  try {
    const orient = (screen as any).orientation
      || (screen as any).mozOrientation
      || (screen as any).msOrientation;
    if (orient && typeof orient.lock === 'function') {
      await orient.lock('landscape');
    }
  } catch {
    // 不支持或未全屏时静默失败
  }
}

/** 尝试请求全屏 */
async function requestFullscreen(element: HTMLElement): Promise<void> {
  const el = element as any;
  const method = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.msRequestFullscreen
    || el.mozRequestFullScreen;
  if (method && !document.fullscreenElement && !(document as any).webkitFullscreenElement) {
    try {
      await method.call(el);
    } catch {
      // 浏览器策略拒绝（需要用户手势）
    }
  }
}

/** 监听 orientation 变化，显示/隐藏竖屏提示 */
function setupOrientationOverlay(): void {
  if (document.getElementById('uth-rotate-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'uth-rotate-overlay';
  overlay.innerHTML = `
    <div class="uth-rotate-icon">📱↻</div>
    <div class="uth-rotate-text">请旋转设备至横屏</div>
    <div class="uth-rotate-sub">Please rotate your device</div>
  `;
  document.body.appendChild(overlay);

  const checkOrientation = () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    overlay.style.display = isPortrait ? 'flex' : 'none';
  };

  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 300);
  });
}

/** 用户交互回调：请求全屏 + 锁定横屏 */
function onUserInteraction(): void {
  if (fullscreenRequested) return;
  fullscreenRequested = true;

  const canvas = document.querySelector('canvas');
  if (canvas) {
    void requestFullscreen(canvas);
    // 部分浏览器在全屏后才能锁方向
    void lockLandscape();
    document.addEventListener('fullscreenchange', () => void lockLandscape(), { once: true });
    document.addEventListener('webkitfullscreenchange', () => void lockLandscape(), { once: true });
  }
}

/** 初始化 ScreenManager */
export function initScreenManager(): void {
  if (!IS_MOBILE || IS_CORDOVA) return;

  // 添加横屏提示遮罩 CSS
  const style = document.createElement('style');
  style.textContent = `
    #uth-rotate-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 99999;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.92);
      color: #d4a853;
      font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    .uth-rotate-icon {
      font-size: 64px;
      animation: uth-rotate-pulse 2s ease-in-out infinite;
    }
    @keyframes uth-rotate-pulse {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(90deg); }
    }
    .uth-rotate-text {
      font-size: 24px;
      margin-top: 20px;
      letter-spacing: 2px;
    }
    .uth-rotate-sub {
      font-size: 14px;
      margin-top: 8px;
      color: #8b7355;
    }
  `;
  document.head.appendChild(style);

  // 竖屏旋转提示
  setupOrientationOverlay();

  // 首次触摸: 全屏 + 横屏锁定
  document.addEventListener('pointerdown', onUserInteraction, { once: true });
  document.addEventListener('touchstart', onUserInteraction, { once: true });
}
