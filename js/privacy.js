/**
 * 隐私模块独立密码保护
 * 使用 Web Crypto API (SHA-256 + salt) 加密保存
 */
const PrivacyLock = {
  async show(moduleId) {
    const pwd = await DB.getSetting('privacy_password');
    if (!pwd) {
      // 未设密码直接放行
      App.state.privacyUnlocked[moduleId] = true;
      App.navigate(moduleId);
      return;
    }
    const root = document.getElementById('app');
    const existing = document.getElementById('lockOverlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'lock-screen';
    overlay.id = 'lockOverlay';
    overlay.innerHTML = `
      <div class="lock-screen__icon">🔒</div>
      <div class="lock-screen__title">隐私模块</div>
      <p class="text-soft text-sm mb-4">请输入密码进入「${App.getModuleName(moduleId)}」</p>
      <input class="input lock-screen__input" type="password" id="lockInput" maxlength="8" inputmode="numeric" placeholder="密码">
      <div class="flex gap-3 mt-3" style="width:260px">
        <button class="btn flex-1" onclick="PrivacyLock.cancel()">取消</button>
        <button class="btn btn--primary flex-1" onclick="PrivacyLock.verify('${moduleId}')">解锁</button>
      </div>
      <p class="text-faint text-xs mt-6" id="lockError"></p>
    `;
    root.appendChild(overlay);
    const inp = document.getElementById('lockInput');
    inp.focus();
    inp.onkeydown = (e) => { if (e.key === 'Enter') PrivacyLock.verify(moduleId); };

    // 自动锁定计时（5分钟无操作锁定）
    this._startAutoLock(moduleId);
  },

  async verify(moduleId) {
    const input = document.getElementById('lockInput').value;
    const stored = await DB.getSetting('privacy_password');
    const hash = await this._hash(input);
    if (hash === stored) {
      App.state.privacyUnlocked[moduleId] = true;
      document.getElementById('lockOverlay').remove();
      App.navigate(moduleId);
      UI.toast('已解锁', 'success', 1500);
    } else {
      const err = document.getElementById('lockError');
      err.textContent = '密码错误，请重试';
      err.style.color = 'var(--color-danger)';
      document.getElementById('lockInput').value = '';
    }
  },

  cancel() {
    document.getElementById('lockOverlay')?.remove();
  },

  _startAutoLock(moduleId) {
    if (this._autoLockTimer) clearTimeout(this._autoLockTimer);
    this._autoLockTimer = setTimeout(() => {
      App.state.privacyUnlocked[moduleId] = false;
    }, 5 * 60 * 1000); // 5分钟
  },

  async _hash(pwd) {
    const salt = 'zhaozhao_station_2026';
    const data = new TextEncoder().encode(salt + pwd);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  },

  async setPassword(pwd) {
    if (!pwd) {
      await DB.setSetting('privacy_password', null);
      return;
    }
    const hash = await this._hash(pwd);
    await DB.setSetting('privacy_password', hash);
  },
};
