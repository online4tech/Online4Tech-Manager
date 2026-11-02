const $ = (id) => document.getElementById(id);
const key = 'o4t-bridge-url';
const receiverIpKey = 'o4t-receiver-ip';
const bridgeInput = $('bridge-url');
let receiverCredentials = null;

try {
  bridgeInput.value = localStorage.getItem(key) || bridgeInput.value;
  $('receiver-ip').value = localStorage.getItem(receiverIpKey) || '';
} catch (_) {}

const bridgeBase = () => bridgeInput.value.trim().replace(/\/+$/, '');

function setStatus(id, message, kind = 'muted') {
  const el = $(id);
  el.textContent = message;
  el.className = kind;
}

function showOutput(value) {
  const output = $('operation-output');
  output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}


function readField(source, name) {
  // Match a complete key only; avoid matching "version" inside "image-version".
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp('(?:^|[\\s])' + escaped + '=([^\\s]+)', 'm'));
  return match ? match[1] : '';
}

function updateDeviceSummary(output) {
  if (!output || !output.includes('image-version')) return;
  const panel = $('device-summary');
  const brand = readField(output, 'machine_brand') || readField(output, 'brand');
  const model = readField(output, 'machine_name') || readField(output, 'machinemake');
  const version = readField(output, 'version') || readField(output, 'imageversion');
  const build = readField(output, 'build') || readField(output, 'imagebuild');
  const distro = readField(output, 'distro') || readField(output, 'creator');
  const uptimeSection = output.split('--- uptime ---')[1] || '';
  const uptimeLine = uptimeSection.trim().split(String.fromCharCode(10))[0].trim();
  const uptimeMatch = uptimeLine.match(/\bup\s+(.+?)(?:,\s*\d+\s+users?|,\s*load average:|$)/i);
  const uptime = uptimeMatch ? uptimeMatch[1].trim() : uptimeLine;
  $('device-model').textContent = [brand, model].filter(Boolean).join(' ') || 'Enigma2';
  $('device-image').textContent = [distro, version].filter(Boolean).join(' ') || 'غير محدد';
  $('device-build').textContent = build || 'غير متاح';
  $('device-uptime').textContent = uptime || 'غير متاح';
  panel.hidden = false;
}


function parseFilesystemOutput(output) {
  const rows = new Map();
  for (const line of output.split(/\r?\n/).slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6 || !/^\d+%$/.test(parts[4])) continue;
    const [filesystem, size, used, available, usePercent, ...mountParts] = parts;
    const mount = mountParts.join(' ');
    const key = [filesystem, size, used, available, usePercent].join('|');
    if (!rows.has(key)) rows.set(key, { filesystem, size, used, available, percent: Number(usePercent.replace('%', '')), mounts: [] });
    if (mount && !rows.get(key).mounts.includes(mount)) rows.get(key).mounts.push(mount);
  }
  return [...rows.values()];
}

