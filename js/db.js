/**
 * 昭昭专属个人站 - 数据持久化层
 * 基于 IndexedDB，固定数据库名称，支持版本迁移
 *
 * 核心原则：
 * - 界面与数据彻底分离，升级只改界面不改数据
 * - 启动时已有数据只读取不覆盖
 * - 每次迁移前自动备份
 * - 数据库/表名/键名一经确定不随意改变
 */

// ============ 常量定义（固定身份，不得随意修改） ============
const DB_NAME = 'zhaozhao_station_db';       // 固定数据库名
const DB_VERSION = 1;                          // 数据版本号
const LS_PREFIX = 'zhaozhao_';                 // localStorage 键前缀
const BACKUP_PREFIX = 'zhaozhao_backup_';      // 备份键前缀

// ============ 数据表定义 ============
// 每个表的 keyPath 为 'id'，所有记录使用 UUID
const STORE_DEFS = [
  { name: 'settings',        keyPath: 'key' },           // 设置（key-value）
  { name: 'tasks',           keyPath: 'id' },            // 待办任务
  { name: 'timers',          keyPath: 'id' },            // 计时记录（已结束）
  { name: 'timer_running',   keyPath: 'id' },            // 运行中的计时器
  { name: 'projects',        keyPath: 'id' },            // 项目
  { name: 'project_tasks',   keyPath: 'id' },            // 项目子任务
  { name: 'books',           keyPath: 'id' },            // 书籍
  { name: 'book_notes',      keyPath: 'id' },            // 阅读笔记/摘录
  { name: 'workouts',        keyPath: 'id' },            // 锻炼记录
  { name: 'emotions',        keyPath: 'id' },            // 情绪记录
  { name: 'reviews',         keyPath: 'id' },            // 每日复盘
  { name: 'link_profiles',   keyPath: 'id' },            // 灵魂链接对象档案
  { name: 'link_records',    keyPath: 'id' },            // 灵魂链接记录
  { name: 'link_daily_status', keyPath: 'id' },          // 每日链接状态
  { name: 'link_wishes',     keyPath: 'id' },            // 链接星图愿望
  { name: 'link_wish_events', keyPath: 'id' },           // 愿望后续事件
  { name: 'link_treasures',  keyPath: 'id' },            // 宝物袋
  { name: 'card_decks',      keyPath: 'id' },            // 字卡卡组
  { name: 'card_items',      keyPath: 'id' },            // 字卡
  { name: 'card_draws',      keyPath: 'id' },            // 抽卡记录
  { name: 'ai_resources',    keyPath: 'id' },            // AI 资料（角色卡/预设/世界书/长记忆）
  { name: 'ai_connections',  keyPath: 'id' },            // AI 连接配置
  { name: 'ai_conversations', keyPath: 'id' },           // 对话
  { name: 'ai_messages',     keyPath: 'id' },            // 对话消息
  { name: 'ai_branches',     keyPath: 'id' },            // 分支记录
  { name: 'ai_memories',     keyPath: 'id' },            // 长记忆
  { name: 'ai_proactive',    keyPath: 'id' },            // 角色主动消息
  { name: 'reminders',       keyPath: 'id' },            // 提醒
  { name: 'attachments',     keyPath: 'id' },            // 附件/图片
  { name: 'relations',       keyPath: 'id' },            // 关联关系
  { name: 'bookmarks',       keyPath: 'id' },            // 书签收藏
  { name: 'audit_log',       keyPath: 'id' },            // 审计日志
  { name: 'backups_meta',    keyPath: 'id' },            // 备份元数据
];

