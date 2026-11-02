const $ = (id) => document.getElementById(id);
const key = 'o4t-bridge-url';
const bridgeInput = $('bridge-url');
try { bridgeInput.value = localStorage.getItem(key) || bridgeInput.value; } catch (_) {}
$('save-bridge').addEventListener('click', () => {
  try { localStorage.setItem(key, bridgeInput.value.trim()); $('status-note').textContent = 'تم حفظ عنوان الجسر محلياً في هذا المتصفح.'; }
  catch (_) { $('status-note').textContent = 'تعذر الحفظ المحلي في هذا المتصفح.'; }
});
$('check-bridge').addEventListener('click', () => {
  $('bridge-status').textContent = 'لم يتم الفحص';
  $('bridge-status').className = 'warn';
  $('receiver-status').textContent = 'غير متصل';
  $('status-note').textContent = 'لم يتم تنفيذ فحص فعلي بعد: يلزم أولاً مطابقة مسار الصحة (Health Endpoint) وسياسة CORS مع نسخة Bridge الموجودة لديك.';
});
// Intentionally no receiver command execution until the real Bridge API is inspected and secured.