function renderStorageDashboard(output) {
  const dashboard = $('storage-dashboard');
  const entries = parseFilesystemOutput(output);
  dashboard.replaceChildren();
  if (!entries.length) { dashboard.hidden = true; return false; }
  const heading = document.createElement('div');
  heading.className = 'storage-heading';
  const title = document.createElement('b');
  title.textContent = 'ملخص وحدات التخزين';
  const note = document.createElement('span');
  const persistentCount = entries.filter(item => item.filesystem.startsWith('/dev/')).length;
  const temporaryCount = entries.length - persistentCount;
  note.textContent = entries.length + ' وحدات فريدة — ' + persistentCount + ' تخزين/نظام و' + temporaryCount + ' مؤقتة';
  heading.append(title, note);
  dashboard.append(heading);
  const grid = document.createElement('div');
  grid.className = 'storage-grid';
  entries.sort((a,b) => (a.filesystem.startsWith('/dev/') ? 0 : 1) - (b.filesystem.startsWith('/dev/') ? 0 : 1));
  for (const item of entries) {
    const card = document.createElement('article');
    card.className = 'storage-item';
    const top = document.createElement('div');
    top.className = 'storage-item-top';
    const fs = document.createElement('b'); fs.textContent = item.filesystem;
    const meta = document.createElement('div'); meta.className = 'storage-item-meta';
    const kind = document.createElement('span');
    kind.className = 'storage-kind';
    kind.textContent = item.filesystem === 'tmpfs' || item.filesystem === 'devtmpfs' ? 'ذاكرة مؤقتة' : item.filesystem === '/dev/root' ? 'قسم نظام' : 'وحدة تخزين';
    const percent = document.createElement('strong'); percent.textContent = item.percent + '%';
    meta.append(kind, percent);
    top.append(fs, meta);
    const details = document.createElement('div'); details.className = 'storage-values';
    for (const [label,value] of [['الإجمالي',item.size],['المستخدم',item.used],['المتاح',item.available]]) {
      const cell=document.createElement('div'), small=document.createElement('span'), strong=document.createElement('b');
      small.textContent=label; strong.textContent=value; cell.append(small,strong); details.append(cell);
    }
    const track=document.createElement('div'); track.className='storage-track';
    const fill=document.createElement('span'); fill.style.width=Math.max(0,Math.min(100,item.percent))+'%'; track.append(fill);
    const mounts=document.createElement('p'); mounts.className='storage-mounts';
    mounts.textContent='نقاط الربط: '+item.mounts.join(' ، ');
    card.append(top,details,track,mounts); grid.append(card);
  }
  dashboard.append(grid); dashboard.hidden=false; return true;
}


function parseServiceOutput(output) {
  const sections = {};
  let section = '';
  for (const line of output.split(/\r?\n/)) {
    const heading = line.match(/^---\s*(.*?)\s*---$/);
    if (heading) { section = heading[1].toLowerCase(); sections[section] = []; continue; }
    if (section && /^\d+\s+/.test(line.trim())) sections[section].push(line.trim());
  }
  const enigmaLines = (sections['enigma2'] || []).filter(line => /\/usr\/bin\/enigma2(?:\.sh)?(?:\s|$)/.test(line));
  const caLines = sections['oscam / ncam / cccam'] || [];
  const pick = regex => caLines.filter(line => regex.test(line));
  return [
    { name: 'Enigma2', processes: enigmaLines, detail: 'محرك واجهة الرسيفر' },
    { name: 'OSCam', processes: pick(/OSCam/i), detail: 'خدمة OSCam' },
    { name: 'NCam', processes: pick(/NCam/i), detail: 'خدمة NCam' },
    { name: 'CCcam', processes: pick(/CCcam/i), detail: 'خدمة CCcam' }
  ];
}

function renderServicesDashboard(output) {
  const dashboard = $('services-dashboard');
  const services = parseServiceOutput(output);
  dashboard.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'storage-heading';
  const title = document.createElement('b');
  title.textContent = 'حالة خدمات الرسيفر';
  const note = document.createElement('span');
  const running = services.filter(item => item.processes.length).length;
  note.textContent = running + ' خدمات ظهرت لها عمليات من أصل ' + services.length;
  heading.append(title, note);
  dashboard.append(heading);
  const grid = document.createElement('div');
  grid.className = 'services-grid';
  for (const service of services) {
    const card = document.createElement('article');
    card.className = 'service-item';
    const top = document.createElement('div');
    top.className = 'service-item-top';
    const name = document.createElement('b');
    name.textContent = service.name;
    const status = document.createElement('span');
    status.className = service.processes.length ? 'service-status is-running' : 'service-status is-unknown';
    status.textContent = service.processes.length ? 'يعمل — مرصود' : 'لم تُرصد عملية';
    top.append(name, status);
    const desc = document.createElement('p');
    desc.className = 'service-description';
    desc.textContent = service.detail;
    const count = document.createElement('div');
    count.className = 'service-count';
    count.textContent = service.processes.length ? 'عدد العمليات: ' + service.processes.length : 'لا توجد عملية مطابقة في نتيجة الفحص';
    card.append(top, desc, count);
    if (service.processes.length) {
      const list = document.createElement('ul');
      list.className = 'service-process-list';
      for (const process of service.processes) {
        const item = document.createElement('li');
        const pid = document.createElement('b');
        pid.textContent = 'PID ' + process.split(/\s+/, 1)[0];
        const command = document.createElement('code');
        command.textContent = process.replace(/^\d+\s+/, '');
        item.append(pid, command);
        list.append(item);
      }
      card.append(list);
    }
    grid.append(card);
  }
  dashboard.append(grid);
  dashboard.hidden = false;
  return true;
}

