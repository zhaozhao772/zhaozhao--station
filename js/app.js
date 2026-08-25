/**
 * 昭昭专属个人站 - 核心应用框架
 * 负责路由、导航、主题、向导、全局状态
 */

const App = {
  state: {
    currentPage: 'home',
    settings: {},
    wizardDone: false,
    privacyUnlocked: {},  // 各隐私模块解锁状态
    sidebarOpen: false,
  },

  // 12个导航模块定义
  modules: [
    { id: 'home',       name: '今日工作台', icon: '🏠', privacy: false },
    { id: 'timer',      name: '工作与专注计时', icon: '⏱️', privacy: false },
    { id: 'projects',   name: '项目与内容管理', icon: '🎬', privacy: false },
    { id: 'reading',    name: '阅读模块', icon: '📖', privacy: false },
    { id: 'workout',    name: '锻炼板块', icon: '🏃🏻‍♀️', privacy: false },
    { id: 'emotion',    name: '情绪天气监测', icon: '🌤️', privacy: false },
    { id: 'emotion-analysis', name: '情绪循环分析', icon: '🧠', privacy: false },
    { id: 'stats',      name: '综合数据统计', icon: '📊', privacy: false },
    { id: 'review',     name: '每日复盘与设置', icon: '🌙', privacy: false },
    { id: 'soul',       name: '灵魂链接日记', icon: '✨', privacy: true },
    { id: 'star-map',   name: '链接星图', icon: '🌟', privacy: true },
    { id: 'cards',      name: '字卡传讯', icon: '💌', privacy: false },
    { id: 'ai-chat',    name: '跨维沟通', icon: '💬', privacy: true },
    { id: 'reminders',  name: '提醒中心', icon: '🔔', privacy: false },
  ],

  async init() {
    // 1. 初始化数据库
    const isNew = await DB.init();
    await DB.log('app_init', { is_new_user: isNew });

    // 1.5 一次性迁移：把历史 UTC 时间戳转成本地时区字符串（修正聊天时间戳显示）
    try {
      const r = await DB.migrateUTCTimestamps();
      if (r && !r.skipped) console.log(`[DB] 时间戳迁移完成，修正 ${r.fixed} 条`);
    } catch (e) { console.warn('[DB] 时间戳迁移失败:', e); }

    // 2. 加载设置
    this.state.settings = await DB.getAllSettings();

    // 3. 判断是否需要向导
    if (isNew || !this.state.settings.wizard_completed) {
      this.state.wizardDone = false;
      await Wizard.start();
      return;
    }

    // 4. 应用主题
    this.applyTheme();
    this.state.wizardDone = true;

    // 调试用：打印各模块版本号
    console.log('[VERSION] app.js 加载于', new Date().toLocaleString());
    if (window.AIChatModule) console.log('[VERSION] aichat.js:', AIChatModule._VERSION);

    // 5. 每日重置
    await DB.dailyReset();

    // 6. 恢复运行中的计时器
    await TimerModule.restoreRunning();

    // 7. 渲染主界面
    this.renderShell();
    this.navigate(this.state.settings.last_page || 'home');

    // 8. 启动时钟
    this.startClock();

    // 9. 检查提醒
    RemindersModule.checkAll();

    // 10. 装饰元素
    this.addDecorations();
  },

  applyTheme() {
    const s = this.state.settings;
    const theme = s.theme_mode || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const density = s.density || 'normal';
    document.documentElement.setAttribute('data-density', density);
    if (s.custom_primary) {
      document.documentElement.style.setProperty('--color-primary', s.custom_primary);
    }
    if (s.custom_bg) {
      document.documentElement.style.setProperty('--color-bg', s.custom_bg);
    }
  },

  renderShell() {
    const root = document.getElementById('app');
    const visibleModules = this.modules.filter(m => {
      const hidden = this.state.settings.hidden_modules || [];
      return !hidden.includes(m.id);
    });

    // 桌面端侧边栏
    const navItems = visibleModules.map(m => `
      <button class="nav-item" data-page="${m.id}" onclick="App.navigate('${m.id}')">
        <span class="nav-item__icon">${m.icon}</span>
        <span class="nav-item__label">${this.getModuleName(m.id)}</span>
        ${m.privacy ? '<span class="nav-item__icon" style="font-size:12px;opacity:0.5">🔒</span>' : ''}
      </button>
    `).join('');

    // 手机端底部导航（取前5个常用）
    const bottomModules = ['home', 'timer', 'emotion', 'soul', 'review']
      .map(id => visibleModules.find(m => m.id === id))
      .filter(Boolean);
    const bottomNav = bottomModules.map(m => `
      <button class="bottom-nav__item" data-page="${m.id}" onclick="App.navigate('${m.id}')">
        <span class="bottom-nav__item__icon">${m.icon}</span>
        <span>${this.getModuleName(m.id).slice(0,2)}</span>
      </button>
    `).join('');
    // 更多按钮
    const moreBtn = `
      <button class="bottom-nav__item" onclick="App.openModuleMenu()">
        <span class="bottom-nav__item__icon">☰</span>
        <span>更多</span>
      </button>`;

    root.innerHTML = `
      <div class="app-shell">
        <nav class="side-nav">
          <div class="side-nav__brand">
            <span class="side-nav__brand-icon">🌸</span>
            <div>
              <div class="side-nav__brand-name">${this.state.settings.station_name || '昭昭记录站'}</div>
              <span class="side-nav__brand-sub">${this.state.settings.subtitle || '我的记录空间'}</span>
            </div>
          </div>
          ${navItems}
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--color-divider)">
            <button class="nav-item" onclick="App.navigate('settings')">
              <span class="nav-item__icon">⚙️</span>
              <span class="nav-item__label">设置</span>
            </button>
          </div>
        </nav>
        <main class="main-area" id="mainArea"></main>
        <nav class="bottom-nav">
          ${bottomNav}
          ${moreBtn}
        </nav>
      </div>
    `;
    this.updateNavActive();
  },

  getModuleName(id) {
    const m = this.modules.find(x => x.id === id);
    if (!m) return id;
    const customNames = this.state.settings.custom_module_names || {};
    return customNames[id] || m.name;
  },

  navigate(pageId) {
    const mod = this.modules.find(m => m.id === pageId);
    // 隐私模块检查
    if (mod && mod.privacy) {
      if (!this.state.privacyUnlocked[pageId]) {
        PrivacyLock.show(pageId);
        return;
      }
    }
    this.state.currentPage = pageId;
    DB.setSetting('last_page', pageId);
    const main = document.getElementById('mainArea');
    if (!main) return;  // 主区域未渲染
    main.innerHTML = `<div class="page" id="pageContent"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

    // 路由到对应模块
    const router = {
      home: () => HomeModule.render(),
      timer: () => TimerModule.render(),
      projects: () => ProjectsModule.render(),
      reading: () => ReadingModule.render(),
      workout: () => WorkoutModule.render(),
      emotion: () => EmotionModule.render(),
      'emotion-analysis': () => EmotionAnalysis.render(),
      stats: () => StatsModule.render(),
      review: () => ReviewModule.render(),
      soul: () => SoulModule.render(),
      'star-map': () => StarMapModule.render(),
      cards: () => CardsModule.render(),
      'ai-chat': () => AIChatModule.render(),
      reminders: () => RemindersModule.render(),
      settings: () => SettingsModule.render(),
    };
    const fn = router[pageId];
    if (fn) { fn(); }
    else { document.getElementById('pageContent').innerHTML = '<div class="empty-state"><div class="empty-state__icon">🚧</div><div class="empty-state__text">模块开发中</div></div>'; }

    this.updateNavActive();
    // 滚动到顶
    document.getElementById('mainArea').scrollTop = 0;
    window.scrollTo(0, 0);
  },

  updateNavActive() {
    document.querySelectorAll('.nav-item, .bottom-nav__item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === this.state.currentPage);
    });
  },

  openModuleMenu() {
    const visibleModules = this.modules.filter(m => {
      const hidden = this.state.settings.hidden_modules || [];
      return !hidden.includes(m.id);
    });
    const items = visibleModules.map(m => `
      <div class="list-item" onclick="App.navigate('${m.id}');App.closeModal()">
        <span style="font-size:22px">${m.icon}</span>
        <div class="list-item__main">
          <div class="list-item__title">${this.getModuleName(m.id)}</div>
        </div>
      </div>
    `).join('');
    UI.modal('全部模块', `<div>${items}</div>`);
  },

  closeModal() { UI.closeModal(); },

  startClock() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    const tick = () => {
      const el = document.getElementById('liveClock');
      if (el) {
        const fmt = this.state.settings.time_format || '24h';
        const now = new Date();
        let h = now.getHours();
        const m = String(now.getMinutes()).padStart(2,'0');
        const s = String(now.getSeconds()).padStart(2,'0');
        let suffix = '';
        if (fmt === '12h') {
          suffix = h >= 12 ? ' PM' : ' AM';
          h = h % 12 || 12;
        }
        el.textContent = `${String(h).padStart(2,'0')}:${m}:${s}${suffix}`;
      }
    };
    tick();
    this._clockTimer = setInterval(tick, 1000);
  },

  addDecorations() {
    if (document.querySelector('.deco-layer')) return;
    const layer = document.createElement('div');
    layer.className = 'deco-layer';
    layer.innerHTML = `
      <span class="deco-heart">💗</span>
      <span class="deco-butterfly">🦋</span>
      <span class="deco-moon">🌙</span>
      <span class="deco-star">⭐</span>
    `;
    document.body.appendChild(layer);
  },

  // 获取当前对象昵称
  getLinkName() {
    return this.state.settings.link_partner_name || '宝宝';
  },

  // 获取问候语
  getGreeting() {
    const h = new Date().getHours();
    const name = this.state.settings.user_nickname || '昭昭';
    if (h < 6) return `凌晨好，${name}，注意休息呀`;
    if (h < 11) return `早上好，${name}，今天也要元气满满`;
    if (h < 14) return `中午好，${name}，记得吃午饭哦`;
    if (h < 18) return `下午好，${name}，辛苦啦💞`;
    if (h < 22) return `晚上好，${name}，今天过得怎么样`;
    return `夜深了，${name}，早点休息`;
  },
};

// ============ UI 工具 ============
const UI = {
  modal(title, contentHTML, opts = {}) {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'appModal';
    overlay.onclick = (e) => { if (e.target === overlay && opts.closeOnOutside !== false) this.closeModal(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">${title}</div>
          <button class="modal__close" onclick="UI.closeModal()">×</button>
        </div>
        <div class="modal__body">${contentHTML}</div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  closeModal() {
    const m = document.getElementById('appModal');
    if (m) m.remove();
  },

  toast(msg, type = 'info', duration = 2500) {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
  },

  confirm(message, opts = {}) {
    return new Promise((resolve) => {
      this.modal(opts.title || '请确认', `
        <p style="margin-bottom:20px;line-height:1.7">${message}</p>
        <div class="flex gap-3" style="justify-content:flex-end">
          <button class="btn" onclick="UI._confirmResolve=false;UI.closeModal()">取消</button>
          <button class="btn btn--accent" onclick="UI._confirmResolve=true;UI.closeModal()">${opts.okText || '确认'}</button>
        </div>
      `, { closeOnOutside: false });
      this._confirmResolve = false;
      const check = setInterval(() => {
        if (!document.getElementById('appModal')) {
          clearInterval(check);
          resolve(this._confirmResolve);
        }
      }, 100);
    });
  },

  // 图片预览（私密图模糊）
  imagePreview(src, isPrivate = false) {
    this.modal('图片查看', `
      <img src="${src}" style="width:100%;border-radius:14px" class="${isPrivate ? 'img-private' : 'img-private revealed'}"
           onclick="this.classList.toggle('revealed')">
      ${isPrivate ? '<p class="text-faint text-xs text-center mt-2">点击图片显示原图</p>' : ''}
    `);
  },

  // 日期选择辅助
  dateInput(defaultVal = '') {
    return `<input type="date" class="input" value="${defaultVal}">`;
  },

  // 空状态
  empty(icon, text) {
    return `<div class="empty-state"><div class="empty-state__icon">${icon}</div><div class="empty-state__text">${text}</div></div>`;
  },
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
