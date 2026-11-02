const $ = (id) => document.getElementById(id);
const key = 'o4t-bridge-url';
const bridgeInput = $('bridge-url');
let receiverCredentials = null;

try {
  bridgeInput.value = localStorage.getItem(key) || bridgeInput.value;
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
  const match = source.match(new RegExp('(?:^|\\\\s)' + name + '=([^\\\\s]+)', 'm'));
  return match ? match[1] : '';
}

function updateDeviceSummary(output) {
  if (!output || !output.includes('image-version')) return;
  const panel = $('device-summary');
  const brand = readField(output, 'machine_brand');
  const model = readField(output, 'machine_name');
  const version = readField(output, 'version');
  const build = readField(output, 'build');
  const distro = readField(output, 'distro');
  const uptimeSection = output.split('--- uptime ---')[1] || '';
  const uptime = uptimeSection.trim().split('\\n')[0].trim();
  $('device-model').textContent = [brand, model].filter(Boolean).join(' ') || 'Enigma2';
  $('device-image').textContent = [distro, version].filter(Boolean).join(' ') || 'غير محدد';
  $('device-build').textContent = build || 'غير متاح';
  $('device-uptime').textContent = uptime || 'غير متاح';
  panel.hidden = false;
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
    showOutput(data.output || 'تم الاتصال بنجاح، ولا توجد مخرجات.');
    if (operation === 'info') updateDeviceSummary(data.output || '');
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