const backupHistoryKey = 'o4t-backup-history';
const backupHistoryLimit = 30;

function readBackupHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(backupHistoryKey) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.filename === 'string') : [];
  } catch (_) { return []; }
}

function formatBackupSize(bytes) {
  return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function saveBackupHistory(items) {
  try {
    localStorage.setItem(backupHistoryKey, JSON.stringify(items.slice(0, backupHistoryLimit)));
    return true;
  } catch (_) {
    const message = 'تعذر حفظ سجل النسخ في المتصفح؛ قد تكون مساحة التخزين ممتلئة أو غير متاحة.';
    const note = $('backup-status');
    if (note) { note.textContent = message; note.className = 'backup-status is-warning'; }
    return false;
  }
}

function renderBackupHistory() {
  const list = $('backup-history-list');
  if (!list) return;
  const items = readBackupHistory();
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'backup-history-empty';
    empty.textContent = 'لا توجد نسخ مسجلة حتى الآن.';
    list.append(empty);
    return;
  }
  for (const record of items) {
    const row = document.createElement('article');
    row.className = 'backup-history-item';
    const details = document.createElement('div');
    details.className = 'backup-history-details';
    const name = document.createElement('b');
    name.textContent = record.filename;
    const meta = document.createElement('span');
    meta.textContent = formatBackupSize(Number(record.size) || 0) + ' · ' + new Date(record.createdAt).toLocaleString('ar-EG');
    const state = document.createElement('small');
    state.textContent = 'بدأ التنزيل من المتصفح';
    details.append(name, meta, state);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button danger';
    remove.textContent = 'حذف من السجل';
    remove.addEventListener('click', () => {
      saveBackupHistory(readBackupHistory().filter(item => item.id !== record.id));
      renderBackupHistory();
    });
    row.append(details, remove);
    list.append(row);
  }
}

renderBackupHistory();

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label || 'جارٍ التنفيذ...';
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }
}

$('save-bridge').addEventListener('click', () => {
  try {
    const url = new URL(bridgeBase());
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
      throw new Error('عنوان الجسر لازم يكون http://127.0.0.1 على هذا الكمبيوتر.');
    }
    localStorage.setItem(key, url.origin);
    bridgeInput.value = url.origin;
    $('status-note').textContent = 'تم حفظ عنوان الجسر محلياً في هذا المتصفح.';
  } catch (error) {
    $('status-note').textContent = error.message || 'تعذر حفظ العنوان. راجع عنوان الجسر.';
  }
});

$('check-bridge').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, 'جارٍ فحص الجسر...');
  setStatus('bridge-status', 'جارٍ الفحص', 'warn');
  try {
    const response = await fetch(bridgeBase() + '/health', { method: 'GET', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'الجسر لم يستجب بالشكل المتوقع.');
    setStatus('bridge-status', 'متصل — إصدار ' + (data.version || 'غير معروف'), 'ok');
    $('status-note').textContent = 'الجسر المحلي يعمل. الخطوة التالية هي اختبار اتصال SSH بالرسيفر.';
  } catch (error) {
    setStatus('bridge-status', 'غير متاح', 'warn');
    $('status-note').textContent = 'تعذر الوصول للجسر: ' + (error.message || 'خطأ اتصال أو CORS.');
  } finally {
    setBusy(button, false);
  }
});