// ============ 工具函数 ============
function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function nowISO() {
  // 本地时区的 ISO 格式（YYYY-MM-DDTHH:mm:ss.sss），不带 Z
  // 避免显示 UTC 时间导致与用户感知差 8 小时
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ============ IndexedDB 封装 ============
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      // 创建所有表（仅在不存在时创建）
      STORE_DEFS.forEach(def => {
        if (!db.objectStoreNames.contains(def.name)) {
          db.createObjectStore(def.name, { keyPath: def.keyPath });
        }
      });
      // 记录迁移日志
      console.log(`[DB] 升级: ${oldVersion} -> ${DB_VERSION}`);
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txStore(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName, 'readwrite');
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName, 'readwrite');
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function dbClear(storeName) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName, 'readwrite');
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function dbCount(storeName) {
  return new Promise((resolve, reject) => {
    const store = txStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============ 高级 API ============
const DB = {
  name: DB_NAME,
  version: DB_VERSION,

  async init() {
    await openDB();
    console.log(`[DB] 已打开: ${DB_NAME} v${DB_VERSION}`);
    // 检查是否首次使用
    const settings = await dbGetAll('settings');
    return settings.length === 0;
  },

  async isNewUser() {
    const settings = await dbGetAll('settings');
    return settings.length === 0;
  },

  // 设置
  async getSetting(key, defaultVal = null) {
    const r = await dbGet('settings', key);
    return r ? r.value : defaultVal;
  },
  async setSetting(key, value) {
    await dbPut('settings', { key, value, updated_at: nowISO() });
    return value;
  },
  async getAllSettings() {
    const arr = await dbGetAll('settings');
    const obj = {};
    arr.forEach(s => obj[s.key] = s.value);
    return obj;
  },

  // 通用 CRUD
  async list(storeName) { return dbGetAll(storeName); },
  async get(storeName, id) { return dbGet(storeName, id); },
  async save(storeName, record) {
    if (!record.id) record.id = uuid();
    record.updated_at = nowISO();
    if (!record.created_at) record.created_at = nowISO();
    if (!record.data_version) record.data_version = DB_VERSION;
    if (!record.deleted_at) record.deleted_at = null;
    await dbPut(storeName, record);
    return record;
  },
  async softDelete(storeName, id) {
    const r = await dbGet(storeName, id);
    if (r) { r.deleted_at = nowISO(); await dbPut(storeName, r); }
    return true;
  },
  async hardDelete(storeName, id) { return dbDelete(storeName, id); },
  async count(storeName) { return dbCount(storeName); },

  // ============ 时间戳迁移（UTC → 本地时区） ============
  // 历史数据中 created_at / updated_at / deleted_at 使用 toISOString() 生成 UTC
  // （如 2026-08-19T10:30:19.123Z），渲染时直接 slice(11,16) 会显示 UTC 时间，
  // 与用户感知差 8 小时。本方法把所有带 'Z' 后缀的时间字段转换为本地时区字符串。
  async migrateUTCTimestamps() {
    if (localStorage.getItem('ts_migrated_v1') === '1') return { skipped: true };
    let fixed = 0;
    const isoZ = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    function toLocal(iso) {
      if (typeof iso !== 'string' || !isoZ.test(iso)) return iso;
      const d = new Date(iso);  // 按 UTC 解析
      const pad = (n, l = 2) => String(n).padStart(l, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }
    const tsFields = ['created_at', 'updated_at', 'deleted_at'];
    const allStores = STORE_DEFS.map(s => s.name);
    for (const store of allStores) {
      let rows;
      try { rows = await dbGetAll(store); } catch (e) { continue; }
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        let dirty = false;
        for (const f of tsFields) {
          if (typeof row[f] === 'string' && isoZ.test(row[f])) {
            row[f] = toLocal(row[f]);
            dirty = true;
          }
        }
        // 某些表里把时间戳存在 settings.value 里等嵌套字段，跳过避免误伤
        if (dirty) {
          await dbPut(store, row);
          fixed++;
        }
      }
    }
    localStorage.setItem('ts_migrated_v1', '1');
    return { fixed };
  },

  // ============ 备份与恢复 ============
  async createBackup(reason = 'manual') {
    const ts = nowISO();
    const backupId = `${BACKUP_PREFIX}${ts.replace(/[:.]/g, '-')}`;
    const allData = {};
    for (const def of STORE_DEFS) {
      if (def.name === 'backups_meta') continue;
      allData[def.name] = await dbGetAll(def.name);
    }
    const meta = {
      id: backupId,
      created_at: ts,
      reason,
      data: allData,
      store_count: Object.keys(allData).length,
      record_count: Object.values(allData).reduce((s, a) => s + a.length, 0),
    };
    await dbPut('backups_meta', meta);
    // 保留最近 10 份
    const allBackups = (await dbGetAll('backups_meta')).sort((a,b) => b.created_at.localeCompare(a.created_at));
    for (let i = 10; i < allBackups.length; i++) {
      await dbDelete('backups_meta', allBackups[i].id);
    }
    return meta;
  },

  async listBackups() {
    return (await dbGetAll('backups_meta')).sort((a,b) => b.created_at.localeCompare(a.created_at));
  },

  async restoreBackup(backupId) {
    // 恢复前先备份当前数据
    await this.createBackup('pre-restore');
    const backup = await dbGet('backups_meta', backupId);
    if (!backup) throw new Error('备份不存在');
    for (const def of STORE_DEFS) {
      if (def.name === 'backups_meta') continue;
      await dbClear(def.name);
      const records = backup.data[def.name] || [];
      for (const r of records) {
        await dbPut(def.name, r);
      }
    }
    return backup;
  },

  // 导出 JSON
  async exportJSON() {
    const allData = {};
    for (const def of STORE_DEFS) {
      allData[def.name] = await dbGetAll(def.name);
    }
    return JSON.stringify({
      _meta: {
        app: 'zhaozhao-station',
        version: DB_VERSION,
        exported_at: nowISO(),
        record_count: Object.values(allData).reduce((s,a)=>s+a.length,0),
      },
      data: allData,
    }, null, 2);
  },

  async exportCSV(storeName) {
    const records = await dbGetAll(storeName);
    if (records.length === 0) return '';
    const keys = new Set();
    records.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
    const headers = [...keys];
    const lines = [headers.join(',')];
    records.forEach(r => {
      lines.push(headers.map(h => {
        const v = r[h];
        if (v == null) return '';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','));
    });
    return lines.join('\n');
  },

  // 导入 JSON
  async importJSON(jsonStr, mode = 'merge') {
    const parsed = JSON.parse(jsonStr);
    const data = parsed.data || parsed;
    if (mode === 'replace') {
      await this.createBackup('pre-import-replace');
      for (const def of STORE_DEFS) {
        if (def.name === 'backups_meta') continue;
        await dbClear(def.name);
      }
    }
    let count = 0;
    for (const def of STORE_DEFS) {
      if (def.name === 'backups_meta') continue;
      const records = data[def.name] || [];
      for (const r of records) {
        await dbPut(def.name, r);
        count++;
      }
    }
    return count;
  },

  // ============ 数据健康检查 ============
  async healthCheck() {
    const stores = {};
    let totalRecords = 0;
    for (const def of STORE_DEFS) {
      const c = await dbCount(def.name);
      stores[def.name] = c;
      if (def.name !== 'backups_meta') totalRecords += c;
    }
    const backups = await this.listBackups();
    const settings = await this.getSetting('db_initialized_at', null);
    // 估算存储大小
    let estSize = 0;
    try {
      const est = await navigator.storage.estimate();
      estSize = est.usage || 0;
    } catch(e) {}
    return {
      db_name: DB_NAME,
      db_version: DB_VERSION,
      initialized_at: settings,
      last_check: nowISO(),
      stores,
      total_records: totalRecords,
      backup_count: backups.length,
      last_backup: backups[0]?.created_at || null,
      storage_usage: estSize,
      persistent: await this.checkPersistent(),
    };
  },

  async checkPersistent() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persisted();
      }
    } catch(e) {}
    return false;
  },

  async requestPersistent() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    } catch(e) {}
    return false;
  },

  // ============ 每日重置（只重置今日视图，不删历史） ============
  async dailyReset() {
    // 只清除今日任务完成状态标记，不动历史记录
    const today = todayKey();
    const tasks = await dbGetAll('tasks');
    let changed = 0;
    for (const t of tasks) {
      if (t.completed_date && t.completed_date !== today && t.reset_daily) {
        t.completed = false;
        t.completed_date = null;
        t.updated_at = nowISO();
        await dbPut('tasks', t);
        changed++;
      }
    }
    return { reset_count: changed, date: today };
  },

  // 附件存储（图片用 base64 存 IndexedDB）
  async saveAttachment(file, meta = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const id = uuid();
        const record = {
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          data: reader.result,  // base64 data URL
          ...meta,
          created_at: nowISO(),
        };
        await dbPut('attachments', record);
        resolve(record);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async getAttachment(id) { return dbGet('attachments', id); },

  // 审计日志
  async log(action, detail = {}) {
    await dbPut('audit_log', {
      id: uuid(),
      action,
      detail,
      created_at: nowISO(),
    });
  },
};

// 导出
window.DB = DB;
window.uuid = uuid;
window.nowISO = nowISO;
window.todayKey = todayKey;
