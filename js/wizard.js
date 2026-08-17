/**
 * 首次启动配置向导
 */
const Wizard = {
  step: 0,
  data: {},

  steps: [
    { id: 'welcome', title: '欢迎使用 🌸', render: () => Wizard._welcome() },
    { id: 'basic', title: '基本信息', render: () => Wizard._basic() },
    { id: 'device', title: '设备与数据模式', render: () => Wizard._device() },
    { id: 'modules', title: '选择模块', render: () => Wizard._modules() },
    { id: 'soul', title: '灵魂链接设置', render: () => Wizard._soul() },
    { id: 'appearance', title: '外观与字体', render: () => Wizard._appearance() },
    { id: 'features', title: '功能开关', render: () => Wizard._features() },
    { id: 'privacy', title: '隐私设置', render: () => Wizard._privacy() },
    { id: 'reminder', title: '数据保全提醒', render: () => Wizard._reminder() },
    { id: 'done', title: '完成 ✨', render: () => Wizard._done() },
  ],

  async start() {
    this.step = 0;
    this.data = {
      station_name: '昭昭专属个人站',
      subtitle: '我的工作、成长、情绪与爱人的记录空间',
      user_nickname: '昭昭',
      user_identity: '上班族',
      device: 'iQOO Neo9',
      mode: 'local',
      modules: ['home','timer','projects','reading','workout','emotion','emotion-analysis','stats','review','soul','star-map','cards','ai-chat','reminders'],
      link_partner_name: '宝宝',
      soul_module_names: ['灵魂链接','梦角手账','特别记录','一些灵感和想法'],
      enable_cards: true,
      enable_self_explore: true,
      enable_ai: true,
      privacy_lock: true,
      theme_mode: 'light',
      density: 'auto',
      time_format: '24h',
      font_family: '楷体',
    };
    this._render();
  },

  _render() {
    const s = this.steps[this.step];
    const root = document.getElementById('app');
    const progress = ((this.step + 1) / this.steps.length * 100).toFixed(0);
    root.innerHTML = `
      <div class="wizard">
        <div class="wizard__card">
          <div class="wizard__step">第 ${this.step + 1} / ${this.steps.length} 步</div>
          <div class="wizard__title">${s.title}</div>
          <div class="wizard__progress"><div class="wizard__progress-bar" style="width:${progress}%"></div></div>
          <div id="wizardContent">${s.render()}</div>
          <div class="flex gap-3 mt-6">
            ${this.step > 0 ? '<button class="btn flex-1" onclick="Wizard.prev()">上一步</button>' : ''}
            ${this.step < this.steps.length - 1
              ? '<button class="btn btn--primary flex-1" onclick="Wizard.next()">下一步</button>'
              : '<button class="btn btn--primary flex-1" onclick="Wizard.finish()">开始使用 🌸</button>'}
          </div>
        </div>
      </div>
    `;
  },

  next() {
    this._collect();
    if (!this._validate()) return;
    this.step++;
    this._render();
  },

  prev() {
    this._collect();
    this.step = Math.max(0, this.step - 1);
    this._render();
  },

  _collect() {
    const c = document.getElementById('wizardContent');
    if (!c) return;
    c.querySelectorAll('[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (el.type === 'checkbox') {
        if (el.dataset.type === 'multi') {
          // 数组类型 checkbox
          if (!Array.isArray(this.data[key])) this.data[key] = [];
          const val = el.value;
          if (el.checked && !this.data[key].includes(val)) this.data[key].push(val);
          if (!el.checked) this.data[key] = this.data[key].filter(v => v !== val);
        } else {
          // 单个 boolean
          this.data[key] = el.checked;
        }
      } else if (el.dataset.type === 'multi-text') {
        this.data[key] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
      } else {
        this.data[key] = el.value;
      }
    });
  },

  _validate() {
    return true;
  },

  // ============ 步骤内容 ============
  _welcome() {
    return `
      <div class="text-center mb-4">
        <div style="font-size:56px;margin-bottom:16px">🌸🦋🌙</div>
        <p class="text-soft">欢迎来到属于你的温柔空间</p>
        <p class="text-soft text-sm mt-2">这里将记录你的工作、成长、情绪，以及那些特别的链接</p>
      </div>
      <div class="card--blur" style="background:var(--color-bg-alt);padding:14px;border-radius:14px;margin-top:16px">
        <p class="text-sm text-soft">接下来的几步，我会帮你完成个性化设置。所有设置以后都可以在「设置」中修改。</p>
      </div>
    `;
  },

  _basic() {
    return `
      <div class="field">
        <label class="field__label">工作台名称</label>
        <input class="input" data-key="station_name" value="${this.data.station_name}">
      </div>
      <div class="field">
        <label class="field__label">副标题</label>
        <input class="input" data-key="subtitle" value="${this.data.subtitle}">
      </div>
      <div class="field">
        <label class="field__label">你的昵称</label>
        <input class="input" data-key="user_nickname" value="${this.data.user_nickname}">
      </div>
      <div class="field">
        <label class="field__label">主要身份</label>
        <select class="select" data-key="user_identity">
          <option ${this.data.user_identity==='上班族'?'selected':''}>上班族</option>
          <option ${this.data.user_identity==='学生'?'selected':''}>学生</option>
          <option ${this.data.user_identity==='自由职业'?'selected':''}>自由职业</option>
          <option ${this.data.user_identity==='其他'?'selected':''}>其他</option>
        </select>
      </div>
    `;
  },

  _device() {
    return `
      <div class="field">
        <label class="field__label">使用设备</label>
        <input class="input" data-key="device" value="${this.data.device}">
        <div class="field__hint">系统会根据 iQOO Neo9 自动适配界面密度</div>
      </div>
      <div class="field">
        <label class="field__label">数据存储模式</label>
        <div class="tag-select">
          <div class="tag-chip ${this.data.mode==='local'?'active':''}" onclick="Wizard._toggleMode('local')">
            📱 仅本机模式
          </div>
          <div class="tag-chip ${this.data.mode==='sync'?'active':''}" onclick="Wizard._toggleMode('sync')">
            ☁️ 同步模式
          </div>
        </div>
        <div class="field__hint" id="modeHint"></div>
      </div>
      <div class="card--blur" style="background:rgba(219,90,107,0.06);padding:12px;border-radius:12px;margin-top:8px;border:1px solid rgba(219,90,107,0.2)">
        <p class="text-sm" style="color:var(--color-accent);font-weight:600">⚠️ 数据保全提醒</p>
        <p class="text-xs text-soft mt-2">仅本机模式下，数据保存在浏览器 IndexedDB 中。更换浏览器、清理网站数据、卸载应用或预览地址变化可能导致数据不可访问。请定期使用「导出备份」功能保存数据。</p>
      </div>
    `;
  },

  _toggleMode(m) {
    this.data.mode = m;
    const hint = document.getElementById('modeHint');
    if (m === 'local') {
      hint.innerHTML = '业务数据保存在本地 IndexedDB，不上传云端。可随时导出完整备份。';
    } else {
      hint.innerHTML = '需要配置你自己的后端/云数据库。传输加密。默认不上传全部数据。';
    }
    this._render();
  },

  _modules() {
    const all = App.modules;
    const selected = this.data.modules || [];
    return `
      <p class="text-sm text-soft mb-3">选择需要显示的模块（可随时修改）</p>
      <div class="flex flex-col gap-2">
        ${all.map(m => `
          <label class="flex items-center gap-2" style="padding:8px;background:var(--color-bg-alt);border-radius:10px">
            <input type="checkbox" data-type="multi" data-key="modules" value="${m.id}" ${selected.includes(m.id)?'checked':''}>
            <span style="font-size:18px">${m.icon}</span>
            <span>${m.name}</span>
          </label>
        `).join('')}
      </div>
    `;
  },

  _soul() {
    return `
      <div class="field">
        <label class="field__label">特殊链接对象的称呼</label>
        <input class="input" data-key="link_partner_name" value="${this.data.link_partner_name}">
        <div class="field__hint">例如：宝宝、他的名字、一个代号</div>
      </div>
      <div class="field">
        <label class="field__label">灵魂链接模块希望显示的名称（每行一个）</label>
        <textarea class="textarea" data-key="soul_module_names" data-type="multi-text">${this.data.soul_module_names.join('\n')}</textarea>
        <div class="field__hint">这些名称会出现在灵魂链接模块的子分类中</div>
      </div>
    `;
  },

  _appearance() {
    return `
      <div class="field">
        <label class="field__label">主题模式</label>
        <div class="tag-select">
          <div class="tag-chip ${this.data.theme_mode==='light'?'active':''}" onclick="Wizard.data.theme_mode='light';Wizard._render()">🌸 浅色</div>
          <div class="tag-chip ${this.data.theme_mode==='dark'?'active':''}" onclick="Wizard.data.theme_mode='dark';Wizard._render()">🌙 柔和深色</div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">字体</label>
        <select class="select" data-key="font_family">
          <option ${this.data.font_family==='楷体'?'selected':''}>楷体</option>
          <option ${this.data.font_family==='宋体'?'selected':''}>宋体</option>
          <option ${this.data.font_family==='黑体'?'selected':''}>黑体</option>
          <option ${this.data.font_family==='默认无衬线'?'selected':''}>默认无衬线</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">界面密度</label>
        <div class="tag-select">
          <div class="tag-chip ${this.data.density==='auto'?'active':''}" onclick="Wizard.data.density='auto';Wizard._render()">📱 自适应（iQOO Neo9）</div>
          <div class="tag-chip ${this.data.density==='normal'?'active':''}" onclick="Wizard.data.density='normal';Wizard._render()">🌿 舒适</div>
          <div class="tag-chip ${this.data.density==='compact'?'active':''}" onclick="Wizard.data.density='compact';Wizard._render()">紧凑</div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">时间格式</label>
        <div class="tag-select">
          <div class="tag-chip ${this.data.time_format==='24h'?'active':''}" onclick="Wizard.data.time_format='24h';Wizard._render()">24 小时制</div>
          <div class="tag-chip ${this.data.time_format==='12h'?'active':''}" onclick="Wizard.data.time_format='12h';Wizard._render()">12 小时制</div>
        </div>
      </div>
    `;
  },

  _features() {
    return `
      <div class="flex flex-col gap-3">
        <label class="flex items-center gap-2" style="padding:10px;background:var(--color-bg-alt);border-radius:10px">
          <input type="checkbox" data-key="enable_cards" value="true" ${this.data.enable_cards?'checked':''}>
          <div><div>💌 字卡传讯</div><div class="text-xs text-faint">象征性自我探索工具</div></div>
        </label>
        <label class="flex items-center gap-2" style="padding:10px;background:var(--color-bg-alt);border-radius:10px">
          <input type="checkbox" data-key="enable_self_explore" value="true" ${this.data.enable_self_explore?'checked':''}>
          <div><div>🧭 自我探索</div><div class="text-xs text-faint">日记问题与行动建议</div></div>
        </label>
        <label class="flex items-center gap-2" style="padding:10px;background:var(--color-bg-alt);border-radius:10px">
          <input type="checkbox" data-key="enable_ai" value="true" ${this.data.enable_ai?'checked':''}>
          <div><div>🤖 AI 辅助分析</div><div class="text-xs text-faint">可配置自己的 API 连接</div></div>
        </label>
      </div>
      <div class="card--blur" style="background:rgba(187,164,217,0.08);padding:12px;border-radius:12px;margin-top:12px">
        <p class="text-xs text-soft">AI 功能默认关闭外部调用。即使不配置任何 API，所有本地记录、统计和复盘功能都能正常使用。</p>
      </div>
    `;
  },

  _privacy() {
    return `
      <div class="field">
        <label class="flex items-center gap-2" style="padding:10px;background:var(--color-bg-alt);border-radius:10px">
          <input type="checkbox" data-key="privacy_lock" value="true" ${this.data.privacy_lock?'checked':''}>
          <div><div>🔒 为隐私模块设置独立密码</div><div class="text-xs text-faint">灵魂链接、链接星图、跨维沟通进入时需验证</div></div>
        </label>
      </div>
      <div class="field" id="passwordField">
        <label class="field__label">设置隐私密码（4-8 位数字）</label>
        <input class="input lock-screen__input" type="password" data-key="privacy_password" maxlength="8" placeholder="留空则不设密码" inputmode="numeric">
        <div class="field__hint">密码使用 Web Crypto 加密保存，不会随备份导出</div>
      </div>
    `;
  },

  _reminder() {
    return `
      <div class="card--blur" style="background:rgba(219,90,107,0.06);padding:16px;border-radius:14px;border:1px solid rgba(219,90,107,0.2)">
        <p style="color:var(--color-accent);font-weight:600;margin-bottom:10px">📋 请认真阅读以下数据保全说明</p>
        <ul class="text-sm text-soft" style="line-height:2;padding-left:16px">
          <li>• 本应用数据存储在浏览器 <b>IndexedDB</b> 中，数据库命名为 <code>zhaozhao_station_db</code></li>
          <li>• 预览地址过期 ≠ 数据丢失，但更换浏览器/清理数据会导致数据不可访问</li>
          <li>• 请定期在「设置 → 数据备份」中导出 JSON 备份</li>
          <li>• 每次程序升级前会自动创建备份，保留最近 10 份</li>
          <li>• 升级只修改界面，<b>不会删除或覆盖已有记录</b></li>
          <li>• 历史记录永久保留，每日重置只刷新今日视图</li>
        </ul>
      </div>
      <p class="text-center text-faint text-sm mt-4">建议现在就截个图保存这些说明 📸</p>
    `;
  },

  _done() {
    return `
      <div class="text-center">
        <div style="font-size:56px;margin-bottom:16px">🌸✨🌙</div>
        <p class="text-lg" style="color:var(--color-primary);font-weight:600">一切就绪啦</p>
        <p class="text-soft text-sm mt-2">${this.data.station_name} 已经为你准备好了</p>
        <div class="card--blur" style="background:var(--color-bg-alt);padding:16px;border-radius:14px;margin-top:20px;text-align:left">
          <p class="text-sm"><b>📝 接下来你可以：</b></p>
          <ul class="text-sm text-soft" style="line-height:2;padding-left:16px;margin-top:8px">
            <li>在「今日工作台」查看概览</li>
            <li>在「工作与专注计时」开始一次专注</li>
            <li>在「灵魂链接日记」记录今天的感受</li>
            <li>在「设置」中调整任何配置</li>
          </ul>
        </div>
      </div>
    `;
  },

  async finish() {
    this._collect();
    // 保存所有设置
    for (const [k, v] of Object.entries(this.data)) {
      await DB.setSetting(k, v);
    }
    await DB.setSetting('wizard_completed', true);
    await DB.setSetting('db_initialized_at', nowISO());
    await DB.setSetting('data_version', DB_VERSION);

    // 创建初始结构（仅在空数据库时）
    // 预设示例任务类型
    const taskTypes = await DB.getSetting('task_types');
    if (!taskTypes) {
      await DB.setSetting('task_types', ['阅读','锻炼','电影/电影解说','纪录片','复盘阿苡视频','其他']);
    }
    // 预设情绪类型
    const emotionTypes = await DB.getSetting('emotion_types');
    if (!emotionTypes) {
      await DB.setSetting('emotion_types', [
        { name: '开心', color: '#F8C5CE', valence: 1 },
        { name: '兴奋', color: '#F194A6', valence: 1 },
        { name: '满足', color: '#7EC8A0', valence: 1 },
        { name: '平和', color: '#BBA4D9', valence: 0 },
        { name: '放松', color: '#8AB8D8', valence: 1 },
        { name: '期待', color: '#F5B97A', valence: 1 },
        { name: '焦虑', color: '#DB5A6B', valence: -1 },
        { name: '烦躁', color: '#E07080', valence: -1 },
        { name: '生气', color: '#C04050', valence: -1 },
        { name: '委屈', color: '#9E6E96', valence: -1 },
        { name: '伤心', color: '#7090B0', valence: -1 },
        { name: '孤独', color: '#607090', valence: -1 },
        { name: '内疚', color: '#A08070', valence: -1 },
        { name: '嫉妒', color: '#80A070', valence: -1 },
        { name: '恐惧', color: '#506070', valence: -1 },
        { name: '疲惫', color: '#A09898', valence: -1 },
        { name: '麻木', color: '#909098', valence: -1 },
        { name: '崩溃', color: '#604050', valence: -1 },
      ]);
    }

    // 创建初始备份
    await DB.createBackup('initial-setup');

    // 创建默认链接档案
    const profiles = await DB.list('link_profiles');
    if (profiles.length === 0) {
      await DB.save('link_profiles', {
        name: this.data.link_partner_name,
        is_default: true,
        note: '默认档案',
      });
    }

    UI.toast('设置完成！欢迎使用 🌸', 'success');

    // 重新初始化
    App.state.settings = await DB.getAllSettings();
    App.state.wizardDone = true;
    App.applyTheme();
    App.renderShell();
    App.navigate('home');
    App.startClock();
    App.addDecorations();
    await DB.log('wizard_completed', {});
  },
};