async function runReceiverOperation(operation, button) {
  if (!receiverCredentials) {
    showOutput('اكتب بيانات الرسيفر واضغط «اختبار اتصال الرسيفر» أولاً.');
    return;
  }
  setBusy(button, true);
  showOutput('جارٍ الاتصال بالرسيفر وتنفيذ الفحص...');
  try {
    const response = await fetch(bridgeBase() + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ ...receiverCredentials, operation })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || data.stderr || 'فشل تنفيذ العملية.');
    }
    setStatus('receiver-status', 'متصل', 'ok');
    const operationOutput = data.output || 'تم الاتصال بنجاح، ولا توجد مخرجات.';
    showOutput(operationOutput);
    if (operation === 'info') updateDeviceSummary(operationOutput);
    if (operation === 'space') renderStorageDashboard(operationOutput);
    if (operation === 'services') renderServicesDashboard(operationOutput);
  } catch (error) {
    setStatus('receiver-status', 'تعذر الاتصال', 'warn');
    showOutput('تعذر تنفيذ الطلب: ' + (error.message || 'خطأ غير معروف') +
      '\n\nراجع عنوان IP وكلمة المرور، وتأكد من تفعيل SSH، ومن تسجيل بصمة SSH للرسيفر على الكمبيوتر.');
  } finally {
    setBusy(button, false);
  }
}

$('test-receiver').addEventListener('click', async (event) => {
  const host = $('receiver-ip').value.trim();
  const username = $('receiver-user').value.trim() || 'root';
  const password = $('receiver-pass').value;
  if (!host || !password) {
    showOutput('اكتب عنوان IP وكلمة مرور SSH أولاً. لن يتم حفظ كلمة المرور.');
    return;
  }
  receiverCredentials = { host, port: 22, username, password };
  try { localStorage.setItem(receiverIpKey, host); } catch (_) {}
  await runReceiverOperation('info', event.currentTarget);
});

document.querySelectorAll('[data-operation]').forEach((button) => {
  button.addEventListener('click', () => runReceiverOperation(button.dataset.operation, button));
});

$('download-backup').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = $('backup-status');
  const setBackupStatus = (message, kind = 'muted') => {
    if (status) {
      status.textContent = message;
      status.className = 'backup-status ' + kind;
    }
  };
  if (!receiverCredentials) {
    const message = 'اختبر اتصال الرسيفر أولاً قبل إنشاء النسخة.';
    showOutput(message);
    setBackupStatus(message, 'is-warning');
    return;
  }
  setBusy(button, true, 'جارٍ إنشاء النسخة...');
  setBackupStatus('جارٍ تجهيز ملفات الإعدادات من الرسيفر…', 'is-progress');
  showOutput('جارٍ إنشاء النسخة الاحتياطية وتنزيلها على الكمبيوتر...');
  try {
    const response = await fetch(bridgeBase() + '/download-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(receiverCredentials)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'تعذر إنشاء النسخة الاحتياطية.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('ملف النسخة الاحتياطية وصل فارغاً.');
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
      pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const filename = 'online4tech-enigma2-backup-' + stamp + '.tar.gz';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    const size = blob.size < 1024 * 1024
      ? (blob.size / 1024).toFixed(1) + ' KB'
      : (blob.size / (1024 * 1024)).toFixed(2) + ' MB';
    const time = now.toLocaleString('ar-EG');
    const history = readBackupHistory();
    history.unshift({ id: stamp + '-' + blob.size, filename, size: blob.size, createdAt: now.toISOString() });
    saveBackupHistory(history);
    renderBackupHistory();
    const success = 'تم تجهيز النسخة وبدء تنزيلها — ' + size + ' — ' + time;
    setBackupStatus(success, 'is-success');
    showOutput(success + '\nاسم الملف: ' + filename + '\nالمحتويات: /etc/enigma2 و /etc/tuxbox');
  } catch (error) {
    const message = 'فشل النسخ الاحتياطي: ' + (error.message || 'خطأ غير معروف');
    setBackupStatus(message, 'is-warning');
    showOutput(message);
  } finally {
    setBusy(button, false);
  }
});

$('clear-backup-history')?.addEventListener('click', () => {
  if (!readBackupHistory().length) return;
  if (window.confirm('هل تريد مسح سجل النسخ الاحتياطية من هذا المتصفح؟ لن يتم حذف ملفات النسخ من الكمبيوتر.')) {
    saveBackupHistory([]);
    renderBackupHistory();
  }
});

window.addEventListener('beforeunload', () => {
  receiverCredentials = null;
});
