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
  if (!receiverCredentials) {
    showOutput('اختبر اتصال الرسيفر أولاً.');
    return;
  }
  setBusy(button, true, 'جارٍ إنشاء النسخة...');
  showOutput('جارٍ إنشاء النسخة الاحتياطية. قد تستغرق العملية بعض الوقت...');
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'online4tech-enigma2-backup.tar.gz';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showOutput('تم تجهيز ملف النسخة الاحتياطية وبدء تنزيله على الكمبيوتر.');
  } catch (error) {
    showOutput('فشل النسخ الاحتياطي: ' + (error.message || 'خطأ غير معروف'));
  } finally {
    setBusy(button, false);
  }
});

window.addEventListener('beforeunload', () => {
  receiverCredentials = null;
});
